import { Hono } from 'hono'
import type pg from 'pg'
import type { Auth } from './auth'
import { pageRoutes } from './pages/routes'
import { webRoutes } from './web/routes'

export interface AppDeps {
  auth: Auth
  pool: pg.Pool
  baseURL: string
}

export function createApp({ auth, pool, baseURL }: AppDeps) {
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  app.route('/api/pages', pageRoutes(auth, pool))
  app.route('/', webRoutes(auth, baseURL))

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: 'Erro interno' }, 500)
  })

  return app
}
