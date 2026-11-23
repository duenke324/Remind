import { describe, expect, it } from 'vitest'
import { fromEnv } from '../src/config'

const base = {
  DATABASE_URL: 'postgres://ninguem@127.0.0.1:1/nada',
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres!!'
}

describe('configuração', () => {
  it('em produção o limite de tentativas não pode ser desligado', async () => {
    const { auth, pool } = fromEnv({ ...base, NODE_ENV: 'production', SMTP_HOST: 'smtp.exemplo.pt', SMTP_USER: 'u', SMTP_PASS: 'p', REMIND_RATE_LIMIT: 'off' })
    expect(auth.options.rateLimit?.enabled).toBe(true)
    await pool.end()
  })

  it('em produção recusa arrancar sem email (sem email não há códigos OTP)', () => {
    expect(() => fromEnv({ ...base, NODE_ENV: 'production' })).toThrow(/SMTP_HOST/)
  })

  it('Google e GitHub só ficam ativos com as duas credenciais', async () => {
    const { auth, pool } = fromEnv({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GITHUB_CLIENT_ID: 'só-id' })
    expect(Object.keys(auth.options.socialProviders ?? {})).toEqual(['google'])
    await pool.end()
  })
})
