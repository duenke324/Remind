import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { cleanup, launchApp, signIn, startServer, waitForMail, type TestServer } from './helpers'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer(8790)
})

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) console.log(`--- registo do servidor ---\n${server.log().slice(-6000)}`)
})

test.afterAll(async () => {
  await server.stop()
})

test('percurso completo: conta, código por email, páginas e sincronização entre dois computadores', async () => {
  test.setTimeout(180_000)
  const email = `e2e-${randomUUID().slice(0, 8)}@exemplo.pt`
  const password = 'palavra-passe-e2e-1'

  // --- Computador A: criar conta ---
  const a = await launchApp(server.url)
  const { window } = a
  await window.getByRole('button', { name: 'Criar conta' }).click()
  await window.getByLabel('Nome').fill('Ana Teste')
  await window.getByLabel('Email').fill(email)
  await window.getByLabel('Palavra-passe').fill(password)
  await window.getByRole('button', { name: 'Criar conta' }).click()
  await expect(window.getByRole('heading', { name: 'Confirma o teu email' })).toBeVisible()

  // Entrar sem confirmar o email é recusado.
  await window.getByRole('button', { name: 'Já confirmei, entrar' }).click()
  await window.getByLabel('Email').fill(email)
  await window.getByLabel('Palavra-passe').fill(password)
  await window.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(window.getByRole('alert')).toContainText('Ainda não confirmaste o email')

  // Abre o link do email (como no browser) e entra com o código OTP.
  const link = await waitForMail(server, email, /http:\/\/\S+verify-email\S+/)
  const verified = await fetch(link, { redirect: 'manual' })
  expect(verified.status).toBe(302)
  await window.getByRole('button', { name: 'Já confirmei, entrar' }).click()

  // Código errado primeiro.
  await window.getByLabel('Email').fill(email)
  await window.getByLabel('Palavra-passe').fill(password)
  await window.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(window.getByRole('heading', { name: 'Verificação em dois passos' })).toBeVisible()
  const code = await waitForMail(server, email, /\b\d{6}\b/)
  await window.getByLabel('Código').fill(code === '000000' ? '111111' : '000000')
  await window.getByRole('button', { name: 'Verificar' }).click()
  await expect(window.getByRole('alert')).toContainText('Código incorreto')
  await window.getByLabel('Código').fill(code)
  await window.getByRole('button', { name: 'Verificar' }).click()
  await expect(window.getByTestId('sidebar')).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Ainda não tens páginas' })).toBeVisible()

  // --- Páginas ---
  await window.getByTestId('empty-new-page').click()
  await expect(window.getByTestId('page-title')).toHaveValue('')
  await expect(window.getByTestId('page-title')).toBeFocused()
  await window.getByTestId('page-title').fill('Plano de férias')
  await window.getByTestId('page-title').press('Enter')
  await window.keyboard.type('Reservar voos para Lisboa')
  await expect(window.locator('[data-testid="tree-item"]', { hasText: 'Plano de férias' })).toBeVisible()

  // Subpágina
  const parent = window.locator('[data-testid="tree-item"]', { hasText: 'Plano de férias' })
  await parent.hover()
  await parent.getByTestId('add-subpage').click()
  await expect(window.getByTestId('page-title')).toHaveValue('')
  await expect(window.getByTestId('page-title')).toBeFocused()
  await window.getByTestId('page-title').fill('Hotéis')
  await expect(window.locator('.breadcrumbs')).toContainText('Plano de férias')
  await expect(window.locator('.breadcrumbs')).toContainText('Hotéis')

  // Favorito
  await window.getByTestId('favorite-toggle').click()
  await expect(window.locator('.section-title', { hasText: 'Favoritos' })).toBeVisible()

  // Ícone e capa
  await window.getByTestId('page-title').hover()
  await window.getByTestId('add-icon').click()
  await window.getByRole('button', { name: '🏖️' }).click()
  await expect(window.getByTestId('page-icon')).toHaveText('🏖️')

  // Pesquisa (Ctrl+K) encontra pelo conteúdo, sem acentos.
  await window.keyboard.press('Control+k')
  await window.getByTestId('search-input').fill('lisboa')
  await expect(window.getByTestId('search-hit')).toHaveCount(1)
  await window.getByTestId('search-input').press('Enter')
  await expect(window.getByTestId('page-title')).toHaveValue('Plano de férias')

  // Lixo e restaurar
  await window.getByTestId('new-page').click()
  await expect(window.getByTestId('page-title')).toHaveValue('')
  await expect(window.getByTestId('page-title')).toBeFocused()
  await window.getByTestId('page-title').fill('Rascunho a apagar')
  const draft = window.locator('[data-testid="tree-item"]', { hasText: 'Rascunho a apagar' })
  await draft.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Mover para o lixo' }).click()
  await expect(draft).toHaveCount(0)
  await window.getByTestId('open-trash').click()
  await expect(window.getByTestId('trash-list')).toContainText('Rascunho a apagar')
  await window.getByTestId('restore').click()
  await window.keyboard.press('Escape')
  await expect(draft).toBeVisible()
  await draft.click()

  // Tudo enviado para o servidor.
  await expect(window.getByTestId('sync-status')).toHaveAttribute('data-status', 'idle', { timeout: 15_000 })

  // --- Reiniciar o computador A: sessão e páginas continuam lá ---
  await a.close()
  const a2 = await launchApp(server.url, a.userData)
  await expect(a2.window.getByTestId('sidebar')).toBeVisible()
  await expect(a2.window.getByTestId('page-title')).toHaveValue('Rascunho a apagar')

  // --- Computador B: entra na mesma conta e recebe as páginas ---
  const b = await launchApp(server.url)
  await signIn(b.window, server, email, password)
  const tree = b.window.getByTestId('page-tree')
  await expect(tree).toContainText('Plano de férias', { timeout: 20_000 })
  await expect(b.window.locator('.section-title', { hasText: 'Favoritos' })).toBeVisible()
  await b.window.locator('[data-testid="tree-item"]', { hasText: 'Plano de férias' }).click()
  await expect(b.window.getByTestId('editor')).toContainText('Reservar voos para Lisboa')

  // Alteração em B chega a A.
  await b.window.getByTestId('page-title').fill('Plano de férias 2027')
  await expect(b.window.getByTestId('sync-status')).toHaveAttribute('data-status', 'idle', { timeout: 15_000 })
  await a2.window.evaluate(() => globalThis.dispatchEvent(new Event('focus')))
  await expect(a2.window.getByTestId('page-tree')).toContainText('Plano de férias 2027', { timeout: 20_000 })

  // Terminar sessão em B volta ao ecrã de entrar.
  await b.window.getByTestId('account-menu').click()
  await b.window.getByRole('menuitem', { name: 'Terminar sessão' }).click()
  await expect(b.window.getByRole('heading', { name: 'Entrar no Remind' })).toBeVisible()

  await a2.close()
  await b.close()
  cleanup(a.userData)
  cleanup(b.userData)
})
