// Entrada da Vercel: todos os pedidos são reencaminhados para aqui (ver vercel.json).
import { handle } from 'hono/vercel'
import { createApp } from '../src/app'
import { authFromEnv } from '../src/config'

const app = createApp(authFromEnv())

export const GET = handle(app)
export const POST = handle(app)
