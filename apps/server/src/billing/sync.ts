import type pg from 'pg'
import { periodEnd, type StripeSubscription } from './stripe'

type Queryable = Pick<pg.Pool, 'query'>

/** Estados em que a pessoa pagou (ou a Stripe ainda está a tentar cobrar): o Pro mantém-se. */
const PAYING = new Set(['active', 'trialing', 'past_due'])
/** Margem depois do fim do período, para a renovação chegar sem a conta piscar para Grátis. */
const GRACE_MS = 3 * 24 * 60 * 60 * 1000

export async function customerOf(db: Queryable, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(`select stripe_customer_id as id from billing_customer where user_id = $1`, [userId])
  return rows[0]?.id ?? null
}

export async function saveCustomer(db: Queryable, userId: string, customerId: string): Promise<void> {
  await db.query(
    `insert into billing_customer (user_id, stripe_customer_id) values ($1, $2)
     on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id`,
    [userId, customerId]
  )
}

/** A conta dona de uma subscrição: pelo cliente guardado ou, se ainda não houver, pelos metadados. */
export async function userForSubscription(db: Queryable, sub: StripeSubscription, hint?: string | null): Promise<string | null> {
  const { rows } = await db.query<{ user_id: string }>(`select user_id from billing_customer where stripe_customer_id = $1`, [sub.customer])
  const candidate = rows[0]?.user_id ?? sub.metadata?.user_id ?? hint ?? null
  if (!candidate) return null
  const exists = await db.query(`select 1 from "user" where id = $1`, [candidate])
  return exists.rowCount ? candidate : null
}

/**
 * Põe o plano da conta de acordo com a subscrição (a fonte de verdade é a Stripe).
 * Um Pro dado à mão por um admin nunca é encurtado por isto.
 */
export async function applySubscription(db: Queryable, userId: string, sub: StripeSubscription): Promise<'pro' | 'free'> {
  const end = periodEnd(sub)
  if (PAYING.has(sub.status) && end) {
    const expires = new Date(end * 1000 + GRACE_MS)
    await db.query(
      `insert into entitlement (user_id, plan, source, expires_at, note) values ($1, 'pro', 'stripe', $2, $3)
       on conflict (user_id) do update set source = 'stripe', expires_at = excluded.expires_at, note = excluded.note, updated_at = now()
       where entitlement.source = 'stripe' or (entitlement.expires_at is not null and entitlement.expires_at < excluded.expires_at)`,
      [userId, expires, `stripe:${sub.id}`]
    )
    return 'pro'
  }
  // Cancelada, por pagar ou expirada: tira o Pro que veio desta subscrição.
  await db.query(`delete from entitlement where user_id = $1 and source = 'stripe' and note = $2`, [userId, `stripe:${sub.id}`])
  return 'free'
}
