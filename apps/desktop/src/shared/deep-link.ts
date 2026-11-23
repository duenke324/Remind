/**
 * Links `remind://` abertos pelo sistema operativo (ex.: retorno do login
 * Google/GitHub no browser). Tudo o que chega aqui vem de fora da app,
 * por isso só aceitamos formas conhecidas e rejeitamos o resto.
 */
export const PROTOCOL = 'remind'

export type DeepLink =
  | { kind: 'auth-callback'; params: Record<string, string> }
  | { kind: 'open-page'; pageId: string }

const PAGE_ID = /^[A-Za-z0-9_-]{1,64}$/

export function parseDeepLink(raw: string): DeepLink | null {
  // O URL resolve "../" em silêncio; um link legítimo nunca os tem.
  if (/(^|\/)\.\.?(\/|$|\?)|%2e/i.test(raw)) return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== `${PROTOCOL}:`) return null

  // Em `remind://auth/callback`, "auth" é o host e "/callback" o caminho.
  const route = `${url.host}${url.pathname}`.replace(/\/+$/, '')

  if (route === 'auth/callback') {
    const params: Record<string, string> = {}
    for (const [key, value] of url.searchParams) {
      if (key in params) return null
      params[key] = value
    }
    return { kind: 'auth-callback', params }
  }

  if (url.host === 'page') {
    const pageId = url.pathname.replace(/^\//, '')
    return PAGE_ID.test(pageId) ? { kind: 'open-page', pageId } : null
  }

  return null
}

/** No Windows e Linux o link chega como argumento do processo. */
export function findDeepLinkInArgv(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null
}
