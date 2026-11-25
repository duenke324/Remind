import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { cleanup, launchApp } from './helpers'

// Um "GitHub" local: ".../releases/latest" redireciona para a versão mais recente, como no GitHub.
let releases: Server
const BASE = 'http://127.0.0.1:8797/duenke324/Remind/releases'

test.beforeAll(async () => {
  releases = createServer((req, res) => {
    if (req.url === '/duenke324/Remind/releases/latest') {
      res.writeHead(302, { location: `${BASE}/tag/v99.0.0` })
      return res.end()
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((r) => releases.listen(8797, '127.0.0.1', r))
})

test.afterAll(() => {
  releases.close()
})

test('há versão nova: aparece o pop-up; "Mais tarde" não volta a incomodar no mesmo dia', async () => {
  const env = { REMIND_UPDATE_RELEASES: BASE, REMIND_UPDATE_DELAY_MS: '300' }
  const first = await launchApp('http://127.0.0.1:9', undefined, env)
  const dialog = first.window.getByRole('dialog', { name: 'Há uma versão nova do Remind' })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(dialog).toContainText('A versão 99.0.0 já está disponível')
  await expect(dialog.getByTestId('update-now')).toBeVisible()
  await dialog.getByTestId('update-later').click()
  await expect(dialog).toBeHidden()
  await first.close()

  // Volta a abrir: a mesma versão foi adiada, por isso não aparece.
  const again = await launchApp('http://127.0.0.1:9', first.userData, env)
  await again.window.waitForTimeout(2_000)
  await expect(again.window.getByRole('dialog', { name: 'Há uma versão nova do Remind' })).toHaveCount(0)
  await again.close()
  cleanup(first.userData)
})
