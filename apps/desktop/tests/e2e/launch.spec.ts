import { resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('a app abre e mostra o título e a versão', async () => {
  const app = await electron.launch({
    // Arranca pela pasta da app (lê o package.json), como no instalador.
    args: [resolve(__dirname, '../..'), '--no-sandbox']
  })
  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('app-title')).toHaveText('Remind')
    await expect(window.getByTestId('app-version')).toContainText('v0.0.1')

    // Defesa: o renderer não tem acesso ao Node.
    expect(await window.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined')
  } finally {
    await app.close()
  }
})
