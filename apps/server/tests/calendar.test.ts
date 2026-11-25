import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CALENDAR_SCOPES } from '../src/calendar/google'
import { createHarness } from './helpers/harness'

// A Google é simulada: guardamos os pedidos que o servidor lhe faz e respondemos como ela.
interface GoogleCall {
  method: string
  url: URL
  body: any
  auth: string | null
}
const calls: GoogleCall[] = []
let googleStatus = 200
const PRIMARY = 'eu@gmail.com'
const CALENDARS = [
  { id: PRIMARY, summary: 'Eu', backgroundColor: '#4285f4', primary: true, accessRole: 'owner' },
  { id: 'trabalho@group.calendar.google.com', summary: 'Trabalho', backgroundColor: '#0b8043', accessRole: 'writer' },
  { id: 'feriados@holiday.calendar.google.com', summary: 'Feriados', backgroundColor: '#f6bf26', accessRole: 'reader' }
]

const fakeGoogle: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : null
  calls.push({ method, url, body, auth: new Headers(init?.headers).get('authorization') })
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  if (url.hostname === 'oauth2.googleapis.com') return new Response(null, { status: 200 })
  if (googleStatus !== 200) return json({ error: { message: 'Invalid Credentials' } }, googleStatus)
  if (url.pathname.endsWith('/users/me/calendarList')) return json({ items: CALENDARS })
  const m = url.pathname.match(/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/)
  if (m) {
    const calendarId = decodeURIComponent(m[1]!)
    if (method === 'GET')
      return json({
        items: [
          { id: `ev-${calendarId.split('@')[0]}`, summary: `Evento de ${calendarId}`, start: { dateTime: '2026-12-01T10:00:00Z' }, end: { dateTime: '2026-12-01T11:00:00Z' } },
          { id: 'cancelado', status: 'cancelled' }
        ]
      })
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return json({ id: m[2] ?? 'novo-id', summary: body.summary, start: body.start, end: body.end, htmlLink: 'https://calendar.google.com/x' })
  }
  return json({ error: { message: 'não simulado' } }, 404)
}

const h = createHarness({ google: { clientId: 'cliente-teste', clientSecret: 'segredo-teste' }, fetchImpl: fakeGoogle })
let alice: ReturnType<typeof h.client>
let aliceId: string

async function connectGoogle(userId: string) {
  await h.pool.query(`delete from account where "userId" = $1 and "providerId" = 'google'`, [userId])
  await h.pool.query(
    `insert into account (id, "accountId", "providerId", "userId", "accessToken", "refreshToken", "accessTokenExpiresAt", scope, "createdAt", "updatedAt")
     values ($1, $2, 'google', $3, 'token-google', 'refresh-google', now() + interval '1 hour', $4, now(), now())`,
    [randomUUID(), `g-${randomUUID()}`, userId, ['openid', 'email', ...CALENDAR_SCOPES].join(',')]
  )
}

beforeAll(async () => {
  await h.setup()
  const email = `cal-${randomUUID()}@exemplo.pt`
  await h.createVerifiedUser(email)
  alice = h.client({ bearer: await h.desktopLogin(email) })
  aliceId = (await h.pool.query<{ id: string }>('select id from "user" where email = $1', [email])).rows[0]!.id
})
afterAll(() => h.pool.end())
beforeEach(() => {
  calls.length = 0
  googleStatus = 200
})

const range = 'from=2026-11-30T00:00:00Z&to=2027-01-11T00:00:00Z'
const setPro = (pro: boolean) =>
  pro
    ? h.pool.query(`insert into entitlement (user_id, plan, source) values ($1, 'pro', 'manual') on conflict (user_id) do nothing`, [aliceId])
    : h.pool.query('delete from entitlement where user_id = $1', [aliceId])

describe('calendário Google', () => {
  it('sem Google ligada: o estado diz e os eventos pedem para ligar', async () => {
    expect((await alice('/api/calendar/status')).json).toMatchObject({ connected: false, plan: 'free' })
    const res = await alice(`/api/calendar/events?${range}`)
    expect(res.status).toBe(409)
    expect(res.json.code).toBe('CALENDAR_NOT_CONNECTED')
  })

  it('ligar: a app recebe um link; o link segue para a Google a pedir acesso ao calendário (offline)', async () => {
    const res = await alice('/api/calendar/connect', { body: {} })
    expect(res.status).toBe(200)
    const url = new URL(res.json.url)
    expect(url.pathname).toBe('/calendar/connect')

    const browser = h.client()
    const go = await browser(url.pathname + url.search)
    expect(go.status).toBe(302)
    const google = new URL(go.headers.get('location')!)
    expect(google.hostname).toBe('accounts.google.com')
    const scope = google.searchParams.get('scope') ?? ''
    for (const s of CALENDAR_SCOPES) expect(scope).toContain(s)
    expect(google.searchParams.get('access_type')).toBe('offline')
    expect(google.searchParams.get('prompt')).toContain('consent')

    // O link é de uso único.
    expect((await browser(url.pathname + url.search)).status).toBe(400)
  })

  it('grátis: vê só o calendário principal; os outros aparecem bloqueados', async () => {
    await connectGoogle(aliceId)
    expect((await alice('/api/calendar/status')).json.connected).toBe(true)
    const cals = await alice('/api/calendar/calendars')
    expect(cals.json.calendars.map((c: any) => [c.name, c.locked])).toEqual([
      ['Eu', false],
      ['Feriados', true],
      ['Trabalho', true]
    ])

    const events = await alice(`/api/calendar/events?${range}`)
    expect(events.status).toBe(200)
    expect(events.json.events.map((e: any) => e.calendarId)).toEqual([PRIMARY])
    expect(events.json.events[0]).toMatchObject({ title: `Evento de ${PRIMARY}`, allDay: false, color: '#4285f4', canEdit: true })
    expect(calls.every((c) => c.auth === 'Bearer token-google')).toBe(true)
    const list = calls.find((c) => c.url.pathname.includes('/events'))!
    expect(list.url.searchParams.get('singleEvents')).toBe('true')
  })

  it('Pro: vê todos os calendários', async () => {
    await setPro(true)
    const events = await alice(`/api/calendar/events?${range}`)
    expect(new Set(events.json.events.map((e: any) => e.calendarId))).toEqual(new Set(CALENDARS.map((c) => c.id)))
    await setPro(false)
  })

  it('criar, editar e apagar um evento no calendário principal', async () => {
    const input = { calendarId: 'primary', title: 'Dentista', allDay: false, start: '2026-12-02T09:00:00+00:00', end: '2026-12-02T10:00:00+00:00', timeZone: 'Europe/Lisbon' }
    const created = await alice('/api/calendar/events', { body: input })
    expect(created.status).toBe(200)
    const post = calls.find((c) => c.method === 'POST')!
    expect(decodeURIComponent(post.url.pathname)).toContain(`/calendars/${PRIMARY}/events`)
    expect(post.body).toMatchObject({ summary: 'Dentista', start: { dateTime: input.start, timeZone: 'Europe/Lisbon' } })

    const allDay = await alice('/api/calendar/events', { body: { calendarId: PRIMARY, title: 'Férias', allDay: true, start: '2026-12-24', end: '2026-12-27' } })
    expect(allDay.status).toBe(200)
    expect(calls.filter((c) => c.method === 'POST')[1]!.body.start).toEqual({ date: '2026-12-24' })

    const edited = await alice(`/api/calendar/events/${encodeURIComponent(PRIMARY)}/novo-id`, { method: 'PATCH', body: { ...input, calendarId: PRIMARY, title: 'Dentista (mudou)' } })
    expect(edited.status).toBe(200)
    expect(calls.find((c) => c.method === 'PATCH')!.body.summary).toBe('Dentista (mudou)')

    expect((await alice(`/api/calendar/events/${encodeURIComponent(PRIMARY)}/novo-id`, { method: 'DELETE' })).status).toBe(200)
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('recusa datas inválidas, outros calendários no grátis e calendários só de leitura', async () => {
    const bad = await alice('/api/calendar/events', { body: { calendarId: 'primary', title: 'x', allDay: false, start: '2026-12-02T10:00:00Z', end: '2026-12-02T09:00:00Z' } })
    expect(bad.status).toBe(400)
    const locked = await alice('/api/calendar/events', { body: { calendarId: 'trabalho@group.calendar.google.com', title: 'x', allDay: true, start: '2026-12-02', end: '2026-12-03' } })
    expect(locked.status).toBe(402)
    expect(locked.json.code).toBe('PRO_REQUIRED')
    await setPro(true)
    const readOnly = await alice('/api/calendar/events', { body: { calendarId: 'feriados@holiday.calendar.google.com', title: 'x', allDay: true, start: '2026-12-02', end: '2026-12-03' } })
    expect(readOnly.status).toBe(403)
    await setPro(false)
    expect((await alice('/api/calendar/events?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z')).status).toBe(400)
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })

  it('se a Google recusar o acesso, a app é avisada para voltar a ligar', async () => {
    googleStatus = 401
    const res = await alice(`/api/calendar/events?${range}`)
    expect(res.status).toBe(409)
    expect(res.json.code).toBe('CALENDAR_RECONNECT')
  })

  it('desligar: tira o acesso ao calendário e pede à Google para o esquecer', async () => {
    expect((await alice('/api/calendar/connection', { method: 'DELETE' })).status).toBe(200)
    expect((await alice('/api/calendar/status')).json.connected).toBe(false)
    expect(calls.some((c) => c.url.hostname === 'oauth2.googleapis.com' && c.url.pathname === '/revoke')).toBe(true)
    const row = (await h.pool.query<{ scope: string; refreshToken: string | null }>(`select scope, "refreshToken" as "refreshToken" from account where "userId" = $1 and "providerId" = 'google'`, [aliceId])).rows[0]!
    expect(row.refreshToken).toBeNull()
    expect(row.scope).toBe('openid,email')
  })

  it('só a própria pessoa: sem sessão não há calendário', async () => {
    expect((await h.client()('/api/calendar/status')).status).toBe(401)
  })
})
