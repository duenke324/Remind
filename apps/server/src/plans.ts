import type pg from 'pg'

/** Quantas páginas uma conta grátis pode ter (contam também as que estão no lixo). */
export const FREE_PAGE_LIMIT = 50

export type Plan = 'free' | 'pro'

/**
 * Planos e registo de ações de administração.
 * - entitlement: uma linha por conta Pro (origem manual ou stripe; sem `expires_at` = sem fim).
 * - admin_audit: cada ação de um admin sobre uma conta (quem, o quê, a quem, quando).
 * - billing_customer: a ligação entre uma conta e o cliente correspondente na Stripe.
 */
export const PLANS_SQL = `
    create table if not exists entitlement (
      user_id     text primary key references "user"(id) on delete cascade,
      plan        text not null check (plan in ('pro')),
      source      text not null check (source in ('manual', 'stripe')),
      expires_at  timestamptz,
      granted_by  text,
      note        text,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    );
    create table if not exists admin_audit (
      id          bigserial primary key,
      admin_id    text,
      admin_email text not null,
      target_id   text,
      target_email text,
      action      text not null,
      details     jsonb not null default '{}'::jsonb,
      created_at  timestamptz not null default now()
    );
    create index if not exists admin_audit_target_idx on admin_audit (target_id, created_at desc);
    create index if not exists admin_audit_created_idx on admin_audit (created_at desc);
    create table if not exists billing_customer (
      user_id            text primary key references "user"(id) on delete cascade,
      stripe_customer_id text not null unique,
      created_at         timestamptz not null default now()
    );
`

export async function migratePlans(pool: pg.Pool): Promise<void> {
  await pool.query(PLANS_SQL)
}

type Queryable = Pick<pg.Pool, 'query'>

export async function planOf(db: Queryable, userId: string): Promise<Plan> {
  const { rowCount } = await db.query(
    `select 1 from entitlement where user_id = $1 and plan = 'pro' and (expires_at is null or expires_at > now())`,
    [userId]
  )
  return rowCount ? 'pro' : 'free'
}

export async function pageCount(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(`select count(*) as n from page where user_id = $1 and deleted = false`, [userId])
  return Number(rows[0]?.n ?? 0)
}

/** Dá papel de admin às contas cujos emails estão em ADMIN_EMAILS (idempotente). */
export async function promoteAdmins(db: Queryable, emails: string[]): Promise<void> {
  if (emails.length === 0) return
  await db.query(`update "user" set role = 'admin' where lower(email) = any($1) and role is distinct from 'admin'`, [emails])
}
