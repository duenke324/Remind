import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { cleanup, launchApp, signIn, startServer, waitForMail, type TestServer } from './helpers'

// Uma "Google" local: responde como a Google Calendar API e guarda o que o Remind lhe pede.
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/remind_test'
const PRIMARY = 'ana@gmail.com'
const today = new Date()
const at = (h: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h).toISOString()
const events: Record<string, unknown>[] = [{ id: 'reuniao', summary: 'Reunião de equipa', start: { dateTime: at(10) }, end: { dateTime: at(11) } }]
const posted: Record<string, any>[] = []

let google: Server
let server: TestServer

test.beforeAll(async () => {
  google = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x')
      res.setHeader('content-type', 'application/json')
      if (url.pathname.endsWith('/users/me/calendarList')) {
        return res.end(JSON.stringify({ items: [{ id: PRIMARY, summary: 'Ana', backgroundColor: '#4285f4', primary: true, accessRole: 'owner' }, { id: 'equipa@group.calendar.google.com', summary: 'Equipa', accessRole: 'writer' }] }))
      }
      if (req.method === 'POST') {
        const e = { id: `novo${posted.length}`, ...JSON.parse(body) }
        posted.push(e)
        events.push(e)
        return res.end(JSON.stringify(e))
      }
      if (url.pathname.includes(encodeURIComponent(PRIMARY)) || url.pathname.includes(PRIMARY)) return res.end(JSON.stringify({ items: events }))
      return res.end(JSON.stringify({ items: [] }))
    })
  })
  await new Promise<void>((r) => google.listen(8799, r))
  server = await startServer(8796, { GOOGLE_CALENDAR_API_URL: 'http://localhost:8799/calendar/v3', GOOGLE_CLIENT_ID: 'cliente-e2e', GOOGLE_CLIENT_SECRET: 'segredo-e2e' })
})

test.afterAll(async () => {
  await server.stop()
  google.close()
})

test('calendário: ligar, ver os eventos da Google e criar um evento', async () => {
  test.setTimeout(120_000)
  const email = `cal-${randomUUID().slice(0, 8)}@exemplo.pt`
  const password = 'palavra-passe-e2e-1'

  // Conta criada e confirmada pela API (o percurso de criar conta já tem o seu teste).
  const signUp = await fetch(`${server.url}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: server.url },
    body: JSON.stringify({ email, password, name: 'Ana' })
  })
  expect(signUp.status).toBe(200)
  await fetch(await waitForMail(server, email, /http:\/\/\S+verify-email\S+/), { redirect: 'manual' })

  const a = await launchApp(server.url)
  const { window } = a
  await signIn(window, server, email, password)

  // Ainda sem Google: o calendário pede para ligar.
  await window.getByTestId('open-calendar').click()
  await expect(window.getByTestId('cal-connect')).toBeVisible()

  // "Ligar" (o passo no browser com a Google fica de fora): a conta Google fica ligada na base de dados.
  const db = new pg.Pool({ connectionString: DATABASE_URL })
  const userId = (await db.query<{ id: string }>('select id from "user" where email = $1', [email])).rows[0]!.id
  await db.query(
    `insert into account (id, "accountId", "providerId", "userId", "accessToken", "refreshToken", "accessTokenExpiresAt", scope, "createdAt", "updatedAt")
     values ($1, $2, 'google', $3, 'token', 'refresh', now() + interval '1 hour', $4, now(), now())`,
    [randomUUID(), `g-${randomUUID()}`, userId, 'openid,https://www.googleapis.com/auth/calendar.events,https://www.googleapis.com/auth/calendar.calendarlist.readonly']
  )
  await db.end()
  await window.getByRole('tab', { name: 'Semana' }).click()
  await window.getByRole('tab', { name: 'Mês' }).click()

  await expect(window.getByRole('button', { name: /Reunião de equipa/ })).toBeVisible()
  // Grátis: o calendário "Equipa" aparece bloqueado (Pro).
  await expect(window.locator('.cal-filter.locked', { hasText: 'Equipa' })).toBeVisible()

  // Criar um evento de dia inteiro hoje.
  await window.getByTestId('cal-new').click()
  const dialog = window.getByRole('dialog', { name: 'Novo evento' })
  await dialog.getByLabel('Título').fill('Aniversário da Rita')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog).toBeHidden()
  await expect(window.getByRole('button', { name: /Aniversário da Rita/ })).toBeVisible()
  expect(posted[0]).toMatchObject({ summary: 'Aniversário da Rita', start: { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } })

  // Vista de semana mostra o evento com hora na grelha.
  await window.getByRole('tab', { name: 'Semana' }).click()
  await expect(window.locator('.cal-block', { hasText: 'Reunião de equipa' })).toBeVisible()

  await a.close()
  cleanup(a.userData)
})
