import { expect, test, type Page, type Route } from '@playwright/test'

// Página de compra do Remind Pro, com o servidor simulado. A API está testada no servidor (billing.test.ts).
const STATUS: { email: string; plan: string; source: string | null; expiresAt: string | null; available: boolean; canManage: boolean } = { email: 'ana@exemplo.pt', plan: 'free', source: null, expiresAt: null, available: true, canManage: false }

async function mockApi(page: Page, start: { signedIn?: boolean; status?: Partial<typeof STATUS>; proAfter?: number } = {}) {
  let signedIn = start.signedIn ?? true
  let status = { ...STATUS, ...start.status }
  let polls = 0
  const posted: { path: string; body: unknown }[] = []
  const json = (route: Route, code: number, body: unknown) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route(/\/(api\/|pro\/sair)/, async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.method() !== 'GET') posted.push({ path, body: req.postDataJSON() })
    if (path === '/api/billing/status') {
      if (!signedIn) return json(route, 401, { error: 'Sessão inválida' })
      polls++
      if (start.proAfter && polls >= start.proAfter) status = { ...status, plan: 'pro', source: 'stripe', expiresAt: '2027-11-26T00:00:00Z', canManage: true }
      return json(route, 200, status)
    }
    if (path === '/api/auth/sign-in/email') return json(route, 200, { twoFactorRedirect: true })
    if (path === '/api/auth/two-factor/send-otp') return json(route, 200, { status: true })
    if (path === '/api/auth/two-factor/verify-otp') {
      signedIn = true
      return json(route, 200, { token: 'x' })
    }
    if (path === '/pro/sair') {
      signedIn = false
      return json(route, 200, { ok: true })
    }
    if (path === '/api/auth/sign-out') {
      signedIn = false
      return json(route, 200, { success: true })
    }
    if (path === '/api/billing/checkout') return json(route, 200, { url: 'https://checkout.stripe.com/c/pay/cs_test' })
    if (path === '/api/billing/portal') return json(route, 200, { url: 'https://billing.stripe.com/p/session/x' })
    return json(route, 404, { error: 'não simulado' })
  })
  // A Stripe não é aberta a sério: só confirmamos que a página vai para lá.
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe Checkout</h1>' }))
  await page.route('https://billing.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe Portal</h1>' }))
  return { posted }
}

test('sem sessão: entra com email, palavra-passe e código, e vê os planos', async ({ page }) => {
  await mockApi(page, { signedIn: false })
  await page.goto('/admin/pro.html')
  await expect(page.getByText('Remind Pro')).toBeVisible()
  await expect(page.getByTestId('get-app')).toHaveAttribute('href', 'https://remind.uno')
  await page.getByLabel('Email').fill('ana@exemplo.pt')
  await page.getByLabel('Palavra-passe').fill('palavra-passe')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByLabel('Código').fill('123456')
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page.getByRole('heading', { name: 'Mais espaço para as tuas ideias' })).toBeVisible()
  await expect(page.getByText('Conta: ana@exemplo.pt')).toBeVisible()
})

test('escolher o plano anual leva à página de pagamento da Stripe', async ({ page }) => {
  const { posted } = await mockApi(page)
  await page.goto('/admin/pro.html')
  await expect(page.getByText('24 €')).toBeVisible()
  await expect(page.getByText('2,99 €')).toBeVisible()
  await page.getByTestId('buy-year').click()
  await expect(page.getByRole('heading', { name: 'Stripe Checkout' })).toBeVisible()
  expect(posted).toContainEqual({ path: '/api/billing/checkout', body: { interval: 'year' } })
})

test('pagamentos ainda não configurados: os botões ficam desligados', async ({ page }) => {
  await mockApi(page, { status: { available: false } })
  await page.goto('/admin/pro.html')
  await expect(page.getByTestId('unavailable')).toBeVisible()
  await expect(page.getByTestId('buy-month')).toBeDisabled()
})

test('já é Pro: mostra a renovação e abre a gestão da subscrição', async ({ page }) => {
  await mockApi(page, { status: { plan: 'pro', source: 'stripe', expiresAt: '2027-11-26T00:00:00Z', canManage: true } })
  await page.goto('/admin/pro.html')
  await expect(page.getByTestId('pro-active')).toContainText('26 de novembro de 2027')
  await page.getByTestId('manage').click()
  await expect(page.getByRole('heading', { name: 'Stripe Portal' })).toBeVisible()
})

test('de volta da Stripe: espera pela ativação e depois oferece voltar à app', async ({ page }) => {
  await mockApi(page, { proAfter: 3 })
  await page.goto('/admin/pro.html?session_id=cs_test')
  await expect(page.getByTestId('thanks-waiting')).toBeVisible()
  await expect(page.getByTestId('thanks-active')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('link', { name: 'Voltar ao Remind' })).toHaveAttribute('href', 'remind://pro/ativado')
})

test('sair troca de conta (só neste browser, a app continua ligada)', async ({ page }) => {
  const { posted } = await mockApi(page)
  await page.goto('/admin/pro.html')
  await page.getByTestId('sign-out').click()
  await expect(page.getByLabel('Email')).toBeVisible()
  expect(posted.map((p) => p.path)).toContain('/pro/sair')
  expect(posted.map((p) => p.path)).not.toContain('/api/auth/sign-out')
})
