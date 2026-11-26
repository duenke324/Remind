import pg from 'pg'
import { createApp } from '../../src/app'
import type { Stripe } from '../../src/billing/stripe'
import { createAuth, migrate } from '../../src/auth'
import { createMemoryMailer } from '../../src/mailer'
import { migratePages } from '../../src/pages/schema'
import { migratePlans } from '../../src/plans'

export const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/remind_test'
export const BASE_URL = 'http://localhost:8787'

export function createHarness(
  options: { google?: { clientId: string; clientSecret: string }; fetchImpl?: typeof fetch; stripe?: Stripe; stripeWebhookSecret?: string } = {}
) {
  const pool = new pg.Pool({ connectionString: DATABASE_URL })
  const mailer = createMemoryMailer()
  const auth = createAuth({
    pool,
    mailer,
    baseURL: BASE_URL,
    secret: 'segredo-de-teste-com-mais-de-32-caracteres!!',
    rateLimit: false,
    google: options.google
  })
  const app = createApp({ auth, pool, baseURL: BASE_URL, fetchImpl: options.fetchImpl, stripe: options.stripe, stripeWebhookSecret: options.stripeWebhookSecret })

  async function setup() {
    await migrate(auth)
    await migratePages(pool)
    await migratePlans(pool)
  }

  /** Cliente HTTP com cookies (como um browser) e, opcionalmente, um token bearer (como a app desktop). */
  function client(options: { bearer?: string } = {}) {
    const jar = new Map<string, string>()
    let bearer = options.bearer
    const request = async (path: string, init: { method?: string; body?: unknown; form?: Record<string, string> } = {}) => {
      const headers = new Headers({ origin: BASE_URL })
      let body: string | undefined
      if (init.form) {
        headers.set('content-type', 'application/x-www-form-urlencoded')
        body = new URLSearchParams(init.form).toString()
      } else if (init.body !== undefined) {
        headers.set('content-type', 'application/json')
        body = JSON.stringify(init.body)
      }
      if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
      if (bearer) headers.set('authorization', `Bearer ${bearer}`)
      const res = await app.request(`${BASE_URL}${path}`, {
        method: init.method ?? (body === undefined ? 'GET' : 'POST'),
        headers,
        body,
        redirect: 'manual'
      })
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';')
        const [name, ...rest] = (pair ?? '').split('=')
        const value = rest.join('=')
        if (!name) continue
        if (value === '' || /max-age=0/i.test(c)) jar.delete(name)
        else jar.set(name, value)
      }
      const text = await res.text()
      let json: any = null
      try {
        json = JSON.parse(text)
      } catch {
        /* sem JSON */
      }
      return { status: res.status, json, text, headers: res.headers }
    }
    return Object.assign(request, {
      setBearer: (token: string | undefined) => {
        bearer = token
      }
    })
  }

  function lastMailTo(email: string) {
    const mail = mailer.sent.filter((m) => m.to === email).at(-1)
    if (!mail) throw new Error(`Nenhum email enviado para ${email}`)
    return mail
  }

  async function createVerifiedUser(email: string, password = 'palavra-passe-forte-1') {
    const http = client()
    const signUp = await http('/api/auth/sign-up/email', { body: { email, password, name: 'Teste' } })
    if (signUp.status !== 200) throw new Error(`sign-up falhou: ${signUp.text}`)
    const link = lastMailTo(email).text.match(/https?:\/\/\S+/)?.[0]
    if (!link) throw new Error('sem link de verificação')
    const url = new URL(link)
    await http(url.pathname + url.search)
  }

  /** Faz o login completo como a app desktop (palavra-passe + código por email) e devolve o token bearer. */
  async function desktopLogin(email: string, password = 'palavra-passe-forte-1') {
    const http = client()
    await http('/api/auth/sign-in/email', { body: { email, password } })
    await http('/api/auth/two-factor/send-otp', { body: {} })
    const code = lastMailTo(email).text.match(/\b\d{6}\b/)?.[0]
    const verify = await http('/api/auth/two-factor/verify-otp', { body: { code } })
    const token = verify.headers.get('set-auth-token')
    if (!token) throw new Error(`sem token bearer: ${verify.status} ${verify.text}`)
    return token
  }

  return { pool, mailer, auth, app, setup, client, lastMailTo, createVerifiedUser, desktopLogin }
}
