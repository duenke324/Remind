import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import { createAuth } from '../src/auth'
import { checkMailer, createSmtpMailer, RETRY_AFTER_MS, type Mailer } from '../src/mailer'
import nodemailer from 'nodemailer'
import pg from 'pg'

const failingMailer: Mailer = {
  async send() {
    throw Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'), { code: 'EAUTH' })
  },
  async verify() {
    throw Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'), { code: 'EAUTH', responseCode: 535 })
  }
}

const okMailer: Mailer = { async send() {}, async verify() {} }

function appWith(mailer: Mailer) {
  const pool = new pg.Pool({ connectionString: 'postgres://ninguem@127.0.0.1:1/nada' })
  const auth = createAuth({ pool, mailer, baseURL: 'http://localhost', secret: 'segredo-de-teste-com-mais-de-32-caracteres!!', rateLimit: false })
  return { app: createApp({ auth, pool, baseURL: 'http://localhost', mailer }), pool }
}

describe('diagnóstico do email', () => {
  it('o health check diz quando o servidor de email recusa o login (sem revelar segredos)', async () => {
    const { app, pool } = appWith(failingMailer)
    const res = await app.request('http://localhost/health')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({ ok: false, email: 'erro: EAUTH 535' })
    await pool.end()
  })

  it('o health check fica verde quando o email funciona', async () => {
    const { app, pool } = appWith(okMailer)
    const res = await app.request('http://localhost/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: 'ok' })
    await pool.end()
  })

  it('só testa a ligação ao email uma vez (não faz login no Gmail a cada pedido)', async () => {
    const verify = vi.fn(async () => {})
    const mailer: Mailer = { async send() {}, verify }
    await checkMailer(mailer)
    await checkMailer(mailer)
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('na porta 587 (Brevo) exige TLS antes de enviar a chave', () => {
    const spy = vi.spyOn(nodemailer, 'createTransport')
    createSmtpMailer({ host: 'smtp-relay.brevo.com', port: 587, user: 'u', pass: 'p', from: 'a@b.pt' })
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ secure: false, requireTLS: true })
    spy.mockRestore()
  })

  it('depois de uma falha volta a testar ao fim de um minuto (não fica preso até ao próximo deploy)', async () => {
    let fail = true
    const verify = vi.fn(async () => {
      if (fail) throw Object.assign(new Error('x'), { code: 'EAUTH' })
    })
    const mailer: Mailer = { async send() {}, verify }
    let t = 0
    const now = () => t
    expect(await checkMailer(mailer, now)).toBe('erro: EAUTH')
    fail = false
    t = RETRY_AFTER_MS - 1
    expect(await checkMailer(mailer, now)).toBe('erro: EAUTH')
    t = RETRY_AFTER_MS
    expect(await checkMailer(mailer, now)).toBe('ok')
    t = RETRY_AFTER_MS * 10
    expect(await checkMailer(mailer, now)).toBe('ok')
    expect(verify).toHaveBeenCalledTimes(2)
  })
})
