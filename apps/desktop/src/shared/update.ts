/** Onde se publicam as versões do Remind (Releases do GitHub). */
export const RELEASES_URL = 'https://github.com/duenke324/Remind/releases'

export interface UpdateInfo {
  /** Versão nova, ex.: "0.1.6". */
  version: string
  /** Instalador certo para este computador (ou a página da versão, se não houver). */
  downloadUrl: string
  /** Página da versão no GitHub (novidades). */
  releaseUrl: string
}

/** "v0.1.6" → [0, 1, 6]; null se não for uma versão X.Y.Z. */
export function parseVersion(value: string): [number, number, number] | null {
  const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,6})$/.exec(value.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!
  return false
}

/**
 * ".../releases/latest" redireciona para ".../releases/tag/v0.1.6".
 * Só aceita redirecionamentos para o mesmo repositório.
 */
export function versionFromLatestRedirect(location: string | null, feed: string = `${RELEASES_URL}/latest`): string | null {
  if (!location) return null
  let url: URL
  try {
    url = new URL(location, feed)
  } catch {
    return null
  }
  const base = new URL(feed)
  const prefix = base.pathname.replace(/\/latest\/?$/, '/tag/')
  if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return null
  const tag = decodeURIComponent(url.pathname.slice(prefix.length))
  return parseVersion(tag) ? tag.replace(/^v/, '') : null
}

/** O instalador certo para o sistema e o processador deste computador. */
export function downloadUrlFor(version: string, platform: string, arch: string, releases: string = RELEASES_URL): string {
  const base = `${releases}/download/v${version}`
  if (platform === 'win32') return `${base}/Remind-Setup.exe`
  if (platform === 'darwin') return `${base}/${arch === 'arm64' ? 'Remind-arm64.dmg' : 'Remind-x64.dmg'}`
  return `${releases}/tag/v${version}`
}
