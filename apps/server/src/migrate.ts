// Cria/atualiza as tabelas na base de dados: npm run migrate -w @remind/server
import { existsSync } from 'node:fs'
import { migrate } from './auth'
import { fromEnv } from './config'
import { migratePages } from './pages/schema'
import { migratePlans, promoteAdmins } from './plans'

if (existsSync('.env')) process.loadEnvFile('.env')
const { auth, pool, adminEmails } = fromEnv()
await migrate(auth)
await migratePages(pool)
await migratePlans(pool)
await promoteAdmins(pool, adminEmails)
console.info('Migrações aplicadas.')
await pool.end()
