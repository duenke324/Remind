import pg from 'pg'
import { createAuth, type AuthConfig, type OAuthCredentials } from './auth'
import { createStripe } from './billing/stripe'
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

/**
 * Stripe (Remind Pro). Precisa das quatro variáveis; com alguma em falta, a compra fica indisponível
 * (o resto do servidor funciona na mesma).
 */
export function stripeSettings(env: NodeJS.ProcessEnv) {
  const names = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_YEARLY'] as const
  const values = names.map((n) => env[n]?.trim() ?? '')
  if (values.every((v) => !v)) return null
  const missing = names.filter((_, i) => !values[i])
  if (missing.length) {
    console.error(`[stripe] pagamentos desligados: falta ${missing.join(', ')}`)
    return null
  }
  const [secretKey, webhookSecret, monthly, yearly] = values as [string, string, string, string]
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) throw new Error('STRIPE_SECRET_KEY não parece uma chave secreta da Stripe (começa por sk_test_ ou sk_live_)')
  if (!webhookSecret.startsWith('whsec_')) throw new Error('STRIPE_WEBHOOK_SECRET não parece um segredo de webhook (começa por whsec_)')
  if (!monthly.startsWith('price_') || !yearly.startsWith('price_')) {
    throw new Error('STRIPE_PRICE_MONTHLY e STRIPE_PRICE_YEARLY têm de ser IDs de preço da Stripe (começam por price_)')
  }
  return {
    secretKey,
    webhookSecret,
    prices: { month: monthly, year: yearly },
    // Só em testes: uma "Stripe" local.
    apiBase: env.NODE_ENV !== 'production' && env.STRIPE_API_URL ? env.STRIPE_API_URL : undefined
  }
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
    adminEmails: adminEmails(env),
    // O painel de admin (admin.remind.uno) e o domínio próprio da API usam a mesma sessão.
    trustedOrigins: (env.TRUSTED_ORIGINS ?? 'https://admin.remind.uno,https://admin-remind.pt,https://api.remind.uno')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o))
  }
  const stripe = stripeSettings(env)
  return {
    auth: createAuth(config),
    stripe: stripe ? createStripe(stripe) : null,
    stripeWebhookSecret: stripe?.webhookSecret ?? null,
    pool,
    baseURL: config.baseURL,
    mailer,
    adminEmails: config.adminEmails ?? [],
    // Testes ponta a ponta: uma "Google" local. Nunca em produção.
    googleCalendarApi: env.NODE_ENV !== 'production' && env.GOOGLE_CALENDAR_API_URL ? env.GOOGLE_CALENDAR_API_URL : undefined
  }
}
