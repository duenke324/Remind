import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { PROTOCOL, findDeepLinkInArgv, parseDeepLink, type DeepLink } from '../shared/deep-link'

let mainWindow: BrowserWindow | null = null
let pendingLink: DeepLink | null = null

// Só uma instância: no Windows o link remind:// abre um segundo processo
// que entrega o link a este e termina.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [join(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

function deliverLink(raw: string | null): void {
  if (!raw) return
  const link = parseDeepLink(raw)
  if (!link) return
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', link)
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
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'Remind',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Links externos abrem no browser, nunca dentro da app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }))
ipcMain.handle('deep-link:take-pending', () => {
  const link = pendingLink
  pendingLink = null
  return link
})

void app.whenReady().then(() => {
  deliverLink(findDeepLinkInArgv(process.argv))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
