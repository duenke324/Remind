import { expect, test } from '@playwright/test'
import { cleanup, launchApp } from './helpers'

test('sem sessão, a app abre no ecrã de entrar e o ecrã não tem acesso ao Node', async () => {
  // Servidor inexistente: a app tem de abrir na mesma, sem botões de Google/GitHub.
  const { window, close, userData } = await launchApp('http://localhost:9')
  try {
    await expect(window.getByRole('heading', { name: 'Entrar no Remind' })).toBeVisible()
    await expect(window.getByText('Continuar com Google')).toHaveCount(0)
    await expect(window.getByTestId('app-version')).toHaveText(/v0\.\d+\.\d+/)
    expect(await window.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined')

    // Sem servidor, o erro é claro.
    await window.getByLabel('Email').fill('alguem@exemplo.pt')
    await window.getByLabel('Palavra-passe').fill('qualquer-coisa')
    await window.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(window.getByRole('alert')).toContainText('Não foi possível ligar ao servidor')
  } finally {
    await close()
    cleanup(userData)
  }
})
