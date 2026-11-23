import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { bearer, oneTimeToken, twoFactor } from 'better-auth/plugins'
import type pg from 'pg'
import { otpEmail, resetPasswordEmail, verificationEmail } from './emails'
import type { Mailer } from './mailer'

const OTP_MINUTES = 10

export interface OAuthCredentials {
  clientId: string
  clientSecret: string
}

export interface AuthConfig {
  pool: pg.Pool
  mailer: Mailer
  baseURL: string
  secret: string
  google?: OAuthCredentials
  github?: OAuthCredentials
  rateLimit?: boolean
}

export function createAuth(config: AuthConfig) {
  const { mailer } = config
  return betterAuth({
    appName: 'Remind',
    baseURL: config.baseURL,
    secret: config.secret,
    database: config.pool,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => mailer.send(resetPasswordEmail(user.email, url))
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, url }) => mailer.send(verificationEmail(user.email, url))
    },
    socialProviders: {
      ...(config.google && { google: { ...config.google, prompt: 'select_account' as const } }),
      ...(config.github && { github: config.github })
    },
    account: {
      // Liga a conta Google/GitHub a uma conta existente com o mesmo email verificado.
      accountLinking: { enabled: true, trustedProviders: ['google', 'github'] }
    },
    databaseHooks: {
      user: {
        create: {
          // A verificação em dois passos por email é obrigatória para todas as contas.
          before: async (user) => ({ data: { ...user, twoFactorEnabled: true } })
        }
      }
    },
    rateLimit: {
      enabled: config.rateLimit ?? true,
      storage: 'database'
    },
    plugins: [
      twoFactor({
        issuer: 'Remind',
        totpOptions: { disable: true },
        otpOptions: {
          period: OTP_MINUTES,
          digits: 6,
          allowedAttempts: 5,
          storeOTP: 'hashed',
          sendOTP: async ({ user, otp }) => mailer.send(otpEmail(user.email, otp, OTP_MINUTES))
        }
      }),
      // A app desktop guarda o token da sessão (bearer) em vez de cookies.
      bearer(),
      // Entrega a sessão do login Google/GitHub (feito no browser) à app desktop.
      oneTimeToken({ expiresIn: 3 })
    ]
  })
}

export type Auth = ReturnType<typeof createAuth>

export async function migrate(auth: Auth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
}
