import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

const SERVER_DIR = resolve(__dirname, '../../../server')
const APP_DIR = resolve(__dirname, '../..')
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/remind_test'

export interface TestServer {
  url: string
  log: () => string
  stop: () => Promise<void>
}

/** Arranca o servidor real (sem SMTP: os emails aparecem no terminal, que lemos aqui). */
export async function startServer(port: number, extraEnv: Record<string, string> = {}): Promise<TestServer> {
  let output = ''
  const child: ChildProcess = spawn('npx', ['tsx', 'src/dev.ts'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      DATABASE_URL,
      PORT: String(port),
      BETTER_AUTH_URL: `http://localhost:${port}`,
      BETTER_AUTH_SECRET: 'segredo-e2e-com-mais-de-32-caracteres-aqui',
      SMTP_HOST: '',
      REMIND_RATE_LIMIT: 'off',
      NODE_ENV: 'development',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Grupo de processos próprio: ao parar, termina o npx e o servidor que ele lançou.
    detached: true
  })
  child.stdout?.on('data', (d) => (output += d.toString()))
  child.stderr?.on('data', (d) => (output += d.toString()))
  await expect.poll(() => output, { timeout: 30_000 }).toContain('Remind server em')
  return {
    url: `http://localhost:${port}`,
    log: () => output,
    stop: async () => {
      if (child.pid) process.kill(-child.pid, 'SIGTERM')
      await new Promise((r) => setTimeout(r, 300))
    }
  }
}

/** Último email enviado para um endereço (como o servidor o mostrou no terminal). */
export async function waitForMail(server: TestServer, email: string, pattern: RegExp): Promise<string> {
  let match: string | undefined
  await expect
    .poll(
      () => {
        const blocks = server.log().split(`[email para ${email}]`).slice(1)
        match = blocks.at(-1)?.match(pattern)?.[0]
        return match
      },
      { timeout: 15_000 }
    )
    .toBeTruthy()
  return match!
}

export interface RunningApp {
  app: ElectronApplication
  window: Page
  close: () => Promise<void>
}

/** Arranca a app com uma pasta de dados própria (como se fosse outro computador). */
export async function launchApp(serverUrl: string, userData?: string): Promise<RunningApp & { userData: string }> {
  const dir = userData ?? mkdtempSync(join(tmpdir(), 'remind-e2e-'))
  const app = await electron.launch({
    args: [APP_DIR, '--no-sandbox', '--lang=pt-PT'],
    env: { ...process.env, REMIND_SERVER_URL: serverUrl, REMIND_USER_DATA: dir, LANG: 'pt_PT.UTF-8' }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  // Avisos e erros da app aparecem no relatório do teste (ajuda a perceber falhas).
  window.on('console', (msg) => {
    if (msg.type() === 'warning' || msg.type() === 'error') console.log(`[app ${msg.type()}] ${msg.text()}`)
  })
  return {
    app,
    window,
    userData: dir,
    close: async () => {
      await app.close()
    }
  }
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/** Login completo pelo ecrã: email + palavra-passe + código OTP lido do "email". */
export async function signIn(window: Page, server: TestServer, email: string, password: string): Promise<void> {
  await window.getByLabel('Email').fill(email)
  await window.getByLabel('Palavra-passe').fill(password)
  const before = server.log().split(`[email para ${email}]`).length
  await window.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(window.getByRole('heading', { name: 'Verificação em dois passos' })).toBeVisible()
  await expect.poll(() => server.log().split(`[email para ${email}]`).length).toBeGreaterThan(before)
  const code = await waitForMail(server, email, /\b\d{6}\b/)
  await window.getByLabel('Código').fill(code)
  await window.getByRole('button', { name: 'Verificar' }).click()
  await expect(window.getByTestId('sidebar')).toBeVisible()
}
