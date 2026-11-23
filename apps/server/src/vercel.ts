// Entrada do servidor na Vercel (função Node). O ficheiro é empacotado por scripts/build-vercel.mjs.
import { getRequestListener } from '@hono/node-server'
import { createApp } from './app'
import { fromEnv } from './config'

let app: ReturnType<typeof createApp> | null = null

export default getRequestListener((request) => {
  try {
    app ??= createApp(fromEnv())
  } catch (error) {
    // Configuração incompleta (ex.: variável em falta): diz qual, sem revelar valores.
    console.error(error)
    const message = error instanceof Error ? error.message : 'configuração inválida'
    return Response.json({ ok: false, error: message }, { status: 503 })
  }
  return app.fetch(request)
})
