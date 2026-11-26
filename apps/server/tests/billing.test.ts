import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createStripe, signWebhook, verifyWebhook } from '../src/billing/stripe'
import { stripeSettings } from '../src/config'
import { createHarness } from './helpers/harness'

// A Stripe é simulada: guardamos os pedidos e respondemos como ela.
const WHSEC = 'whsec_teste'
const calls: { method: string; path: string; form: URLSearchParams; auth: string | null }[] = []
const subscriptions = new Map<string, Record<string, unknown>>()

const fakeStripe: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  const form = new URLSearchParams(init?.body ? String(init.body) : '')
  calls.push({ method, path: url.pathname, form, auth: new Headers(init?.headers).get('authorization') })
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  if (url.pathname === '/v1/customers') return json({ id: `cus_${randomUUID()}` })
  if (url.pathname === '/v1/checkout/sessions') return json({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' })
  if (url.pathname === '/v1/billing_portal/sessions') return json({ url: 'https://billing.stripe.com/p/session/1' })
  const sub = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/)
  if (sub) {
    const found = subscriptions.get(decodeURIComponent(sub[1]!))
    return found ? json(found) : json({ error: { message: 'No such subscription' } }, 404)
  }
  return json({ error: { message: 'não simulado' } }, 404)
}

const stripe = createStripe({ secretKey: 'sk_test_x', webhookSecret: WHSEC, prices: { month: 'price_mes', year: 'price_ano' }, apiBase: 'https://stripe.test' }, fakeStripe)
const h = createHarness({ stripe, stripeWebhookSecret: WHSEC })
let alice: ReturnType<typeof h.client>
let aliceId: string
const inAMonth = () => Math.floor(Date.now() / 1000) + 30 * 86400

async function webhook(type: string, object: Record<string, unknown>, signature?: string) {
  const payload = JSON.stringify({ id: `evt_${randomUUID()}`, type, data: { object } })
  return h.app.request('http://localhost:8787/api/billing/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature ?? signWebhook(payload, WHSEC) },
    body: payload
  })
}
const plan = async () => (await alice('/api/me')).json.plan

beforeAll(async () => {
  await h.setup()
  const email = `pro-${randomUUID()}@exemplo.pt`
  await h.createVerifiedUser(email)
  alice = h.client({ bearer: await h.desktopLogin(email) })
  aliceId = (await h.pool.query<{ id: string }>('select id from "user" where email = $1', [email])).rows[0]!.id
})
afterAll(() => h.pool.end())
beforeEach(() => {
  calls.length = 0
})

describe('Remind Pro (Stripe)', () => {
  it('a assinatura do webhook é obrigatória e confere', async () => {
    const payload = '{"id":"evt","type":"x","data":{"object":{}}}'
    expect(() => verifyWebhook(payload, signWebhook(payload, WHSEC), WHSEC)).not.toThrow()
    expect(() => verifyWebhook(payload, signWebhook(payload, 'whsec_outro'), WHSEC)).toThrow()
    expect(() => verifyWebhook(payload, signWebhook(payload, WHSEC, Math.floor(Date.now() / 1000) - 3600), WHSEC)).toThrow(/expirada/)
    expect(() => verifyWebhook(payload, undefined, WHSEC)).toThrow()
    expect((await webhook('customer.subscription.updated', { id: 'sub_x' }, 't=1,v1=00')).status).toBe(400)
  })

  it('a app pede um link de uso único para a página /pro; o link entra com a sessão da app', async () => {
    const res = await alice('/api/billing/link', { body: {} })
    expect(res.status).toBe(200)
    const url = new URL(res.json.url)
    expect(url.pathname).toBe('/pro/entrar')
    const browser = h.client()
    const enter = await browser(url.pathname + url.search)
    expect(enter.status).toBe(302)
    expect(enter.headers.get('location')).toBe('/pro')
    const status = await browser('/api/billing/status')
    expect(status.status).toBe(200)
    expect(status.json).toMatchObject({ plan: 'free', available: true, canManage: false })
    // "Sair" na página só esquece a sessão neste browser: a app continua ligada.
    const out = await browser('/pro/sair', { body: {} })
    expect(out.status).toBe(200)
    expect((await browser('/api/billing/status')).status).toBe(401)
    expect((await alice('/api/billing/status')).status).toBe(200)
    // O mesmo link não serve duas vezes.
    const again = h.client()
    await again(url.pathname + url.search)
    expect((await again('/api/billing/status')).status).toBe(401)
  })

  it('checkout: cria o cliente uma vez, pede a subscrição certa e devolve a página da Stripe', async () => {
    expect((await alice('/api/billing/checkout', { body: { interval: 'semana' } })).status).toBe(400)
    const res = await alice('/api/billing/checkout', { body: { interval: 'year' } })
    expect(res.status).toBe(200)
    expect(res.json.url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
    const customer = calls.find((c) => c.path === '/v1/customers')!
    expect(customer.auth).toBe('Bearer sk_test_x')
    expect(customer.form.get('metadata[user_id]')).toBe(aliceId)
    const checkout = calls.find((c) => c.path === '/v1/checkout/sessions')!
    expect(checkout.form.get('mode')).toBe('subscription')
    expect(checkout.form.get('line_items[0][price]')).toBe('price_ano')
    expect(checkout.form.get('client_reference_id')).toBe(aliceId)
    expect(checkout.form.get('success_url')).toContain('/pro/obrigado?session_id={CHECKOUT_SESSION_ID}')

    calls.length = 0
    await alice('/api/billing/checkout', { body: { interval: 'month' } })
    expect(calls.some((c) => c.path === '/v1/customers')).toBe(false)
    expect(calls.find((c) => c.path === '/v1/checkout/sessions')!.form.get('line_items[0][price]')).toBe('price_mes')
  })

  it('pagamento concluído → Pro ativo; renovação estende; cancelamento volta a Grátis', async () => {
    const customer = (await h.pool.query('select stripe_customer_id from billing_customer where user_id = $1', [aliceId])).rows[0]!.stripe_customer_id
    subscriptions.set('sub_1', { id: 'sub_1', customer, status: 'active', items: { data: [{ current_period_end: inAMonth() }] } })
    expect(await plan()).toBe('free')

    const done = await webhook('checkout.session.completed', { id: 'cs_1', customer, subscription: 'sub_1', client_reference_id: aliceId })
    expect(done.status).toBe(200)
    expect(await plan()).toBe('pro')
    expect((await alice('/api/billing/status')).json).toMatchObject({ plan: 'pro', source: 'stripe', canManage: true })
    // Já é Pro: não pode comprar outra vez.
    expect((await alice('/api/billing/checkout', { body: { interval: 'month' } })).json.code).toBe('ALREADY_PRO')

    // Aviso fora de ordem com dados velhos: o servidor confia no estado atual pedido à Stripe.
    await webhook('customer.subscription.updated', { id: 'sub_1', status: 'canceled' })
    expect(await plan()).toBe('pro')

    subscriptions.set('sub_1', { id: 'sub_1', customer, status: 'canceled', items: { data: [{ current_period_end: inAMonth() }] } })
    await webhook('customer.subscription.deleted', { id: 'sub_1' })
    expect(await plan()).toBe('free')
  })

  it('um Pro dado à mão por um admin não é encurtado nem apagado pela Stripe', async () => {
    await h.pool.query(`insert into entitlement (user_id, plan, source, granted_by) values ($1, 'pro', 'manual', 'admin') on conflict (user_id) do update set source = 'manual', expires_at = null, note = null`, [aliceId])
    const customer = (await h.pool.query('select stripe_customer_id from billing_customer where user_id = $1', [aliceId])).rows[0]!.stripe_customer_id
    subscriptions.set('sub_2', { id: 'sub_2', customer, status: 'active', current_period_end: inAMonth() })
    await webhook('customer.subscription.created', { id: 'sub_2' })
    const row = (await h.pool.query('select source, expires_at from entitlement where user_id = $1', [aliceId])).rows[0]
    expect(row).toMatchObject({ source: 'manual', expires_at: null })
    subscriptions.set('sub_2', { id: 'sub_2', customer, status: 'canceled', current_period_end: inAMonth() })
    await webhook('customer.subscription.deleted', { id: 'sub_2' })
    expect(await plan()).toBe('pro')
    await h.pool.query('delete from entitlement where user_id = $1', [aliceId])
  })

  it('portal de gestão da subscrição', async () => {
    const res = await alice('/api/billing/portal', { body: {} })
    expect(res.status).toBe(200)
    expect(res.json.url).toMatch(/^https:\/\/billing\.stripe\.com\//)
    expect(calls.find((c) => c.path === '/v1/billing_portal/sessions')!.form.get('return_url')).toMatch(/\/pro$/)
  })

  it('sem sessão: nada feito', async () => {
    const anon = h.client()
    expect((await anon('/api/billing/checkout', { body: { interval: 'month' } })).status).toBe(401)
    expect((await anon('/api/billing/link', { body: {} })).status).toBe(401)
  })
})

describe('configuração da Stripe', () => {
  const full = { STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_1', STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_YEARLY: 'price_y' }
  it('sem variáveis: pagamentos desligados; com todas: ligados', () => {
    expect(stripeSettings({})).toBeNull()
    expect(stripeSettings(full)).toMatchObject({ prices: { month: 'price_m', year: 'price_y' } })
  })
  it('apanha chaves trocadas', () => {
    expect(() => stripeSettings({ ...full, STRIPE_SECRET_KEY: 'pk_test_1' })).toThrow(/sk_test_/)
    expect(() => stripeSettings({ ...full, STRIPE_PRICE_MONTHLY: 'prod_1' })).toThrow(/price_/)
    expect(() => stripeSettings({ ...full, STRIPE_WEBHOOK_SECRET: 'sk_test_1' })).toThrow(/whsec_/)
  })
})

describe('sem Stripe configurada', () => {
  it('a compra diz que está indisponível', async () => {
    // Criado aqui (depois das migrações do primeiro): o Better Auth confere o esquema ao arrancar.
    const plain = createHarness()
    await plain.setup()
    const email = `sem-${randomUUID()}@exemplo.pt`
    await plain.createVerifiedUser(email)
    const bob = plain.client({ bearer: await plain.desktopLogin(email) })
    expect((await bob('/api/billing/status')).json).toMatchObject({ available: false })
    expect((await bob('/api/billing/checkout', { body: { interval: 'month' } })).json.code).toBe('BILLING_UNAVAILABLE')
    await plain.pool.end()
  })
})
