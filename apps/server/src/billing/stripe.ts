// Cliente mínimo da API da Stripe (só o que o Remind usa) e verificação dos webhooks.
// O `fetch` é injetável para os testes simularem a Stripe.
import { createHmac, timingSafeEqual } from 'node:crypto'

export type Fetch = typeof fetch
export type Interval = 'month' | 'year'

export const STRIPE_API = 'https://api.stripe.com'

export interface StripeSettings {
  secretKey: string
  webhookSecret: string
  prices: Record<Interval, string>
  /** Só para testes: outra morada para a API da Stripe. */
  apiBase?: string
}

export class StripeError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export interface StripeSubscription {
  id: string
  customer: string
  status: string
  cancel_at_period_end?: boolean
  current_period_end?: number
  metadata?: Record<string, string>
  items?: { data?: { current_period_end?: number; price?: { id?: string; recurring?: { interval?: string } } }[] }
}

/** Fim do período pago (a Stripe mudou o campo para os itens nas versões recentes da API). */
export function periodEnd(sub: StripeSubscription): number | null {
  return sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null
}

/** { a: { b: 1 } } → "a[b]=1" (o formato que a Stripe aceita). */
function encode(params: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (typeof value === 'object') encode(value as Record<string, unknown>, name, out)
    else out.append(name, String(value))
  }
  return out
}

export function createStripe(settings: StripeSettings, fetchImpl: Fetch = fetch) {
  const base = settings.apiBase ?? STRIPE_API

  async function call<T>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${settings.secretKey}`,
          ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
        },
        body: params ? encode(params).toString() : undefined
      })
    } catch {
      throw new StripeError(502, 'Sem ligação à Stripe')
    }
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    if (!res.ok) throw new StripeError(res.status, data?.error?.message ?? `Stripe: ${res.status}`)
    return data as T
  }

  return {
    prices: settings.prices,
    createCustomer: (input: { email: string; name?: string; userId: string }) =>
      call<{ id: string }>('POST', '/v1/customers', { email: input.email, name: input.name || undefined, metadata: { user_id: input.userId } }),

    createCheckout: (input: { customer: string; price: string; userId: string; successUrl: string; cancelUrl: string }) =>
      call<{ id: string; url: string }>('POST', '/v1/checkout/sessions', {
        mode: 'subscription',
        customer: input.customer,
        client_reference_id: input.userId,
        line_items: { 0: { price: input.price, quantity: 1 } },
        subscription_data: { metadata: { user_id: input.userId } },
        allow_promotion_codes: true,
        locale: 'pt',
        success_url: input.successUrl,
        cancel_url: input.cancelUrl
      }),

    createPortal: (input: { customer: string; returnUrl: string }) =>
      call<{ url: string }>('POST', '/v1/billing_portal/sessions', { customer: input.customer, return_url: input.returnUrl }),

    getSubscription: (id: string) => call<StripeSubscription>('GET', `/v1/subscriptions/${encodeURIComponent(id)}`)
  }
}

export type Stripe = ReturnType<typeof createStripe>

export interface StripeEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

/**
 * Confirma que o webhook veio da Stripe: assinatura HMAC-SHA256 de "<t>.<corpo>" com o segredo do webhook,
 * e no máximo 5 minutos de diferença (contra repetições).
 */
export function verifyWebhook(payload: string, header: string | undefined, secret: string, now = Date.now(), toleranceSec = 300): StripeEvent {
  if (!header) throw new StripeError(400, 'Falta a assinatura')
  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.split('=')
    if (k === 't' && v) timestamp = v
    if (k === 'v1' && v) signatures.push(v)
  }
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) throw new StripeError(400, 'Assinatura inválida')
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSec) throw new StripeError(400, 'Assinatura expirada')
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest()
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!ok) throw new StripeError(400, 'Assinatura inválida')
  const event = JSON.parse(payload) as StripeEvent
  if (!event?.type || !event.data?.object) throw new StripeError(400, 'Evento inválido')
  return event
}

/** Assina um corpo como a Stripe faria (para os testes). */
export function signWebhook(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return `t=${timestamp},v1=${sig}`
}
