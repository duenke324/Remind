import type { Page } from '../../../shared/types'

/** Página guardada localmente: `dirty` = tem alterações por enviar; `rev` muda a cada alteração local. */
export interface LocalPage extends Page {
  dirty: 0 | 1
  rev: number
}

/** Página como vem do servidor. */
export interface RemotePage extends Page {
  deleted: boolean
  version: number
}

export type MergeAction = { kind: 'put'; page: LocalPage } | { kind: 'delete' } | { kind: 'keep-local' }

/**
 * O que fazer com uma página que chegou do servidor.
 * - Apagada no servidor: apaga localmente (apagar ganha a tudo).
 * - Alterada localmente e ainda não enviada: mantém a local (vai ser enviada a seguir).
 * - Caso contrário: fica a versão do servidor.
 */
export function mergeRemote(local: LocalPage | undefined, remote: RemotePage): MergeAction {
  if (remote.deleted) return { kind: 'delete' }
  if (local?.dirty) return { kind: 'keep-local' }
  const { deleted: _deleted, version: _version, ...page } = remote
  return { kind: 'put', page: { ...page, dirty: 0, rev: local?.rev ?? 0 } }
}

/** Corpo do pedido PUT para o servidor. */
export function toPayload(page: Page) {
  return {
    parentId: page.parentId,
    title: page.title,
    icon: page.icon,
    cover: page.cover,
    sort: page.sort,
    favorite: page.favorite,
    trashed: Boolean(page.trashedAt),
    content: page.content
  }
}

/** Ordem de envio: mães antes das filhas (o servidor exige que a mãe já exista). */
export function pushOrder<T extends Page>(dirty: readonly T[], all: readonly Page[]): T[] {
  const byId = new Map(all.map((p) => [p.id, p]))
  const depth = (page: Page): number => {
    let d = 0
    const seen = new Set<string>()
    let current: Page | undefined = page
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id)
      current = byId.get(current.parentId)
      d++
    }
    return d
  }
  return [...dirty].sort((a, b) => depth(a) - depth(b))
}
