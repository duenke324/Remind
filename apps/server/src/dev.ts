// Servidor local: npm run dev -w @remind/server (lê o .env da pasta apps/server).
import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { migrate } from './auth'
import { authFromEnv } from './config'

if (existsSync('.env')) process.loadEnvFile('.env')
const auth = authFromEnv()
await migrate(auth)
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: createApp(auth).fetch, port })
console.info(`Remind server em http://localhost:${port}`)
