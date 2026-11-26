import { Hono } from 'hono'
import type pg from 'pg'
import type { Auth } from '../auth'
import { planOf } from '../plans'
import { StripeError, verifyWebhook, type Interval, type Stripe, type StripeSubscription } from './stripe'
import { applySubscription, customerOf, saveCustomer, userForSubscription } from './sync'

class BillingRefusal extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 502 | 503,
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

/**
 * Remind Pro com a Stripe.
 * - A app pede um link (/link) e abre-o no browser: a página /pro já sabe quem é a pessoa.
 * - /checkout leva à página de pagamento da Stripe; /portal à gestão da subscrição.
 * - /webhook recebe os avisos da Stripe e liga ou desliga o Pro na conta.
 */
export function billingRoutes(auth: Auth, pool: pg.Pool, baseURL: string, stripe: Stripe | null, webhookSecret: string | null) {
  const app = new Hono<{ Variables: { user: { id: string; email: string; name: string } } }>()

  app.onError((error, c) => {
    if (error instanceof BillingRefusal) return c.json({ error: error.message, ...(error.code && { code: error.code }) }, error.status)
    if (error instanceof StripeError) {
      console.error('[stripe]', error.status, error.message)
      return c.json({ error: 'Os pagamentos não responderam. Tenta daqui a pouco.' }, 502)
    }
    throw error
  })

  // ---------- Webhook (sem sessão: a assinatura prova que veio da Stripe) ----------
  app.post('/webhook', async (c) => {
    if (!stripe || !webhookSecret) throw new BillingRefusal(503, 'Pagamentos não configurados')
    const payload = await c.req.text()
    let event
    try {
      event = verifyWebhook(payload, c.req.header('stripe-signature'), webhookSecret)
    } catch {
      return c.json({ error: 'Assinatura inválida' }, 400)
    }
    const obj = event.data.object as Record<string, unknown>
    let subscriptionId: string | null = null
    let hint: string | null = null
    if (event.type === 'checkout.session.completed') {
      subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null
      hint = typeof obj.client_reference_id === 'string' ? obj.client_reference_id : null
      if (hint && typeof obj.customer === 'string') {
        const exists = await pool.query(`select 1 from "user" where id = $1`, [hint])
        if (exists.rowCount) await saveCustomer(pool, hint, obj.customer)
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      subscriptionId = typeof obj.id === 'string' ? obj.id : null
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null
    }
    if (!subscriptionId) return c.json({ received: true })
    // Os avisos podem chegar fora de ordem: pede sempre o estado atual à Stripe.
    const sub: StripeSubscription = await stripe.getSubscription(subscriptionId)
    const userId = await userForSubscription(pool, sub, hint)
    if (!userId) {
      console.warn('[stripe] subscrição sem conta Remind:', sub.id)
      return c.json({ received: true })
    }
    await applySubscription(pool, userId, sub)
    return c.json({ received: true })
  })

  // ---------- Pedidos com sessão (app com token, ou página /pro com cookie) ----------
  app.use('*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'Sessão inválida' }, 401)
    c.set('user', { id: session.user.id, email: session.user.email, name: session.user.name })
    await next()
  })

  app.get('/status', async (c) => {
    const user = c.get('user')
    const [plan, ent, customer] = await Promise.all([
      planOf(pool, user.id),
      pool.query<{ source: string; expires_at: Date | null }>(`select source, expires_at from entitlement where user_id = $1`, [user.id]),
      customerOf(pool, user.id)
    ])
    const row = ent.rows[0]
    return c.json({
      email: user.email,
      plan,
      source: plan === 'pro' ? (row?.source ?? null) : null,
      expiresAt: plan === 'pro' && row?.expires_at ? row.expires_at.toISOString() : null,
      available: Boolean(stripe),
      canManage: Boolean(stripe && customer)
    })
  })

  // A app abre este link no browser e a página /pro entra com a sessão da app.
  app.post('/link', async (c) => {
    const { token } = await auth.api.generateOneTimeToken({ headers: c.req.raw.headers })
    return c.json({ url: `${baseURL}/pro/entrar?token=${encodeURIComponent(token)}` })
  })

  app.post('/checkout', async (c) => {
    if (!stripe) throw new BillingRefusal(503, 'Os pagamentos ainda não estão disponíveis.', 'BILLING_UNAVAILABLE')
    const user = c.get('user')
    const body = (await c.req.json().catch(() => ({}))) as { interval?: unknown }
    const interval = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null
    if (!interval) throw new BillingRefusal(400, 'Escolhe mensal ou anual')
    if ((await planOf(pool, user.id)) === 'pro') throw new BillingRefusal(409, 'Já tens o Remind Pro.', 'ALREADY_PRO')
    let customer = await customerOf(pool, user.id)
    if (!customer) {
      customer = (await stripe.createCustomer({ email: user.email, name: user.name, userId: user.id })).id
      await saveCustomer(pool, user.id, customer)
    }
    const session = await stripe.createCheckout({
      customer,
      price: stripe.prices[interval as Interval],
      userId: user.id,
      successUrl: `${baseURL}/pro/obrigado?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseURL}/pro`
    })
    return c.json({ url: session.url })
  })

  app.post('/portal', async (c) => {
    if (!stripe) throw new BillingRefusal(503, 'Os pagamentos ainda não estão disponíveis.', 'BILLING_UNAVAILABLE')
    const customer = await customerOf(pool, c.get('user').id)
    if (!customer) throw new BillingRefusal(404, 'Ainda não tens nenhuma subscrição.', 'NO_SUBSCRIPTION')
    const { url } = await stripe.createPortal({ customer, returnUrl: `${baseURL}/pro` })
    return c.json({ url })
  })

  return app
}
