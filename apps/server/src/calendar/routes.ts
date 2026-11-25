import { Hono } from 'hono'
import type pg from 'pg'
import * as z from 'zod'
import type { Auth } from '../auth'
import { planOf } from '../plans'
import { CALENDAR_SCOPES, createGoogleCalendar, GOOGLE_CALENDAR_API, GoogleError, type Calendar, type Fetch } from './google'

const DAY = 86_400_000
const MAX_RANGE_DAYS = 100
const CAL_ID = /^[^\s/]{1,320}$/
const EVENT_ID = /^[A-Za-z0-9_-]{1,1024}$/

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoDateTime = z.iso.datetime({ offset: true })
const eventSchema = z
  .object({
    calendarId: z.string().regex(CAL_ID),
    title: z.string().trim().min(1).max(1024),
    description: z.string().max(8000).nullable().optional(),
    location: z.string().max(1024).nullable().optional(),
    allDay: z.boolean(),
    start: z.string(),
    end: z.string(),
    timeZone: z.string().max(64).optional()
  })
  .strict()
  .superRefine((v, ctx) => {
    const fmt = v.allDay ? isoDate : isoDateTime
    if (!fmt.safeParse(v.start).success || !fmt.safeParse(v.end).success) ctx.addIssue({ code: 'custom', message: 'datas inválidas' })
    else if (new Date(v.end) <= new Date(v.start)) ctx.addIssue({ code: 'custom', message: 'o fim tem de ser depois do início' })
  })

class CalendarRefusal extends Error {
  constructor(
    readonly status: 400 | 402 | 403 | 404 | 409 | 502,
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

interface LinkedAccount {
  id: string
  scope: string | null
  accountId: string
}

/** A conta Google ligada a este utilizador com acesso ao calendário (ou null). */
export async function calendarAccount(pool: pg.Pool, userId: string): Promise<LinkedAccount | null> {
  const { rows } = await pool.query<LinkedAccount>(
    `select id, scope, "accountId" as "accountId" from account
     where "userId" = $1 and "providerId" = 'google' and scope like $2 and ("refreshToken" is not null or "accessToken" is not null)
     order by "updatedAt" desc limit 1`,
    [userId, `%${CALENDAR_SCOPES[0]}%`]
  )
  return rows[0] ?? null
}

/**
 * Calendário Google: ver, criar, editar e apagar eventos.
 * Plano grátis: só o calendário principal. Pro: todos os calendários da conta Google.
 */
export function calendarRoutes(auth: Auth, pool: pg.Pool, baseURL: string, fetchImpl: Fetch = fetch, apiBase: string = GOOGLE_CALENDAR_API) {
  const app = new Hono<{ Variables: { userId: string } }>()

  app.use('*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'Sessão inválida' }, 401)
    c.set('userId', session.user.id)
    await next()
  })

  app.onError((error, c) => {
    if (error instanceof CalendarRefusal) return c.json({ error: error.message, ...(error.code && { code: error.code }) }, error.status)
    if (error instanceof GoogleError) {
      if (error.status === 401) return c.json({ error: 'A ligação à Google expirou. Liga o calendário outra vez.', code: 'CALENDAR_RECONNECT' }, 409)
      if (error.status === 403 || error.status === 404) return c.json({ error: error.message }, error.status)
      return c.json({ error: 'A Google não respondeu. Tenta daqui a pouco.' }, 502)
    }
    throw error
  })

  async function google(userId: string) {
    const account = await calendarAccount(pool, userId)
    if (!account) throw new CalendarRefusal(409, 'Calendário Google não ligado', 'CALENDAR_NOT_CONNECTED')
    let accessToken: string | undefined
    try {
      ;({ accessToken } = await auth.api.getAccessToken({ body: { accountId: account.id, userId } }))
    } catch {
      throw new CalendarRefusal(409, 'A ligação à Google expirou. Liga o calendário outra vez.', 'CALENDAR_RECONNECT')
    }
    if (!accessToken) throw new CalendarRefusal(409, 'A ligação à Google expirou. Liga o calendário outra vez.', 'CALENDAR_RECONNECT')
    return createGoogleCalendar(accessToken, fetchImpl, apiBase)
  }

  /** Calendários a que esta conta tem acesso no Remind (grátis: só o principal). */
  async function allowedCalendars(userId: string, api: Awaited<ReturnType<typeof google>>) {
    const [plan, calendars] = await Promise.all([planOf(pool, userId), api.calendars()])
    const pro = plan === 'pro'
    const list = calendars.map((cal) => ({ ...cal, locked: !pro && !cal.primary }))
    return { pro, list }
  }

  function ensureAllowed(list: (Calendar & { locked: boolean })[], calendarId: string, forWrite: boolean) {
    const cal = calendarId === 'primary' ? list.find((c) => c.primary) : list.find((c) => c.id === calendarId)
    if (!cal) throw new CalendarRefusal(404, 'Calendário não encontrado')
    if (cal.locked) throw new CalendarRefusal(402, 'Ver outros calendários além do principal é do Remind Pro', 'PRO_REQUIRED')
    if (forWrite && !cal.canEdit) throw new CalendarRefusal(403, 'Este calendário é só de leitura')
    return cal
  }

  app.get('/status', async (c) => {
    const userId = c.get('userId')
    const [account, plan] = await Promise.all([calendarAccount(pool, userId), planOf(pool, userId)])
    return c.json({ connected: Boolean(account), plan, allCalendars: plan === 'pro' })
  })

  // A app abre este link no browser: entra com a sessão da app (token de uso único) e segue para a Google.
  app.post('/connect', async (c) => {
    const { token } = await auth.api.generateOneTimeToken({ headers: c.req.raw.headers })
    return c.json({ url: `${baseURL}/calendar/connect?token=${encodeURIComponent(token)}` })
  })

  app.delete('/connection', async (c) => {
    const userId = c.get('userId')
    const account = await calendarAccount(pool, userId)
    if (!account) return c.json({ ok: true })
    const { rows } = await pool.query<{ refreshToken: string | null; accessToken: string | null }>(
      `select "refreshToken" as "refreshToken", "accessToken" as "accessToken" from account where id = $1`,
      [account.id]
    )
    // Tira o acesso ao calendário; se a pessoa também entra com a Google, o login continua a funcionar.
    const scopes = (account.scope ?? '')
      .split(/[ ,]+/)
      .filter((s) => s && !CALENDAR_SCOPES.includes(s))
      .join(',')
    await pool.query(
      `update account set scope = $2, "accessToken" = null, "refreshToken" = null, "accessTokenExpiresAt" = null, "updatedAt" = now() where id = $1`,
      [account.id, scopes]
    )
    const token = rows[0]?.refreshToken ?? rows[0]?.accessToken
    if (token) {
      // Pede também à Google para esquecer a autorização (se falhar, a pessoa pode fazê-lo na conta Google).
      await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined)
    }
    return c.json({ ok: true })
  })

  app.get('/calendars', async (c) => {
    const userId = c.get('userId')
    const { pro, list } = await allowedCalendars(userId, await google(userId))
    return c.json({ pro, calendars: list })
  })

  app.get('/events', async (c) => {
    const userId = c.get('userId')
    const from = c.req.query('from') ?? ''
    const to = c.req.query('to') ?? ''
    if (!isoDateTime.safeParse(from).success || !isoDateTime.safeParse(to).success) throw new CalendarRefusal(400, 'Intervalo inválido')
    const span = new Date(to).getTime() - new Date(from).getTime()
    if (span <= 0 || span > MAX_RANGE_DAYS * DAY) throw new CalendarRefusal(400, `Intervalo até ${MAX_RANGE_DAYS} dias`)

    const api = await google(userId)
    const { list } = await allowedCalendars(userId, api)
    const requested = (c.req.query('calendars') ?? '').split(',').filter(Boolean)
    const visible = list.filter((cal) => !cal.locked && (requested.length === 0 || requested.includes(cal.id)))
    const perCalendar = await Promise.all(
      visible.map(async (cal) => (await api.events(cal.id, from, to)).map((e) => ({ ...e, color: cal.color, canEdit: cal.canEdit })))
    )
    const events = perCalendar.flat().sort((a, b) => a.start.localeCompare(b.start))
    return c.json({ events, calendars: list })
  })

  async function body(c: { req: { json: () => Promise<unknown> } }) {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      throw new CalendarRefusal(400, 'JSON inválido')
    }
    const parsed = eventSchema.safeParse(raw)
    if (!parsed.success) throw new CalendarRefusal(400, parsed.error.issues[0]?.message ?? 'Dados inválidos')
    return parsed.data
  }

  app.post('/events', async (c) => {
    const userId = c.get('userId')
    const input = await body(c)
    const api = await google(userId)
    const cal = ensureAllowed((await allowedCalendars(userId, api)).list, input.calendarId, true)
    const event = await api.create(cal.id, input)
    return c.json({ event: { ...event, color: cal.color, canEdit: true } })
  })

  app.patch('/events/:calendarId/:eventId', async (c) => {
    const userId = c.get('userId')
    const calendarId = c.req.param('calendarId')
    const eventId = c.req.param('eventId')
    if (!CAL_ID.test(calendarId) || !EVENT_ID.test(eventId)) throw new CalendarRefusal(404, 'Evento não encontrado')
    const input = await body(c)
    if (input.calendarId !== calendarId) throw new CalendarRefusal(400, 'Mudar um evento de calendário ainda não é possível')
    const api = await google(userId)
    const cal = ensureAllowed((await allowedCalendars(userId, api)).list, calendarId, true)
    const event = await api.update(cal.id, eventId, input)
    return c.json({ event: { ...event, color: cal.color, canEdit: true } })
  })

  app.delete('/events/:calendarId/:eventId', async (c) => {
    const userId = c.get('userId')
    const calendarId = c.req.param('calendarId')
    const eventId = c.req.param('eventId')
    if (!CAL_ID.test(calendarId) || !EVENT_ID.test(eventId)) throw new CalendarRefusal(404, 'Evento não encontrado')
    const api = await google(userId)
    const cal = ensureAllowed((await allowedCalendars(userId, api)).list, calendarId, true)
    await api.remove(cal.id, eventId)
    return c.json({ ok: true })
  })

  return app
}
