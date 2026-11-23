import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { createAuth, migrate } from '../src/auth'
import { createMemoryMailer } from '../src/mailer'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/remind_test'
const BASE_URL = 'http://localhost:8787'

const pool = new pg.Pool({ connectionString: DATABASE_URL })
const mailer = createMemoryMailer()
const auth = createAuth({
  pool,
  mailer,
  baseURL: BASE_URL,
  secret: 'segredo-de-teste-com-mais-de-32-caracteres!!',
  rateLimit: false
})
const app = createApp(auth)

/** Cliente HTTP mínimo com cookies, como um browser. */
function client() {
  const jar = new Map<string, string>()
  return async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const headers = new Headers({ origin: BASE_URL })
    if (init.body !== undefined) headers.set('content-type', 'application/json')
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
    const res = await app.request(`${BASE_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      /* resposta sem JSON */
    }
    return { status: res.status, json: json as Record<string, any>, headers: res.headers }
  }
}

function lastMailTo(email: string) {
  const mail = mailer.sent.filter((m) => m.to === email).at(-1)
  if (!mail) throw new Error(`Nenhum email enviado para ${email}`)
  return mail
}

async function createVerifiedUser(email: string, password: string) {
  const http = client()
  const signUp = await http('/api/auth/sign-up/email', { body: { email, password, name: 'Teste' } })
  expect(signUp.status).toBe(200)
  const link = lastMailTo(email).text.match(/https?:\/\/\S+/)?.[0]
  expect(link).toBeTruthy()
  const verify = await http(new URL(link!).pathname + new URL(link!).search)
  expect([200, 302]).toContain(verify.status)
}

beforeAll(async () => {
  await migrate(auth)
})

afterAll(async () => {
  await pool.end()
})

beforeEach(() => {
  mailer.sent.length = 0
})

describe('contas', () => {
  it('cria conta e envia email de verificação', async () => {
    const email = `novo-${randomUUID()}@exemplo.pt`
    const res = await client()('/api/auth/sign-up/email', {
      body: { email, password: 'palavra-passe-forte-1', name: 'Ana' }
    })
    expect(res.status).toBe(200)
    expect(lastMailTo(email).subject).toMatch(/confirma/i)
  })

  it('recusa entrar antes de verificar o email', async () => {
    const email = `nao-verificado-${randomUUID()}@exemplo.pt`
    const http = client()
    await http('/api/auth/sign-up/email', { body: { email, password: 'palavra-passe-forte-1', name: 'Rui' } })
    const res = await http('/api/auth/sign-in/email', { body: { email, password: 'palavra-passe-forte-1' } })
    expect(res.status).toBe(403)
  })

  it('recusa palavras-passe curtas', async () => {
    const res = await client()('/api/auth/sign-up/email', {
      body: { email: `curta-${randomUUID()}@exemplo.pt`, password: 'curta', name: 'X' }
    })
    expect(res.status).toBe(400)
  })
})

describe('verificação em dois passos por email (OTP)', () => {
  it('pede o código em cada login e só cria sessão com o código certo', async () => {
    const email = `otp-${randomUUID()}@exemplo.pt`
    const password = 'palavra-passe-forte-1'
    await createVerifiedUser(email, password)
    mailer.sent.length = 0

    const http = client()
    const signIn = await http('/api/auth/sign-in/email', { body: { email, password } })
    expect(signIn.status).toBe(200)
    expect(signIn.json.twoFactorRedirect).toBe(true)
    expect(signIn.json.twoFactorMethods).toEqual(['otp'])

    // Ainda sem sessão.
    const before = await http('/api/auth/get-session')
    expect(before.json).toBeNull()

    const send = await http('/api/auth/two-factor/send-otp', { body: {} })
    expect(send.status).toBe(200)
    const code = lastMailTo(email).text.match(/\b\d{6}\b/)?.[0]
    expect(code).toMatch(/^\d{6}$/)

    const wrong = await http('/api/auth/two-factor/verify-otp', { body: { code: code === '000000' ? '111111' : '000000' } })
    expect(wrong.status).toBe(401)

    const ok = await http('/api/auth/two-factor/verify-otp', { body: { code } })
    expect(ok.status).toBe(200)

    const after = await http('/api/auth/get-session')
    expect(after.json?.user?.email).toBe(email)
  })

  it('bloqueia o código depois de demasiadas tentativas erradas', async () => {
    const email = `tentativas-${randomUUID()}@exemplo.pt`
    const password = 'palavra-passe-forte-1'
    await createVerifiedUser(email, password)

    const http = client()
    await http('/api/auth/sign-in/email', { body: { email, password } })
    await http('/api/auth/two-factor/send-otp', { body: {} })
    const code = lastMailTo(email).text.match(/\b\d{6}\b/)?.[0]
    const wrongCode = code === '000000' ? '111111' : '000000'

    for (let i = 0; i < 5; i++) {
      await http('/api/auth/two-factor/verify-otp', { body: { code: wrongCode } })
    }
    const late = await http('/api/auth/two-factor/verify-otp', { body: { code } })
    expect(late.status).not.toBe(200)
  })
})

describe('servidor', () => {
  it('responde ao health check', async () => {
    const res = await client()('/health')
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true })
  })
})
