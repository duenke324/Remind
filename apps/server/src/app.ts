import { Hono } from 'hono'
import type { Auth } from './auth'

export function createApp(auth: Auth) {
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  return app
}
