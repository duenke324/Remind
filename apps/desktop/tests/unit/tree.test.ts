import { describe, expect, it } from 'vitest'
import type { Page } from '../../src/shared/types'
import {
  ancestors,
  blocksText,
  childrenMap,
  computeDrop,
  descendants,
  isInTrash,
  searchPages
} from '../../src/renderer/src/data/tree'

let clock = 0
function page(id: string, parentId: string | null, sort: number, extra: Partial<Page> = {}): Page {
  clock++
  return {
    id,
    parentId,
    title: id,
    icon: null,
    cover: null,
    sort,
    favorite: false,
    trashedAt: null,
    content: [],
    createdAt: new Date(2026, 0, 1, 0, 0, clock).toISOString(),
    updatedAt: new Date(2026, 0, 1, 0, 0, clock).toISOString(),
    ...extra
  }
}

// a
// ├─ a1
// │  └─ a1x
// └─ a2
// b
const pages = [page('a', null, 1), page('b', null, 2), page('a1', 'a', 1), page('a2', 'a', 2), page('a1x', 'a1', 1)]

describe('árvore de páginas', () => {
  it('agrupa e ordena as filhas', () => {
    const map = childrenMap(pages)
    expect(map.get(null)?.map((p) => p.id)).toEqual(['a', 'b'])
    expect(map.get('a')?.map((p) => p.id)).toEqual(['a1', 'a2'])
  })

  it('esconde páginas no lixo e sobe órfãs para o topo', () => {
    const map = childrenMap([...pages.filter((p) => p.id !== 'a1'), page('a1', 'a', 1, { trashedAt: '2026-01-02T00:00:00Z' })])
    expect(map.get('a')?.map((p) => p.id)).toEqual(['a2'])
    expect(map.get(null)?.map((p) => p.id)).toContain('a1x')
  })

  it('encontra descendentes e antecessoras', () => {
    expect(descendants(pages, 'a').map((p) => p.id).sort()).toEqual(['a1', 'a1x', 'a2'])
    expect(ancestors(pages, 'a1x').map((p) => p.id)).toEqual(['a', 'a1', 'a1x'])
  })

  it('sabe se uma página está no lixo por herança', () => {
    const trashed = pages.map((p) => (p.id === 'a' ? { ...p, trashedAt: 'x' } : p))
    expect(isInTrash(trashed, 'a1x')).toBe(true)
    expect(isInTrash(trashed, 'b')).toBe(false)
  })

  it('aguenta ciclos corrompidos sem ficar preso', () => {
    const broken = [page('x', 'y', 1), page('y', 'x', 1)]
    expect(ancestors(broken, 'x').length).toBe(2)
  })
})

describe('arrastar e largar', () => {
  it('põe dentro de outra página, no fim', () => {
    expect(computeDrop(pages, 'b', 'a', 'inside')).toEqual({ parentId: 'a', sort: 3 })
  })

  it('põe entre duas irmãs', () => {
    expect(computeDrop(pages, 'b', 'a2', 'before')).toEqual({ parentId: 'a', sort: 1.5 })
    expect(computeDrop(pages, 'a1', 'a2', 'after')).toEqual({ parentId: 'a', sort: 3 })
    expect(computeDrop(pages, 'a2', 'a', 'before')).toEqual({ parentId: null, sort: 0 })
  })

  it('recusa largar dentro de si própria ou de uma descendente', () => {
    expect(computeDrop(pages, 'a', 'a', 'inside')).toBeNull()
    expect(computeDrop(pages, 'a', 'a1x', 'inside')).toBeNull()
    expect(computeDrop(pages, 'a', 'a1', 'after')).toBeNull()
  })
})

describe('pesquisa', () => {
  const blocks = [
    { type: 'heading', content: [{ type: 'text', text: 'Reunião de equipa' }], children: [] },
    { type: 'paragraph', content: [{ type: 'link', content: [{ type: 'text', text: 'orçamento' }] }], children: [{ type: 'paragraph', content: [{ type: 'text', text: 'filho' }], children: [] }] }
  ]

  it('extrai o texto dos blocos, incluindo links e filhos', () => {
    expect(blocksText(blocks)).toBe('Reunião de equipa orçamento filho')
  })

  it('encontra por título e conteúdo, sem acentos, com títulos primeiro', () => {
    const list = [
      page('notas', null, 1, { title: 'Notas', content: blocks }),
      page('orc', null, 2, { title: 'Orçamento 2027' }),
      page('lixo', null, 3, { title: 'Orçamento velho', trashedAt: 'x' })
    ]
    const hits = searchPages(list, 'orcamento')
    expect(hits.map((h) => h.page.id)).toEqual(['orc', 'notas'])
    expect(hits[1]?.snippet).toContain('orçamento')
  })

  it('consulta vazia não devolve nada', () => {
    expect(searchPages(pages, '   ')).toEqual([])
  })
})
