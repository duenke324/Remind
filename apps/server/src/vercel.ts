// Entrada do servidor na Vercel (função Node). O ficheiro é empacotado por scripts/build-vercel.mjs.
import { getRequestListener } from '@hono/node-server'
import { createApp } from './app'
import { fromEnv } from './config'

let app: ReturnType<typeof createApp> | null = null

// Criada no primeiro pedido: um erro de configuração aparece nos registos e como 500, em vez de impedir o arranque.
const getApp = () => (app ??= createApp(fromEnv()))

export default getRequestListener((request) => getApp().fetch(request))
