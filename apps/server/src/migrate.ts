// Cria/atualiza as tabelas na base de dados: npm run migrate -w @remind/server
import { existsSync } from 'node:fs'
import { migrate } from './auth'
import { authFromEnv } from './config'

if (existsSync('.env')) process.loadEnvFile('.env')
const auth = authFromEnv()
await migrate(auth)
console.info('Migrações aplicadas.')
process.exit(0)
