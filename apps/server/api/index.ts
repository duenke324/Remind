// Entrada da Vercel: todos os pedidos são reencaminhados para aqui (ver vercel.json).
import { handle } from 'hono/vercel'
import { createApp } from '../src/app'
import { fromEnv } from '../src/config'

const app = createApp(fromEnv())

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
