import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { PROTOCOL, findDeepLinkInArgv, parseDeepLink, type DeepLink } from '../shared/deep-link'
import type { SocialProvider } from '../shared/types'
import { AuthClient } from './auth-client'

// Endereço do servidor: variável de ambiente (testes) > valor da build > servidor local.
const SERVER_URL = (process.env.REMIND_SERVER_URL ?? import.meta.env.MAIN_VITE_SERVER_URL ?? 'http://localhost:8787').replace(/\/+$/, '')

// Permite correr várias instâncias isoladas (testes E2E) sem partilharem dados.
if (process.env.REMIND_USER_DATA) app.setPath('userData', process.env.REMIND_USER_DATA)

let mainWindow: BrowserWindow | null = null
let pendingLink: DeepLink | null = null
let auth: AuthClient

// Só uma instância: no Windows o link remind:// abre um segundo processo que entrega o link a este e termina.
if (!process.env.REMIND_USER_DATA && !app.requestSingleInstanceLock()) {
  app.quit()
}

if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [join(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

function notifyAuthChanged(): void {
  mainWindow?.webContents.send('auth:changed')
}

async function handleLink(link: DeepLink): Promise<void> {
  if (link.kind === 'auth-callback') {
    const result = await auth.completeSocial(link.params)
    mainWindow?.webContents.send('auth:social-result', result)
    if (result.ok) notifyAuthChanged()
    return
  }
  mainWindow?.webContents.send('deep-link', link)
}

function deliverLink(raw: string | null): void {
  if (!raw) return
  const link = parseDeepLink(raw)
  if (!link) return
  if (mainWindow && auth) {
    void handleLink(link)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    pendingLink = link
  }
}

app.on('second-instance', (_event, argv) => deliverLink(findDeepLinkInArgv(argv)))
app.on('open-url', (event, url) => {
  event.preventDefault()
  deliverLink(url)
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: 'Remind',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Links externos abrem no browser, nunca dentro da app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingLink) {
      void handleLink(pendingLink)
      pendingLink = null
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const str = (value: unknown, max = 500): string => (typeof value === 'string' ? value.slice(0, max) : '')

function registerIpc(): void {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, serverUrl: SERVER_URL }))

  ipcMain.handle('auth:state', () => auth.state())
  ipcMain.handle('auth:providers', () => auth.providers())
  ipcMain.handle('auth:sign-up', (_e, input: Record<string, unknown>) =>
    auth.signUp({ name: str(input?.name, 100), email: str(input?.email, 254), password: str(input?.password, 128) })
  )
  ipcMain.handle('auth:sign-in', (_e, input: Record<string, unknown>) =>
    auth.signIn({ email: str(input?.email, 254), password: str(input?.password, 128) })
  )
  ipcMain.handle('auth:verify-otp', async (_e, code: unknown) => {
    const result = await auth.verifyOtp(str(code, 12))
    if (result.ok) notifyAuthChanged()
    return result
  })
  ipcMain.handle('auth:resend-otp', () => auth.resendOtp())
  ipcMain.handle('auth:resend-verification', (_e, email: unknown) => auth.resendVerification(str(email, 254)))
  ipcMain.handle('auth:request-password-reset', (_e, email: unknown) => auth.requestPasswordReset(str(email, 254)))
  ipcMain.handle('auth:start-social', (_e, provider: unknown) =>
    provider === 'google' || provider === 'github'
      ? auth.startSocial(provider as SocialProvider)
      : { ok: false, code: 'INVALID_PROVIDER' }
  )
  ipcMain.handle('auth:sign-out', async () => {
    await auth.signOut()
    notifyAuthChanged()
  })

  ipcMain.handle('api:request', async (_e, method: unknown, path: unknown, body: unknown) => {
    if (method !== 'GET' && method !== 'PUT' && method !== 'DELETE') return { status: 400, data: null }
    const res = await auth.api(method, str(path, 200), body)
    if (res.status === 401) notifyAuthChanged()
    return res
  })

  ipcMain.handle('shell:open-external', (_e, url: unknown) => {
    const value = str(url, 2000)
    if (value.startsWith('https://')) void shell.openExternal(value)
  })
}

void app.whenReady().then(() => {
  auth = new AuthClient(SERVER_URL, (url) => shell.openExternal(url), app.isPackaged)
  registerIpc()
  deliverLink(findDeepLinkInArgv(process.argv))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
