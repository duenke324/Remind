import { Hono } from 'hono'
import type pg from 'pg'
import * as z from 'zod'
import type { Auth } from '../auth'

interface Admin {
  id: string
  email: string
}

const ID = /^[A-Za-z0-9_-]{1,64}$/
const FILTERS = ['todos', 'pro', 'gratis', 'banidos', 'por-verificar', 'admins'] as const

const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
  filtro: z.enum(FILTERS).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
})
const planSchema = z.object({ plan: z.enum(['pro', 'free']), until: z.iso.datetime().nullable().optional(), note: z.string().max(500).optional() }).strict()
const banSchema = z.object({ reason: z.string().trim().min(1).max(500), days: z.number().int().min(1).max(3650).nullable().optional() }).strict()
const roleSchema = z.object({ role: z.enum(['admin', 'user']) }).strict()
const deleteSchema = z.object({ confirmEmail: z.string().max(320) }).strict()

/** Recusa com uma mensagem para mostrar no painel. Tem de ser um Error: o Hono só passa Errors ao onError. */
class Refusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message)
  }
}

/**
 * API do painel de admin. Só contas com papel "admin"; cada ação fica registada em admin_audit.
 * Ações disponíveis: ver números, procurar contas, ver uma conta, dar/tirar Pro, banir/desbanir,
 * terminar sessões, mudar papel e apagar. Não há "entrar como" nem mudar a password de outra pessoa.
 */
export function adminRoutes(auth: Auth, pool: pg.Pool) {
  const app = new Hono<{ Variables: { admin: Admin } }>()

  app.use('*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'Sessão inválida' }, 401)
    if ((session.user as { role?: string }).role !== 'admin') return c.json({ error: 'Sem permissão' }, 403)
    c.set('admin', { id: session.user.id, email: session.user.email })
    await next()
  })

  app.onError((error, c) => {
    if (error instanceof Refusal) return c.json({ error: error.message }, error.status)
    throw error
  })

  async function targetOf(id: string) {
    if (!ID.test(id)) throw new Refusal(404, 'Conta não encontrada')
    const { rows } = await pool.query<{ id: string; email: string; role: string | null }>(
      'select id, email, role from "user" where id = $1',
      [id]
    )
    if (!rows[0]) throw new Refusal(404, 'Conta não encontrada')
    return rows[0]
  }

  async function audit(admin: Admin, target: { id: string; email: string } | null, action: string, details: object = {}) {
    await pool.query(
      `insert into admin_audit (admin_id, admin_email, target_id, target_email, action, details) values ($1, $2, $3, $4, $5, $6)`,
      [admin.id, admin.email, target?.id ?? null, target?.email ?? null, action, JSON.stringify(details)]
    )
  }

  function notSelf(admin: Admin, targetId: string, what: string) {
    if (admin.id === targetId) throw new Refusal(409, `Não podes ${what} a tua própria conta`)
  }

  async function body<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>): Promise<T> {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      throw new Refusal(400, 'JSON inválido')
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new Refusal(400, 'Dados inválidos')
    return parsed.data
  }

  app.get('/me', (c) => c.json({ admin: c.get('admin') }))

  app.get('/stats', async (c) => {
    const { rows } = await pool.query<Record<string, string>>(`
      select
        (select count(*) from "user") as users,
        (select count(*) from "user" where "emailVerified") as verified,
        (select count(*) from "user" where "createdAt" > now() - interval '7 days') as new_7d,
        (select count(*) from "user" where "createdAt" > now() - interval '30 days') as new_30d,
        (select count(*) from "user" where banned) as banned,
        (select count(*) from entitlement where plan = 'pro' and (expires_at is null or expires_at > now())) as pro,
        (select count(*) from page where deleted = false) as pages,
        (select count(distinct "userId") from session where "updatedAt" > now() - interval '7 days') as active_7d
    `)
    const r = rows[0]!
    const n = (k: string) => Number(r[k] ?? 0)
    const { rows: weekly } = await pool.query<{ week: Date; n: string }>(`
      select date_trunc('week', "createdAt") as week, count(*) as n from "user"
      where "createdAt" > now() - interval '12 weeks' group by 1 order by 1`)
    return c.json({
      users: n('users'),
      verified: n('verified'),
      new7d: n('new_7d'),
      new30d: n('new_30d'),
      banned: n('banned'),
      pro: n('pro'),
      pages: n('pages'),
      active7d: n('active_7d'),
      signupsByWeek: weekly.map((w) => ({ week: w.week.toISOString(), count: Number(w.n) }))
    })
  })

  app.get('/users', async (c) => {
    const parsed = listSchema.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Parâmetros inválidos' }, 400)
    const { q, filtro = 'todos', offset = 0, limit = 25 } = parsed.data
    const where: string[] = []
    const params: unknown[] = []
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)
      where.push(`(u.email ilike $${params.length} or u.name ilike $${params.length})`)
    }
    if (filtro === 'pro') where.push('e.user_id is not null')
    if (filtro === 'gratis') where.push('e.user_id is null')
    if (filtro === 'banidos') where.push('u.banned')
    if (filtro === 'por-verificar') where.push('not u."emailVerified"')
    if (filtro === 'admins') where.push(`u.role = 'admin'`)
    const sql = `
      from "user" u
      left join entitlement e on e.user_id = u.id and e.plan = 'pro' and (e.expires_at is null or e.expires_at > now())
      ${where.length ? `where ${where.join(' and ')}` : ''}`
    const total = Number((await pool.query<{ n: string }>(`select count(*) as n ${sql}`, params)).rows[0]?.n ?? 0)
    const { rows } = await pool.query(
      `select u.id, u.name, u.email, u."emailVerified" as "emailVerified", u.role, u.banned, u."createdAt" as "createdAt",
              (e.user_id is not null) as pro,
              (select count(*)::int from page p where p.user_id = u.id and p.deleted = false) as pages,
              (select max(s."updatedAt") from session s where s."userId" = u.id) as "lastSeenAt"
       ${sql} order by u."createdAt" desc offset $${params.length + 1} limit $${params.length + 2}`,
      [...params, offset, limit]
    )
    return c.json({ total, users: rows })
  })

  app.get('/users/:id', async (c) => {
    const target = await targetOf(c.req.param('id'))
    const user = (
      await pool.query(
        `select id, name, email, "emailVerified" as "emailVerified", image, role, banned, "banReason" as "banReason",
                "banExpires" as "banExpires", "createdAt" as "createdAt", "updatedAt" as "updatedAt" from "user" where id = $1`,
        [target.id]
      )
    ).rows[0]
    const entitlement = (
      await pool.query(`select plan, source, expires_at as "expiresAt", note, created_at as "createdAt" from entitlement where user_id = $1`, [target.id])
    ).rows[0] ?? null
    const pages = (
      await pool.query<{ total: number; trashed: number; bytes: string }>(
        `select count(*)::int as total, count(*) filter (where trashed_at is not null)::int as trashed,
                coalesce(sum(pg_column_size(content)), 0) as bytes
         from page where user_id = $1 and deleted = false`,
        [target.id]
      )
    ).rows[0]
    const sessions = (
      await pool.query(
        `select id, "createdAt" as "createdAt", "updatedAt" as "updatedAt", "expiresAt" as "expiresAt",
                "ipAddress" as "ipAddress", "userAgent" as "userAgent"
         from session where "userId" = $1 and "expiresAt" > now() order by "updatedAt" desc limit 20`,
        [target.id]
      )
    ).rows
    const providers = (await pool.query<{ providerId: string }>(`select "providerId" from account where "userId" = $1`, [target.id])).rows.map(
      (r) => r.providerId
    )
    const history = (
      await pool.query(
        `select admin_email as "adminEmail", action, details, created_at as "createdAt"
         from admin_audit where target_id = $1 order by created_at desc limit 50`,
        [target.id]
      )
    ).rows
    return c.json({
      user,
      plan: entitlement && (!entitlement.expiresAt || new Date(entitlement.expiresAt) > new Date()) ? 'pro' : 'free',
      entitlement,
      pages: { total: pages?.total ?? 0, trashed: pages?.trashed ?? 0, bytes: Number(pages?.bytes ?? 0) },
      sessions,
      providers,
      history
    })
  })

  app.post('/users/:id/plan', async (c) => {
    const admin = c.get('admin')
    const target = await targetOf(c.req.param('id'))
    const { plan, until, note } = await body(c, planSchema)
    if (plan === 'pro') {
      const current = (await pool.query<{ source: string }>('select source from entitlement where user_id = $1', [target.id])).rows[0]
      if (current?.source === 'stripe') throw new Refusal(409, 'Esta conta paga pelo Stripe; gere a subscrição no Stripe')
      await pool.query(
        `insert into entitlement (user_id, plan, source, expires_at, granted_by, note) values ($1, 'pro', 'manual', $2, $3, $4)
         on conflict (user_id) do update set plan = 'pro', source = 'manual', expires_at = $2, granted_by = $3, note = $4, updated_at = now()`,
        [target.id, until ?? null, admin.email, note ?? null]
      )
    } else {
      const removed = await pool.query(`delete from entitlement where user_id = $1 and source = 'manual'`, [target.id])
      if (removed.rowCount === 0) {
        const stripe = await pool.query(`select 1 from entitlement where user_id = $1 and source = 'stripe'`, [target.id])
        if (stripe.rowCount) throw new Refusal(409, 'Esta conta paga pelo Stripe; cancela a subscrição no Stripe')
      }
    }
    await audit(admin, target, plan === 'pro' ? 'dar-pro' : 'tirar-pro', { until: until ?? null, note: note ?? null })
    return c.json({ ok: true })
  })

  app.post('/users/:id/ban', async (c) => {
    const admin = c.get('admin')
    const target = await targetOf(c.req.param('id'))
    notSelf(admin, target.id, 'banir')
    const { reason, days } = await body(c, banSchema)
    await auth.api.banUser({
      headers: c.req.raw.headers,
      body: { userId: target.id, banReason: reason, ...(days ? { banExpiresIn: days * 86400 } : {}) }
    })
    await audit(admin, target, 'banir', { reason, days: days ?? null })
    return c.json({ ok: true })
  })

  app.post('/users/:id/unban', async (c) => {
    const admin = c.get('admin')
    const target = await targetOf(c.req.param('id'))
    await auth.api.unbanUser({ headers: c.req.raw.headers, body: { userId: target.id } })
    await audit(admin, target, 'desbanir')
    return c.json({ ok: true })
  })

  app.post('/users/:id/revoke-sessions', async (c) => {
    const admin = c.get('admin')
    const target = await targetOf(c.req.param('id'))
    notSelf(admin, target.id, 'terminar as sessões d')
    await auth.api.revokeUserSessions({ headers: c.req.raw.headers, body: { userId: target.id } })
    await audit(admin, target, 'terminar-sessoes')
    return c.json({ ok: true })
  })

  app.post('/users/:id/role', async (c) => {
    const admin = c.get('admin')
    const target = await targetOf(c.req.param('id'))
    notSelf(admin, target.id, 'mudar o papel d')
    const { role } = await body(c, roleSchema)
    await auth.api.setRole({ headers: c.req.raw.headers, body: { userId: target.id, role } })
    await audit(admin, target, 'mudar-papel', { from: target.role ?? 'user', to: role })
    return c.json({ ok: true })
  })

  app.delete('/users/:id', async (c) => {
    const admin = c.get('admin')
    const target = await targetOf(c.req.param('id'))
    notSelf(admin, target.id, 'apagar')
    const { confirmEmail } = await body(c, deleteSchema)
    if (confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
      throw new Refusal(400, 'Para apagar, escreve o email da conta')
    }
    await auth.api.removeUser({ headers: c.req.raw.headers, body: { userId: target.id } })
    await audit(admin, target, 'apagar-conta')
    return c.json({ ok: true })
  })

  app.get('/audit', async (c) => {
    const { rows } = await pool.query(
      `select admin_email as "adminEmail", target_email as "targetEmail", target_id as "targetId", action, details,
              created_at as "createdAt"
       from admin_audit order by created_at desc limit 200`
    )
    return c.json({ entries: rows })
  })

  return app
}
