import Dexie, { liveQuery, type Table } from 'dexie'
import { useEffect, useState } from 'react'
import type { Page } from '../../../shared/types'
import type { LocalPage } from './sync-logic'
import { childrenMap, descendants, sortAtEnd } from './tree'

class RemindDB extends Dexie {
  pages!: Table<LocalPage, string>
  deletions!: Table<{ id: string }, string>
  meta!: Table<{ key: string; value: string }, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({ pages: 'id, parentId, dirty, updatedAt', deletions: 'id', meta: 'key' })
  }
}

type Listener = () => void

/**
 * Base de dados local (IndexedDB) de um utilizador. Tudo é escrito aqui primeiro;
 * a sincronização envia depois para o servidor. Assim a app funciona sem internet.
 */
export class PageStore {
  readonly db: RemindDB
  private changeListeners = new Set<Listener>()

  constructor(userId: string) {
    this.db = new RemindDB(`remind-${userId}`)
  }

  /** Avisado sempre que há uma alteração local por sincronizar. */
  onLocalChange(listener: Listener): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private changed(): void {
    for (const listener of this.changeListeners) listener()
  }

  all(): Promise<LocalPage[]> {
    return this.db.pages.toArray()
  }

  get(id: string): Promise<LocalPage | undefined> {
    return this.db.pages.get(id)
  }

  async create(input: { parentId?: string | null; title?: string; icon?: string | null; content?: unknown[] } = {}): Promise<LocalPage> {
    const now = new Date().toISOString()
    const parentId = input.parentId ?? null
    const siblings = childrenMap(await this.all()).get(parentId) ?? []
    const page: LocalPage = {
      id: crypto.randomUUID(),
      parentId,
      title: input.title ?? '',
      icon: input.icon ?? null,
      cover: null,
      sort: sortAtEnd(siblings),
      favorite: false,
      trashedAt: null,
      content: input.content ?? [],
      createdAt: now,
      updatedAt: now,
      dirty: 1,
      rev: 1
    }
    await this.db.pages.add(page)
    this.changed()
    return page
  }

  async update(id: string, patch: Partial<Omit<Page, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    await this.db.transaction('rw', this.db.pages, async () => {
      const page = await this.db.pages.get(id)
      if (!page) return
      await this.db.pages.put({ ...page, ...patch, updatedAt: new Date().toISOString(), dirty: 1, rev: page.rev + 1 })
    })
    this.changed()
  }

  trash(id: string): Promise<void> {
    return this.update(id, { trashedAt: new Date().toISOString() })
  }

  async restore(id: string): Promise<void> {
    const pages = await this.all()
    const page = pages.find((p) => p.id === id)
    if (!page) return
    // Se a mãe já não existe ou continua no lixo, a página volta para o topo.
    const parent = page.parentId ? pages.find((p) => p.id === page.parentId) : undefined
    const parentId = parent && !parent.trashedAt ? parent.id : null
    const siblings = childrenMap(pages).get(parentId) ?? []
    await this.update(id, { trashedAt: null, parentId, sort: parentId === page.parentId ? page.sort : sortAtEnd(siblings) })
  }

  /** Apaga de vez a página e todas as subpáginas (aqui e, na próxima sincronização, no servidor). */
  async deleteForever(id: string): Promise<void> {
    const pages = await this.all()
    const ids = [id, ...descendants(pages, id).map((p) => p.id)]
    await this.db.transaction('rw', this.db.pages, this.db.deletions, async () => {
      await this.db.pages.bulkDelete(ids)
      await this.db.deletions.put({ id })
    })
    this.changed()
  }

  async duplicate(id: string, suffix: string): Promise<LocalPage | null> {
    const page = await this.get(id)
    if (!page) return null
    const copy = await this.create({
      parentId: page.parentId,
      title: page.title ? `${page.title} ${suffix}` : '',
      icon: page.icon,
      content: structuredClone(page.content)
    })
    // Fica logo a seguir ao original.
    await this.update(copy.id, { sort: page.sort + 0.5, cover: page.cover })
    return copy
  }
}

/** Liga um componente a uma consulta à base de dados local: atualiza sozinho quando os dados mudam. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}
