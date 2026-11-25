import { Hono } from 'hono'
import type pg from 'pg'
import type { Auth } from './auth'
import { FREE_PAGE_LIMIT, pageCount, planOf } from './plans'

/** O que a app precisa de saber sobre a conta: plano, limites e uso. */
export function meRoutes(auth: Auth, pool: pg.Pool) {
  const app = new Hono()
  app.get('/', async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'Sessão inválida' }, 401)
    const userId = session.user.id
    const [plan, pages] = await Promise.all([planOf(pool, userId), pageCount(pool, userId)])
    return c.json({
      plan,
      role: (session.user as { role?: string }).role ?? 'user',
      limits: { pages: plan === 'pro' ? null : FREE_PAGE_LIMIT },
      usage: { pages }
    })
  })
  return app
}
