import { Hono } from 'hono'
import type pg from 'pg'
import * as z from 'zod'
import type { Auth } from '../auth'
import { FREE_PAGE_LIMIT, pageCount, planOf } from '../plans'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_BODY_BYTES = 5 * 1024 * 1024

const coverSchema = z
  .string()
  .max(2000)
  .refine((v) => v.startsWith('https://') || /^preset:[a-z0-9-]{1,32}$/.test(v), 'capa inválida')

const putSchema = z
  .object({
    title: z.string().max(2000),
    icon: z.string().max(64).nullable(),
    cover: coverSchema.nullable(),
    parentId: z.string().regex(ID).nullable(),
    sort: z.number().finite(),
    favorite: z.boolean(),
    trashed: z.boolean(),
    content: z.array(z.unknown())
  })
  .partial()
  .strict()

interface PageRow {
  id: string
  user_id: string
  parent_id: string | null
  title: string
  icon: string | null
  cover: string | null
  sort: number
  favorite: boolean
  trashed_at: Date | null
  deleted: boolean
  content: unknown[]
  version: number
  seq: string
  created_at: Date
  updated_at: Date
}

function toPage(row: PageRow) {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    cover: row.cover,
    sort: row.sort,
    favorite: row.favorite,
    trashedAt: row.trashed_at?.toISOString() ?? null,
    deleted: row.deleted,
    content: row.content,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }
}

export type Page = ReturnType<typeof toPage>

/** Recusa o pedido sem alterar nada (a transação é desfeita pelo chamador). */
class Rejection {
  constructor(
    readonly status: 400 | 402 | 404 | 410,
    readonly message: string,
    readonly code?: string
  ) {}
}

export function pageRoutes(auth: Auth, pool: pg.Pool) {
  const app = new Hono<{ Variables: { userId: string } }>()

  app.use('*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'Sessão inválida' }, 401)
    c.set('userId', session.user.id)
    await next()
  })

  // Sem `since`: todas as páginas. Com `since`: só as alterações (incluindo apagadas) desde esse cursor.
  app.get('/', async (c) => {
    const userId = c.get('userId')
    const since = c.req.query('since')
    const sinceSeq = since && /^\d{1,19}$/.test(since) ? since : '0'
    const { rows } = await pool.query<PageRow>(
      `select * from page where user_id = $1 and seq > $2 and (deleted = false or $2 <> '0') order by seq`,
      [userId, sinceSeq]
    )
    const cursor = rows.length ? rows[rows.length - 1]!.seq : sinceSeq
    return c.json({ pages: rows.map(toPage), cursor })
  })

  app.put('/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!ID.test(id)) return c.json({ error: 'id inválido' }, 400)

    const raw = await c.req.text()
    if (raw.length > MAX_BODY_BYTES) return c.json({ error: 'página demasiado grande' }, 413)
    let body: unknown
    try {
      body = JSON.parse(raw || '{}')
    } catch {
      return c.json({ error: 'JSON inválido' }, 400)
    }
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'dados inválidos', issues: parsed.error.issues }, 400)
    const data = parsed.data

    const db = await pool.connect()
    try {
      await db.query('begin')
      const row = (await db.query<PageRow>('select * from page where id = $1 for update', [id])).rows[0]
      if (row && row.user_id !== userId) throw new Rejection(404, 'não encontrada')
      if (row?.deleted) throw new Rejection(410, 'página apagada')
      // Contas grátis: no máximo FREE_PAGE_LIMIT páginas (as do lixo também contam). Só se aplica a páginas novas.
      if (!row && (await planOf(db, userId)) === 'free' && (await pageCount(db, userId)) >= FREE_PAGE_LIMIT) {
        throw new Rejection(402, `O plano grátis tem até ${FREE_PAGE_LIMIT} páginas`, 'PAGE_LIMIT')
      }

      if (data.parentId) {
        if (data.parentId === id) throw new Rejection(400, 'uma página não pode estar dentro de si própria')
        // Sobe a árvore a partir da nova mãe: tem de existir, ser desta pessoa e não descender desta página.
        const ancestors = await db.query<{ id: string }>(
          `with recursive up as (
             select id, parent_id from page where id = $1 and user_id = $2 and deleted = false
             union all
             select p.id, p.parent_id from page p join up on p.id = up.parent_id where p.user_id = $2
           ) select id from up`,
          [data.parentId, userId]
        )
        if (ancestors.rowCount === 0 || ancestors.rows.some((r) => r.id === id)) {
          throw new Rejection(400, 'página-mãe inválida')
        }
      }

      const values: Record<string, unknown> = {
        parent_id: data.parentId,
        title: data.title,
        icon: data.icon,
        cover: data.cover,
        sort: data.sort,
        favorite: data.favorite,
        trashed_at: data.trashed === undefined ? undefined : data.trashed ? new Date() : null,
        content: data.content === undefined ? undefined : JSON.stringify(data.content)
      }
      const fields = Object.entries(values).filter(([, v]) => v !== undefined)

      let saved: PageRow
      if (!row) {
        const cols = ['id', 'user_id', ...fields.map(([k]) => k)]
        const params = [id, userId, ...fields.map(([, v]) => v)]
        saved = (
          await db.query<PageRow>(
            `insert into page (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
            params
          )
        ).rows[0]!
      } else {
        const sets = fields.map(([k], i) => `${k} = $${i + 2}`)
        saved = (
          await db.query<PageRow>(
            `update page set ${[...sets, 'version = version + 1', "seq = nextval('page_seq')", 'updated_at = now()'].join(', ')}
             where id = $1 returning *`,
            [id, ...fields.map(([, v]) => v)]
          )
        ).rows[0]!
      }
      await db.query('commit')
      return c.json({ page: toPage(saved) })
    } catch (error) {
      await db.query('rollback')
      if (error instanceof Rejection) return c.json({ error: error.message, ...(error.code && { code: error.code }) }, error.status)
      throw error
    } finally {
      db.release()
    }
  })

  // Apagar de vez: a página e as subpáginas ficam marcadas como apagadas, para os outros dispositivos saberem.
  app.delete('/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!ID.test(id)) return c.json({ error: 'id inválido' }, 400)
    const { rows } = await pool.query<{ id: string }>(
      `with recursive tree as (
         select id from page where id = $1 and user_id = $2 and deleted = false
         union all
         select p.id from page p join tree t on p.parent_id = t.id where p.user_id = $2 and p.deleted = false
       )
       update page set deleted = true, content = '[]'::jsonb, title = '', version = version + 1,
         seq = nextval('page_seq'), updated_at = now()
       where id in (select id from tree) returning id`,
      [id, userId]
    )
    if (rows.length === 0) return c.json({ error: 'não encontrada' }, 404)
    return c.json({ deleted: rows.map((r) => r.id) })
  })

  return app
}
