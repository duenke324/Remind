import type { Page } from '../../../shared/types'

export type DropPosition = 'before' | 'after' | 'inside'

/** Mapa mãe → filhas (só páginas fora do lixo), ordenadas. `null` são as páginas de topo. */
export function childrenMap<T extends Page>(pages: readonly T[]): Map<string | null, T[]> {
  const live = pages.filter((p) => !p.trashedAt)
  const ids = new Set(live.map((p) => p.id))
  const map = new Map<string | null, T[]>()
  for (const page of live) {
    // Uma página cuja mãe desapareceu (ou está no lixo) não deve ficar invisível: sobe para o topo.
    const parent = page.parentId && ids.has(page.parentId) ? page.parentId : null
    const list = map.get(parent) ?? []
    list.push(page)
    map.set(parent, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt))
  return map
}

/** Todos os descendentes (incluindo no lixo), para apagar ou mover em conjunto. */
export function descendants(pages: readonly Page[], id: string): Page[] {
  const byParent = new Map<string, Page[]>()
  for (const p of pages) {
    if (!p.parentId) continue
    const list = byParent.get(p.parentId) ?? []
    list.push(p)
    byParent.set(p.parentId, list)
  }
  const out: Page[] = []
  const stack = [...(byParent.get(id) ?? [])]
  while (stack.length) {
    const page = stack.pop()!
    out.push(page)
    stack.push(...(byParent.get(page.id) ?? []))
  }
  return out
}

/** Caminho do topo até à página (para o "migalhas de pão"). */
export function ancestors(pages: readonly Page[], id: string): Page[] {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const path: Page[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

/** Uma página está no lixo se ela ou alguma antecessora estiver. */
export function isInTrash(pages: readonly Page[], id: string): boolean {
  return ancestors(pages, id).some((p) => p.trashedAt)
}

/** Ordem para pôr uma página no fim de uma lista. */
export function sortAtEnd(siblings: readonly Page[]): number {
  return siblings.length ? Math.max(...siblings.map((p) => p.sort)) + 1 : 1
}

/**
 * Calcula onde fica uma página arrastada para cima/baixo/dentro de outra.
 * Devolve null se o movimento for impossível (para dentro de si própria ou de uma descendente).
 */
export function computeDrop(
  pages: readonly Page[],
  dragId: string,
  targetId: string,
  position: DropPosition
): { parentId: string | null; sort: number } | null {
  if (dragId === targetId) return null
  const target = pages.find((p) => p.id === targetId)
  if (!target) return null
  const blocked = new Set([dragId, ...descendants(pages, dragId).map((p) => p.id)])
  if (blocked.has(targetId)) return null

  const map = childrenMap(pages)
  if (position === 'inside') {
    const siblings = (map.get(targetId) ?? []).filter((p) => p.id !== dragId)
    return { parentId: targetId, sort: sortAtEnd(siblings) }
  }

  const parentId = target.parentId && pages.some((p) => p.id === target.parentId && !p.trashedAt) ? target.parentId : null
  if (parentId && blocked.has(parentId)) return null
  const siblings = (map.get(parentId) ?? []).filter((p) => p.id !== dragId)
  const index = siblings.findIndex((p) => p.id === targetId)
  const neighbour = position === 'before' ? siblings[index - 1] : siblings[index + 1]
  const sort = neighbour ? (target.sort + neighbour.sort) / 2 : position === 'before' ? target.sort - 1 : target.sort + 1
  return { parentId, sort }
}

/** Texto simples de um documento de blocos (para pesquisar). */
export function blocksText(blocks: unknown): string {
  const parts: string[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string') parts.push(record.text)
    if (record.content !== undefined) visit(record.content)
    if (record.children !== undefined) visit(record.children)
    if (record.rows !== undefined) visit(record.rows)
    if (record.cells !== undefined) visit(record.cells)
  }
  visit(blocks)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export interface SearchHit {
  page: Page
  snippet: string | null
}

/** Pesquisa por título e conteúdo, sem acentos nem maiúsculas. Títulos primeiro. */
export function searchPages(pages: readonly Page[], query: string, limit = 20): SearchHit[] {
  const q = normalize(query.trim())
  if (!q) return []
  const hits: { hit: SearchHit; score: number }[] = []
  for (const page of pages) {
    if (isInTrash(pages, page.id)) continue
    const title = normalize(page.title)
    const text = blocksText(page.content)
    const index = normalize(text).indexOf(q)
    const titleIndex = title.indexOf(q)
    if (titleIndex < 0 && index < 0) continue
    const score = titleIndex === 0 ? 0 : titleIndex > 0 ? 1 : 2
    const snippet = index >= 0 ? text.slice(Math.max(0, index - 30), index + q.length + 50) : null
    hits.push({ hit: { page, snippet }, score })
  }
  return hits
    .sort((a, b) => a.score - b.score || b.hit.page.updatedAt.localeCompare(a.hit.page.updatedAt))
    .slice(0, limit)
    .map((h) => h.hit)
}
