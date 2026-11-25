import pg from 'pg'
import { createAuth, type AuthConfig, type OAuthCredentials } from './auth'
import { createMemoryMailer, createSmtpMailer, type Mailer } from './mailer'

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`Variável de ambiente em falta: ${name}`)
  return value
}

function oauth(env: NodeJS.ProcessEnv, prefix: string): OAuthCredentials | undefined {
  const clientId = env[`${prefix}_CLIENT_ID`]
  const clientSecret = env[`${prefix}_CLIENT_SECRET`]
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

function mailerFromEnv(env: NodeJS.ProcessEnv): Mailer {
  if (!env.SMTP_HOST) {
    if (env.NODE_ENV === 'production') throw new Error('SMTP_HOST em falta: sem email não há códigos OTP')
    return createMemoryMailer({ log: true })
  }
  return createSmtpMailer(smtpSettings(env))
}

/** Lê as definições de SMTP, limpando o que vem colado à volta (espaços, quebras de linha). */
export function smtpSettings(env: NodeJS.ProcessEnv) {
  const host = required(env, 'SMTP_HOST').trim()
  const user = required(env, 'SMTP_USER').trim()
  // O Google mostra a password de app em 4 grupos com espaços; o servidor quer as 16 letras seguidas.
  const pass = required(env, 'SMTP_PASS').replace(/\s+/g, '')
  if (/(^|\.)gmail\.com$/i.test(host) && !/^[a-z]{16}$/i.test(pass)) {
    throw new Error('SMTP_PASS não é uma password de app do Google (são 16 letras, criadas em myaccount.google.com/apppasswords)')
  }
  if (/(^|\.)brevo\.com$/i.test(host) && pass.startsWith('xkeysib-')) {
    throw new Error('SMTP_PASS tem uma chave de API do Brevo (xkeysib-). É precisa a chave SMTP (xsmtpsib-), em app.brevo.com/settings/keys/smtp')
  }
  return { host, port: Number(env.SMTP_PORT ?? 465), user, pass, from: env.SMTP_FROM?.trim() || `Remind <${user}>` }
}

/** ADMIN_EMAILS="a@x.pt, b@y.pt" → ['a@x.pt', 'b@y.pt'] */
export function adminEmails(env: NodeJS.ProcessEnv): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+$/.test(e))
}

export function fromEnv(env: NodeJS.ProcessEnv = process.env) {
  const pool = new pg.Pool({ connectionString: required(env, 'DATABASE_URL'), max: 3 })
  const mailer = mailerFromEnv(env)
  const config: AuthConfig = {
    pool,
    mailer,
    baseURL: required(env, 'BETTER_AUTH_URL'),
    secret: required(env, 'BETTER_AUTH_SECRET'),
    google: oauth(env, 'GOOGLE'),
    github: oauth(env, 'GITHUB'),
    // Só para testes automáticos locais; em produção o limite está sempre ligado.
    rateLimit: env.NODE_ENV === 'production' || env.REMIND_RATE_LIMIT !== 'off',
    adminEmails: adminEmails(env)
  }
  return { auth: createAuth(config), pool, baseURL: config.baseURL, mailer, adminEmails: config.adminEmails ?? [] }
}
