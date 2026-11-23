// Mostra o SQL que cria a base de dados do zero (contas + páginas), para aplicar onde não há ligação direta
// (ex.: editor SQL do Supabase). Precisa de uma base de dados vazia em DATABASE_URL para comparar.
//   DATABASE_URL=postgres://.../vazia npm run schema:sql -w @remind/server > schema.sql
import { getMigrations } from 'better-auth/db/migration'
import { fromEnv } from './config'
import { PAGES_SQL } from './pages/schema'

const { auth, pool } = fromEnv({ ...process.env, BETTER_AUTH_URL: 'http://localhost', BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(), NODE_ENV: 'development' })
const { compileMigrations } = await getMigrations(auth.options)
process.stdout.write(`${await compileMigrations()}\n\n-- Páginas\n${PAGES_SQL}\n`)
await pool.end()
