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
  return createSmtpMailer({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 465),
    user: required(env, 'SMTP_USER'),
    pass: required(env, 'SMTP_PASS'),
    from: env.SMTP_FROM ?? `Remind <${required(env, 'SMTP_USER')}>`
  })
}

export function fromEnv(env: NodeJS.ProcessEnv = process.env) {
  const pool = new pg.Pool({ connectionString: required(env, 'DATABASE_URL'), max: 3 })
  const config: AuthConfig = {
    pool,
    mailer: mailerFromEnv(env),
    baseURL: required(env, 'BETTER_AUTH_URL'),
    secret: required(env, 'BETTER_AUTH_SECRET'),
    google: oauth(env, 'GOOGLE'),
    github: oauth(env, 'GITHUB'),
    // Só para testes automáticos locais; em produção o limite está sempre ligado.
    rateLimit: env.NODE_ENV === 'production' || env.REMIND_RATE_LIMIT !== 'off'
  }
  return { auth: createAuth(config), pool, baseURL: config.baseURL }
}
