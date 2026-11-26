import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { cleanup, launchApp, signIn, startServer, waitForMail, type TestServer } from './helpers'

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/remind_test'
let server: TestServer

test.beforeAll(async () => {
  server = await startServer(8795)
})
test.afterAll(async () => {
  await server.stop()
})

test('conta grátis: botão Remind Pro; depois de pagar, a app passa a Pro sozinha', async () => {
  test.setTimeout(120_000)
  const email = `pro-${randomUUID().slice(0, 8)}@exemplo.pt`
  const password = 'palavra-passe-e2e-1'
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

  // Grátis: o botão aparece na barra lateral e nas Definições.
  await expect(window.getByTestId('open-pro')).toBeVisible()
  await window.getByTestId('open-pro').click()
  // O servidor deu um link de uso único para a página /pro (o browser não abre nos testes).
  await expect(window.getByTestId('pro-notice')).toContainText('Abrimos a página do Remind Pro')

  // A Stripe confirma o pagamento → o servidor dá Pro à conta.
  const db = new pg.Pool({ connectionString: DATABASE_URL })
  await db.query(
    `insert into entitlement (user_id, plan, source, expires_at) select id, 'pro', 'stripe', now() + interval '30 days' from "user" where email = $1`,
    [email]
  )
  await db.end()

  // O browser devolve a pessoa à app com remind://pro/ativado.
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('deep-link', { kind: 'pro-activated' }))
  await expect(window.getByTestId('open-pro')).toBeHidden()
  await expect(window.getByTestId('pro-notice')).toBeHidden()
  await window.getByRole('button', { name: 'Definições' }).first().click()
  await expect(window.getByTestId('settings-plan')).toContainText('Remind Pro: páginas ilimitadas')
  await expect(window.getByTestId('settings-pro')).toHaveText('Gerir subscrição')

  await a.close()
  cleanup(a.userData)
})
