// Cria/atualiza as tabelas na base de dados: npm run migrate -w @remind/server
import { existsSync } from 'node:fs'
import { migrate } from './auth'
import { fromEnv } from './config'
import { migratePages } from './pages/schema'

if (existsSync('.env')) process.loadEnvFile('.env')
const { auth, pool } = fromEnv()
await migrate(auth)
await migratePages(pool)
console.info('Migrações aplicadas.')
await pool.end()
