import { expect, test, type Page, type Route } from '@playwright/test'

// O servidor é simulado: estes testes verificam o painel (ecrãs, pedidos enviados, telemóvel).
// A API em si está testada no servidor (apps/server/tests/admin.test.ts).

const ME = { id: 'admin-1', email: 'admin@remind.uno' }
const USERS = [
  { id: 'u-1', name: 'Ana Silva', email: 'ana@exemplo.pt', emailVerified: true, role: null, banned: false, createdAt: '2026-11-20T10:00:00Z', pro: true, pages: 12, lastSeenAt: '2026-11-25T09:00:00Z' },
  { id: 'u-2', name: 'Bruno Costa', email: 'bruno@exemplo.pt', emailVerified: false, role: null, banned: true, createdAt: '2026-11-21T10:00:00Z', pro: false, pages: 50, lastSeenAt: null }
]

interface Calls {
  bodies: { path: string; method: string; body: unknown }[]
}

async function mockApi(page: Page, options: { signedIn?: boolean } = {}): Promise<Calls> {
  let signedIn = options.signedIn ?? true
  const calls: Calls = { bodies: [] }
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()
    if (method !== 'GET') calls.bodies.push({ path, method, body: req.postDataJSON() })

    if (path === '/api/admin/me') return signedIn ? json(route, 200, { admin: ME }) : json(route, 401, { error: 'Sessão inválida' })
    if (path === '/api/auth/sign-in/email') return json(route, 200, { twoFactorRedirect: true })
    if (path === '/api/auth/two-factor/send-otp') return json(route, 200, { status: true })
    if (path === '/api/auth/two-factor/verify-otp') {
      const { code } = req.postDataJSON() as { code: string }
      if (code !== '123456') return json(route, 401, { message: 'Código inválido' })
      signedIn = true
      return json(route, 200, { token: 'x' })
    }
    if (path === '/api/auth/sign-out') {
      signedIn = false
      return json(route, 200, { success: true })
    }
    if (path === '/api/admin/stats')
      return json(route, 200, {
        users: 1234,
        verified: 1100,
        new7d: 87,
        new30d: 310,
        banned: 3,
        pro: 42,
        pages: 9876,
        active7d: 400,
        signupsByWeek: [
          { week: '2026-11-03T00:00:00Z', count: 20 },
          { week: '2026-11-10T00:00:00Z', count: 35 },
          { week: '2026-11-17T00:00:00Z', count: 52 }
        ]
      })
    if (path === '/api/admin/users') {
      const q = url.searchParams.get('q') ?? ''
      const list = USERS.filter((u) => u.email.includes(q))
      return json(route, 200, { total: list.length, users: list })
    }
    const detail = path.match(/^\/api\/admin\/users\/([^/]+)$/)
    if (detail && method === 'GET') {
      const u = USERS.find((x) => x.id === detail[1])!
      return json(route, 200, {
        user: { ...u, image: null, banReason: u.banned ? 'spam' : null, banExpires: null, updatedAt: u.createdAt },
        plan: u.pro ? 'pro' : 'free',
        entitlement: u.pro ? { plan: 'pro', source: 'manual', expiresAt: null, note: null, createdAt: u.createdAt } : null,
        pages: { total: u.pages, trashed: 2, bytes: 204800 },
        sessions: [{ id: 's1', createdAt: u.createdAt, updatedAt: u.createdAt, expiresAt: '2026-12-25T00:00:00Z', ipAddress: '1.2.3.4', userAgent: 'Mozilla/5.0 (Macintosh) Electron/45' }],
        providers: ['credential'],
        history: []
      })
    }
    if (path.startsWith('/api/admin/users/')) return json(route, 200, { ok: true })
    if (path === '/api/admin/audit')
      return json(route, 200, { entries: [{ adminEmail: ME.email, targetEmail: 'ana@exemplo.pt', targetId: 'u-1', action: 'dar-pro', details: { note: 'oferta' }, createdAt: '2026-11-25T10:00:00Z' }] })
    return json(route, 404, { error: 'não simulado' })
  })
  return calls
}

test('entrar: palavra-passe e depois o código de 6 dígitos', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await page.goto('/admin/')
  await page.getByLabel('Email').fill('admin@remind.uno')
  await page.getByLabel('Palavra-passe').fill('segredo-forte')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('Enviámos um código de 6 dígitos para admin@remind.uno')).toBeVisible()
  await page.getByLabel('Código').fill('000000')
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page.getByRole('alert')).toContainText('errados')
  await page.getByLabel('Código').fill('123456')
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible()
})

test('visão geral mostra os números', async ({ page }) => {
  await mockApi(page)
  await page.goto('/admin/')
  await expect(page.getByText('1234').or(page.getByText('1 234')).first()).toBeVisible()
  await expect(page.getByText('Receita mensal estimada')).toBeVisible()
  await expect(page.getByRole('img', { name: /Contas novas por semana/ })).toBeVisible()
})

test('contas: procurar, abrir o detalhe e dar Pro por 30 dias', async ({ page }) => {
  const calls = await mockApi(page)
  await page.goto('/admin/#/contas')
  await expect(page.getByText('ana@exemplo.pt')).toBeVisible()
  await expect(page.getByText('bruno@exemplo.pt')).toBeVisible()
  await page.getByLabel('Procurar por email ou nome').fill('bruno')
  await expect(page.getByText('ana@exemplo.pt')).toBeHidden()

  await page.getByText('bruno@exemplo.pt').click()
  const drawer = page.getByRole('complementary', { name: 'Detalhe da conta' })
  await expect(drawer.getByText('Suspensa', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: 'Dar Pro' }).click()
  const dialog = page.getByRole('dialog', { name: 'Dar Remind Pro' })
  await dialog.getByLabel('Durante').selectOption('30')
  await dialog.getByRole('button', { name: 'Dar Pro' }).click()
  await expect(drawer.getByRole('status')).toHaveText('Pro dado.')
  const sent = calls.bodies.find((c) => c.path === '/api/admin/users/u-2/plan')
  expect(sent?.body).toMatchObject({ plan: 'pro' })
  const until = new Date((sent?.body as { until: string }).until).getTime()
  expect(Math.round((until - Date.now()) / 86400_000)).toBe(30)
})

test('apagar só fica ativo depois de escrever o email da conta', async ({ page }) => {
  const calls = await mockApi(page)
  await page.goto('/admin/#/contas/u-1')
  await page.getByRole('button', { name: 'Apagar conta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Apagar conta' })
  const confirm = dialog.getByRole('button', { name: 'Apagar para sempre' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/escreve o email/).fill('ANA@exemplo.pt')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page).toHaveURL(/#\/contas$/)
  expect(calls.bodies.find((c) => c.method === 'DELETE')?.body).toEqual({ confirmEmail: 'ANA@exemplo.pt' })
})

test('registo de ações e sair', async ({ page }) => {
  await mockApi(page)
  await page.goto('/admin/#/registo')
  await expect(page.getByRole('cell', { name: 'Deu Pro' })).toBeVisible()
  await page.goto('/admin/#/')
  const menu = page.getByRole('button', { name: 'Menu' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})

test('sem scroll horizontal (também no telemóvel)', async ({ page }) => {
  await mockApi(page)
  for (const hash of ['#/', '#/contas', '#/contas/u-1', '#/registo']) {
    await page.goto(`/admin/${hash}`)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, hash).toBeLessThanOrEqual(0)
  }
})
