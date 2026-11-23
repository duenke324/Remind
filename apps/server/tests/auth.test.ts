import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHarness } from './helpers/harness'

const h = createHarness()
const { mailer, client, lastMailTo, createVerifiedUser } = h

beforeAll(async () => {
  await h.setup()
})

afterAll(async () => {
  await h.pool.end()
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
  it('diz à app que logins sociais estão disponíveis (nenhum sem credenciais)', async () => {
    const res = await client()('/api/config')
    expect(res.json).toEqual({ providers: [] })
  })

  it('responde ao health check', async () => {
    const res = await client()('/health')
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true })
  })
})
