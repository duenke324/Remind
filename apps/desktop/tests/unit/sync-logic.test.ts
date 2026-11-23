import { describe, expect, it } from 'vitest'
import type { Page } from '../../src/shared/types'
import { mergeRemote, pushOrder, toPayload, type LocalPage, type RemotePage } from '../../src/renderer/src/data/sync-logic'

const base: Page = {
  id: 'p',
  parentId: null,
  title: 'Título',
  icon: null,
  cover: null,
  sort: 1,
  favorite: false,
  trashedAt: null,
  content: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}
const remote = (extra: Partial<RemotePage> = {}): RemotePage => ({ ...base, deleted: false, version: 2, ...extra })
const local = (extra: Partial<LocalPage> = {}): LocalPage => ({ ...base, dirty: 0, rev: 3, ...extra })

describe('juntar alterações do servidor', () => {
  it('página nova do servidor é guardada', () => {
    expect(mergeRemote(undefined, remote({ title: 'Nova' }))).toEqual({
      kind: 'put',
      page: { ...base, title: 'Nova', dirty: 0, rev: 0 }
    })
  })

  it('alterações locais por enviar não são apagadas pelo servidor', () => {
    expect(mergeRemote(local({ dirty: 1, title: 'Local' }), remote({ title: 'Servidor' }))).toEqual({ kind: 'keep-local' })
  })

  it('sem alterações locais, fica a versão do servidor', () => {
    const action = mergeRemote(local({ title: 'Antiga' }), remote({ title: 'Servidor' }))
    expect(action).toMatchObject({ kind: 'put', page: { title: 'Servidor', dirty: 0, rev: 3 } })
  })

  it('apagada no servidor é apagada localmente, mesmo com alterações locais', () => {
    expect(mergeRemote(local({ dirty: 1 }), remote({ deleted: true }))).toEqual({ kind: 'delete' })
  })
})

describe('envio para o servidor', () => {
  it('converte o lixo num booleano', () => {
    expect(toPayload({ ...base, trashedAt: '2026-01-01T00:00:00Z' }).trashed).toBe(true)
    expect(toPayload(base).trashed).toBe(false)
  })

  it('envia as mães antes das filhas', () => {
    const all = [
      { ...base, id: 'neta', parentId: 'filha' },
      { ...base, id: 'filha', parentId: 'mae' },
      { ...base, id: 'mae', parentId: null }
    ]
    expect(pushOrder(all, all).map((p) => p.id)).toEqual(['mae', 'filha', 'neta'])
  })
})
