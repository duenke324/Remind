import { expect, test } from '@playwright/test'

test.describe('site do Remind', () => {
  test('carrega sem erros e a cena 3D arranca', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('As tuas ideias')
    await expect(page.locator('[data-hero]')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
    await expect(page.locator('[data-hero] canvas')).toHaveCount(1)
    expect(errors).toEqual([])
  })

  test('todas as ligações internas apontam para secções que existem', async ({ page }) => {
    await page.goto('/')
    const hrefs = await page.locator('a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
    for (const href of new Set(hrefs)) {
      await expect(page.locator(href), href).toHaveCount(1)
    }
  })

  test('não há scroll horizontal', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-hero]').waitFor()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    // No telemóvel, conteúdo largo demais faz o browser encolher a página toda (e o menu sai do ecrã).
    expect(await page.evaluate(() => window.innerWidth)).toBe(page.viewportSize()!.width)
    const toggle = await page.locator('[data-theme-toggle]').boundingBox()
    expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  })

  test('o tema muda e a captura da app acompanha', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const img = page.locator('[data-theme-img]')
    await expect(img).toHaveAttribute('src', './screens/app-claro.png')
    await page.locator('[data-theme-toggle]').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(img).toHaveAttribute('src', './screens/app-escuro.png')
    // Fica guardado para a próxima visita.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('com "reduzir movimento" o conteúdo aparece logo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('#seguranca h2')).toBeVisible()
    const opacity = await page.locator('#seguranca h2').evaluate((el) => getComputedStyle(el.closest('.reveal')!).opacity)
    expect(opacity).toBe('1')
  })
})

test.describe('downloads', () => {
  test('no Windows recomenda o instalador do Windows', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('[data-download-primary]')).toHaveText('Descarregar para Windows')
    await expect(page.locator('[data-download-primary]')).toHaveAttribute('href', /\/Remind-Setup\.exe$/)
    await expect(page.locator('[data-download="windows"]')).toHaveClass(/recommended/)
    await context.close()
  })

  test('no Mac recomenda Apple Silicon e oferece Intel', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15' })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('[data-download-primary]')).toHaveText('Descarregar para macOS')
    await expect(page.locator('[data-download="mac-arm"]')).toHaveAttribute('href', /\/Remind-arm64\.dmg$/)
    await expect(page.locator('[data-download="mac-intel"]')).toHaveAttribute('href', /\/Remind-x64\.dmg$/)
    await expect(page.locator('[data-os-hint]')).toContainText('Intel')
    await context.close()
  })

  test('preços: grátis e Pro, e "Passar a Pro" leva à página de compra', async ({ page }) => {
    await page.goto('/#precos')
    const pro = page.locator('.price-card-pro')
    await expect(pro).toContainText('2,99 €')
    await expect(pro).toContainText('24 €/ano')
    await expect(pro.locator('[data-buy-pro]')).toHaveAttribute('href', 'https://api.remind.uno/pro')
    await expect(page.locator('nav a[href="#precos"]')).toHaveCount(1)
  })
})
