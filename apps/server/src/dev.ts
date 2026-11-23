// Servidor local: npm run dev -w @remind/server (lê o .env da pasta apps/server, se existir).
import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { migrate } from './auth'
import { fromEnv } from './config'
import { migratePages } from './pages/schema'

if (existsSync('.env')) process.loadEnvFile('.env')
const deps = fromEnv()
await migrate(deps.auth)
await migratePages(deps.pool)
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: createApp(deps).fetch, port })
console.info(`Remind server em http://localhost:${port}`)
