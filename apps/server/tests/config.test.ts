import { describe, expect, it } from 'vitest'
import { fromEnv, smtpSettings } from '../src/config'

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

  it('a password de app do Gmail funciona mesmo colada com espaços ou quebra de linha', () => {
    const smtp = smtpSettings({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: ' eu@gmail.com\n', SMTP_PASS: 'abcd efgh ijkl mnop\n' })
    expect(smtp.pass).toBe('abcdefghijklmnop')
    expect(smtp.user).toBe('eu@gmail.com')
  })

  it('diz logo quando o SMTP_PASS do Gmail não é uma password de app (16 letras)', () => {
    expect(() => smtpSettings({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'eu@gmail.com', SMTP_PASS: 'MinhaPassword123' })).toThrow(/16 letras/)
  })
})
