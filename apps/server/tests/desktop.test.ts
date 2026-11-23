import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, createHarness } from './helpers/harness'

const h = createHarness()

beforeAll(() => h.setup())
afterAll(() => h.pool.end())

describe('login da app desktop', () => {
  it('depois do código OTP devolve um token bearer que dá acesso à sessão', async () => {
    const email = `desk-${randomUUID()}@exemplo.pt`
    await h.createVerifiedUser(email)
    const token = await h.desktopLogin(email)

    const session = await h.client({ bearer: token })('/api/auth/get-session')
    expect(session.json?.user?.email).toBe(email)
  })

  it('o token deixa de funcionar depois de terminar sessão', async () => {
    const email = `logout-${randomUUID()}@exemplo.pt`
    await h.createVerifiedUser(email)
    const token = await h.desktopLogin(email)
    const http = h.client({ bearer: token })

    expect((await http('/api/auth/sign-out', { body: {} })).status).toBe(200)
    expect((await http('/api/auth/get-session')).json).toBeNull()
  })

  it('o link do email de confirmação leva a uma página de sucesso', async () => {
    const email = `verified-${randomUUID()}@exemplo.pt`
    const http = h.client()
    await http('/api/auth/sign-up/email', {
      body: { email, password: 'palavra-passe-forte-1', name: 'V', callbackURL: `${BASE_URL}/auth/verified` }
    })
    const link = new URL(h.lastMailTo(email).text.match(/https?:\/\/\S+/)![0])
    const res = await http(link.pathname + link.search)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${BASE_URL}/auth/verified`)
    const page = await http('/auth/verified')
    expect(page.text).toContain('Email confirmado')
  })
})

describe('Google/GitHub a partir da app', () => {
  it('rejeita fornecedores não configurados e state inválido', async () => {
    const http = h.client()
    expect((await http('/desktop/oauth/google?state=abcdefghijklmnop')).status).toBe(404)
    expect((await http('/desktop/oauth/google?state=<x>')).status).toBe(400)
  })

  it('no fim do login no browser entrega um token de uso único à app (remind://)', async () => {
    // Simula o fim do login social: o browser já tem sessão (cookie).
    const email = `social-${randomUUID()}@exemplo.pt`
    await h.createVerifiedUser(email)
    const browser = h.client()
    await browser('/api/auth/sign-in/email', { body: { email, password: 'palavra-passe-forte-1' } })
    await browser('/api/auth/two-factor/send-otp', { body: {} })
    const code = h.lastMailTo(email).text.match(/\b\d{6}\b/)![0]
    await browser('/api/auth/two-factor/verify-otp', { body: { code } })

    const state = 'estado-aleatorio-1234567890'
    const done = await browser(`/desktop/oauth/complete?state=${state}`)
    expect(done.status).toBe(200)
    const deepLink = done.text.match(/remind:\/\/auth\/callback\?[^"']+/)?.[0]?.replace(/&(amp|#38);/g, '&')
    expect(deepLink).toBeTruthy()
    const params = new URL(deepLink!).searchParams
    expect(params.get('state')).toBe(state)

    // A app troca o token de uso único por um token bearer.
    const app = h.client()
    const exchange = await app('/api/auth/one-time-token/verify', { body: { token: params.get('token') } })
    expect(exchange.status).toBe(200)
    const bearer = exchange.headers.get('set-auth-token')
    expect(bearer).toBeTruthy()
    expect((await h.client({ bearer: bearer! })('/api/auth/get-session')).json?.user?.email).toBe(email)

    // Só funciona uma vez.
    const again = await h.client()('/api/auth/one-time-token/verify', { body: { token: params.get('token') } })
    expect(again.status).not.toBe(200)
  })

  it('sem sessão no browser não entrega token', async () => {
    const res = await h.client()('/desktop/oauth/complete?state=estado-aleatorio-1234567890')
    expect(res.status).toBe(401)
    expect(res.text).not.toContain('remind://auth/callback')
  })
})

describe('redefinir palavra-passe', () => {
  it('o link do email abre um formulário que muda a palavra-passe', async () => {
    const email = `reset-${randomUUID()}@exemplo.pt`
    await h.createVerifiedUser(email)
    const http = h.client()
    await http('/api/auth/request-password-reset', {
      body: { email, redirectTo: `${BASE_URL}/auth/reset-password` }
    })
    const link = new URL(h.lastMailTo(email).text.match(/https?:\/\/\S+/)![0])
    const res = await http(link.pathname + link.search)
    expect(res.status).toBe(302)
    const formUrl = new URL(res.headers.get('location')!)
    expect(formUrl.pathname).toBe('/auth/reset-password')
    const token = formUrl.searchParams.get('token')!

    const form = await http(`/auth/reset-password?token=${token}`)
    expect(form.text).toContain('<form')

    const mismatch = await http('/auth/reset-password', {
      form: { token, password: 'nova-palavra-passe-1', confirm: 'outra-coisa-123' }
    })
    expect(mismatch.text).toContain('não coincidem')

    const ok = await http('/auth/reset-password', {
      form: { token, password: 'nova-palavra-passe-1', confirm: 'nova-palavra-passe-1' }
    })
    expect(ok.text).toContain('Palavra-passe alterada')

    const signIn = await h.client()('/api/auth/sign-in/email', { body: { email, password: 'nova-palavra-passe-1' } })
    expect(signIn.json?.twoFactorRedirect).toBe(true)
  })
})
