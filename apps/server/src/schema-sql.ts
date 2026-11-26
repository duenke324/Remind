// Mostra o SQL que cria a base de dados do zero (contas + páginas), para aplicar onde não há ligação direta
// (ex.: editor SQL do Supabase). Precisa de uma base de dados vazia em DATABASE_URL para comparar.
//   DATABASE_URL=postgres://.../vazia npm run schema:sql -w @remind/server > schema.sql
import { getMigrations } from 'better-auth/db/migration'
import { fromEnv } from './config'
import { PAGES_SQL } from './pages/schema'
import { PLANS_SQL } from './plans'

const { auth, pool } = fromEnv({ ...process.env, BETTER_AUTH_URL: 'http://localhost', BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(), NODE_ENV: 'development' })
const { compileMigrations } = await getMigrations(auth.options)
// O Supabase publica o esquema public na sua API REST (chave anónima). O servidor liga-se como dono das
// tabelas e não usa essa API: RLS ligado e sem regras bloqueia o acesso público sem afetar o servidor.
const TABLES = ['user', 'session', 'account', 'verification', 'twoFactor', 'rateLimit', 'page', 'entitlement', 'admin_audit', 'billing_customer']
const RLS = TABLES.map((t) => `alter table "${t}" enable row level security;`).join('\n')
process.stdout.write(`begin;\n${await compileMigrations()}\n\n-- Páginas\n${PAGES_SQL}\n\n-- Planos e auditoria\n${PLANS_SQL}\n\n-- Bloquear a API pública\n${RLS}\ncommit;\n`)
await pool.end()
