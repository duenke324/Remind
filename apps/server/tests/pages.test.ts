import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHarness } from './helpers/harness'

const h = createHarness()
let alice: ReturnType<typeof h.client>
let bob: ReturnType<typeof h.client>

const id = () => randomUUID()
const blocks = (text: string) => [{ id: id(), type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] }]

beforeAll(async () => {
  await h.setup()
  const a = `alice-${randomUUID()}@exemplo.pt`
  const b = `bob-${randomUUID()}@exemplo.pt`
  await h.createVerifiedUser(a)
  await h.createVerifiedUser(b)
  alice = h.client({ bearer: await h.desktopLogin(a) })
  bob = h.client({ bearer: await h.desktopLogin(b) })
})
afterAll(() => h.pool.end())

describe('API de páginas', () => {
  it('exige sessão', async () => {
    expect((await h.client()('/api/pages')).status).toBe(401)
  })

  it('cria, lê e atualiza uma página', async () => {
    const pageId = id()
    const created = await alice(`/api/pages/${pageId}`, {
      method: 'PUT',
      body: { title: 'Ideias', icon: '💡', sort: 1, content: blocks('Olá mundo') }
    })
    expect(created.status).toBe(200)
    expect(created.json.page).toMatchObject({ id: pageId, title: 'Ideias', icon: '💡', parentId: null, version: 1 })

    const updated = await alice(`/api/pages/${pageId}`, { method: 'PUT', body: { title: 'Ideias novas' } })
    expect(updated.json.page).toMatchObject({ title: 'Ideias novas', icon: '💡', version: 2 })
    expect(updated.json.page.content[0].content[0].text).toBe('Olá mundo')
  })

  it('aceita a página completa várias vezes, como a app a envia', async () => {
    const pageId = id()
    const full = (title: string) => ({
      parentId: null,
      title,
      icon: null,
      cover: null,
      sort: 1,
      favorite: false,
      trashed: false,
      content: blocks(title)
    })
    const first = await alice(`/api/pages/${pageId}`, { method: 'PUT', body: full('Primeira') })
    expect(first.status).toBe(200)
    const second = await alice(`/api/pages/${pageId}`, { method: 'PUT', body: full('Segunda') })
    expect(second.status, second.text).toBe(200)
    expect(second.json.page).toMatchObject({ title: 'Segunda', version: 2, trashedAt: null })
  })

  it('devolve só as alterações desde a última sincronização', async () => {
    const before = (await alice('/api/pages')).json.cursor as string
    const pageId = id()
    await alice(`/api/pages/${pageId}`, { method: 'PUT', body: { title: 'Nova' } })
    const changes = await alice(`/api/pages?since=${encodeURIComponent(before)}`)
    expect(changes.json.pages.map((p: { id: string }) => p.id)).toEqual([pageId])
  })

  it('não deixa ver nem alterar páginas de outra pessoa', async () => {
    const pageId = id()
    await alice(`/api/pages/${pageId}`, { method: 'PUT', body: { title: 'Privada' } })
    const list = await bob('/api/pages')
    expect(list.json.pages.find((p: { id: string }) => p.id === pageId)).toBeUndefined()
    const hijack = await bob(`/api/pages/${pageId}`, { method: 'PUT', body: { title: 'Roubada' } })
    expect(hijack.status).toBe(404)
    const del = await bob(`/api/pages/${pageId}`, { method: 'DELETE' })
    expect(del.status).toBe(404)
  })

  it('subpáginas: recusa pai de outra pessoa e ciclos', async () => {
    const root = id()
    const child = id()
    await alice(`/api/pages/${root}`, { method: 'PUT', body: { title: 'Raiz' } })
    expect((await alice(`/api/pages/${child}`, { method: 'PUT', body: { title: 'Filha', parentId: root } })).status).toBe(200)

    const cycle = await alice(`/api/pages/${root}`, { method: 'PUT', body: { parentId: child } })
    expect(cycle.status).toBe(400)
    const self = await alice(`/api/pages/${root}`, { method: 'PUT', body: { parentId: root } })
    expect(self.status).toBe(400)

    const bobsPage = id()
    await bob(`/api/pages/${bobsPage}`, { method: 'PUT', body: { title: 'Do Bob' } })
    const foreign = await alice(`/api/pages/${id()}`, { method: 'PUT', body: { title: 'X', parentId: bobsPage } })
    expect(foreign.status).toBe(400)
  })

  it('apagar de vez apaga também as subpáginas e fica registado para os outros dispositivos', async () => {
    const root = id()
    const child = id()
    await alice(`/api/pages/${root}`, { method: 'PUT', body: { title: 'A apagar' } })
    await alice(`/api/pages/${child}`, { method: 'PUT', body: { title: 'Filha', parentId: root } })
    const cursor = (await alice('/api/pages')).json.cursor
    expect((await alice(`/api/pages/${root}`, { method: 'DELETE' })).status).toBe(200)

    const changes = await alice(`/api/pages?since=${encodeURIComponent(cursor)}`)
    const deleted = changes.json.pages.filter((p: { deleted: boolean }) => p.deleted).map((p: { id: string }) => p.id)
    expect(deleted.sort()).toEqual([root, child].sort())
  })

  it('valida os dados', async () => {
    expect((await alice('/api/pages/id com espaços', { method: 'PUT', body: {} })).status).toBe(400)
    expect((await alice(`/api/pages/${id()}`, { method: 'PUT', body: { title: 'x'.repeat(2001) } })).status).toBe(400)
    expect((await alice(`/api/pages/${id()}`, { method: 'PUT', body: { content: 'não é lista' } })).status).toBe(400)
    expect((await alice(`/api/pages/${id()}`, { method: 'PUT', body: { cover: 'javascript:alert(1)' } })).status).toBe(400)
  })
})
