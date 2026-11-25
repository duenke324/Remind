import { app, net, type BrowserWindow } from 'electron'
import { downloadUrlFor, isNewer, RELEASES_URL, versionFromLatestRedirect, type UpdateInfo } from '../shared/update'

const FIRST_CHECK_MS = 10_000
const EVERY_MS = 6 * 60 * 60 * 1000

/** Nos testes E2E (app não instalada) pode apontar-se para um servidor local. */
function releasesBase(): string {
  const override = process.env.REMIND_UPDATE_RELEASES
  return !app.isPackaged && override ? override.replace(/\/+$/, '') : RELEASES_URL
}

/** Para onde o endereço redireciona (sem o seguir), ou null. */
function redirectTarget(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = net.request({ url, method: 'HEAD', redirect: 'manual', cache: 'no-store' })
    const timer = setTimeout(() => {
      req.abort()
      resolve(null)
    }, 15_000)
    const done = (value: string | null) => {
      clearTimeout(timer)
      resolve(value)
    }
    req.on('redirect', (_status, _method, redirectUrl) => {
      req.abort()
      done(redirectUrl)
    })
    req.on('response', () => done(null))
    req.on('error', () => done(null))
    req.end()
  })
}

export type CheckResult = { status: 'available'; update: UpdateInfo } | { status: 'current'; version: string } | { status: 'error' }

/**
 * Vê qual é a versão mais recente publicada. Usa o redirecionamento de ".../releases/latest"
 * (sem a API do GitHub, que tem limite de pedidos).
 */
export async function checkForUpdate(): Promise<CheckResult> {
  const base = releasesBase()
  const feed = `${base}/latest`
  try {
    const latest = versionFromLatestRedirect(await redirectTarget(feed), feed)
    if (!latest) return { status: 'error' }
    const current = app.getVersion()
    if (!isNewer(latest, current)) return { status: 'current', version: current }
    return {
      status: 'available',
      update: { version: latest, downloadUrl: downloadUrlFor(latest, process.platform, process.arch, base), releaseUrl: `${base}/tag/v${latest}` }
    }
  } catch {
    return { status: 'error' }
  }
}

let pending: UpdateInfo | null = null

/** A versão nova já encontrada (a janela pede-a ao abrir, caso o aviso tenha chegado antes dela). */
export const pendingUpdate = (): UpdateInfo | null => pending

/** Procura atualizações ao abrir e de 6 em 6 horas; avisa a janela quando há uma versão nova. */
export function watchForUpdates(getWindow: () => BrowserWindow | null): void {
  const run = async (): Promise<void> => {
    const result = await checkForUpdate()
    if (result.status !== 'available') return
    pending = result.update
    getWindow()?.webContents.send('update:available', result.update)
  }
  setTimeout(() => void run(), Number(process.env.REMIND_UPDATE_DELAY_MS) || FIRST_CHECK_MS)
  setInterval(() => void run(), EVERY_MS)
}
