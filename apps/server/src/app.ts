import { Hono } from 'hono'
import type pg from 'pg'
import type { Auth } from './auth'
import { adminRoutes } from './admin/routes'
import { billingRoutes } from './billing/routes'
import type { Stripe } from './billing/stripe'
import { calendarRoutes } from './calendar/routes'
import type { Fetch } from './calendar/google'
import { checkMailer, type Mailer } from './mailer'
import { meRoutes } from './me'
import { pageRoutes } from './pages/routes'
import { webRoutes } from './web/routes'

export interface AppDeps {
  auth: Auth
  pool: pg.Pool
  baseURL: string
  /** Para o health check dizer se o envio de email funciona. */
  mailer?: Mailer
  /** Para os testes simularem a Google. */
  fetchImpl?: Fetch
  /** Só fora de produção (testes ponta a ponta): outra morada para a Google Calendar API. */
  googleCalendarApi?: string
  /** Pagamentos (Remind Pro). Sem isto, a compra aparece como indisponível. */
  stripe?: Stripe | null
  stripeWebhookSecret?: string | null
}

export function createApp({ auth, pool, baseURL, mailer, fetchImpl, googleCalendarApi, stripe = null, stripeWebhookSecret = null }: AppDeps) {
  const app = new Hono()

  app.get('/health', async (c) => {
    if (!mailer) return c.json({ ok: true })
    const email = await checkMailer(mailer)
    return c.json({ ok: email === 'ok', email }, email === 'ok' ? 200 : 503)
  })
  // A app pergunta que métodos de login mostrar.
  app.get('/api/config', (c) => c.json({ providers: Object.keys(auth.options.socialProviders ?? {}) }))
  // As rotas de admin do Better Auth (inclui "entrar como" e mudar passwords) ficam fechadas: o painel usa /api/admin.
  app.all('/api/auth/admin/*', (c) => c.json({ error: 'Não encontrado' }, 404))
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  app.route('/api/me', meRoutes(auth, pool))
  app.route('/api/admin', adminRoutes(auth, pool))
  app.route('/api/calendar', calendarRoutes(auth, pool, baseURL, fetchImpl, googleCalendarApi))
  app.route('/api/pages', pageRoutes(auth, pool))
  app.route('/api/billing', billingRoutes(auth, pool, baseURL, stripe, stripeWebhookSecret))
  app.route('/', webRoutes(auth, baseURL))

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: 'Erro interno' }, 500)
  })

  return app
}
