import type { PageStore } from './store'
import { mergeRemote, pushOrder, toPayload, type RemotePage } from './sync-logic'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

const INTERVAL_MS = 15_000
const DEBOUNCE_MS = 800

/**
 * Sincroniza a base de dados local com o servidor:
 * envia o que mudou aqui, depois recebe o que mudou noutros dispositivos.
 */
export class SyncEngine {
  private status: SyncStatus = 'idle'
  private listeners = new Set<(s: SyncStatus) => void>()
  /** Páginas novas que o servidor recusou por o plano grátis já ter chegado ao limite (ficam só neste computador). */
  private overLimit = 0
  private limitListeners = new Set<(count: number) => void>()
  private running = false
  private again = false
  private timer: ReturnType<typeof setInterval> | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null

  constructor(private readonly store: PageStore) {}

  start(): void {
    this.unsubscribe = this.store.onLocalChange(() => this.schedule())
    this.timer = setInterval(() => void this.run(), INTERVAL_MS)
    window.addEventListener('online', this.onWake)
    window.addEventListener('focus', this.onWake)
    void this.run()
  }

  stop(): void {
    this.unsubscribe?.()
    if (this.timer) clearInterval(this.timer)
    if (this.debounce) clearTimeout(this.debounce)
    window.removeEventListener('online', this.onWake)
    window.removeEventListener('focus', this.onWake)
  }

  subscribe(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  /** Avisa quantas páginas ficaram por enviar por causa do limite do plano grátis (0 = nenhuma). */
  onLimit(listener: (count: number) => void): () => void {
    this.limitListeners.add(listener)
    listener(this.overLimit)
    return () => this.limitListeners.delete(listener)
  }

  private onWake = () => void this.run()

  /**
   * Agenda um envio pouco depois da primeira alteração. Não adia a cada tecla:
   * quem escreve sem parar tinha as alterações presas até parar de escrever.
   */
  private schedule(): void {
    // Há alterações por enviar: o indicador não pode dizer "Sincronizado".
    if (this.status !== 'offline') this.set('syncing')
    if (this.debounce) return
    this.debounce = setTimeout(() => {
      this.debounce = null
      void this.run()
    }, DEBOUNCE_MS)
  }

  private set(status: SyncStatus): void {
    this.status = status
    for (const listener of this.listeners) listener(status)
  }

  /** Uma volta de sincronização. Se já estiver a correr, corre outra vez no fim. */
  async run(): Promise<void> {
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    this.set('syncing')
    try {
      do {
        this.again = false
        await this.push()
        await this.pull()
      } while (this.again)
      // Se entretanto houve alterações, o envio já está agendado: continua "a sincronizar".
      this.set(this.debounce ? 'syncing' : 'idle')
    } catch (error) {
      this.set(error instanceof OfflineError ? 'offline' : 'error')
    } finally {
      this.running = false
    }
  }

  private async request(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown) {
    const res = await window.remind.pages.request(method, path, body)
    if (res.status === 0) throw new OfflineError()
    if (res.status === 401) throw new Error('sessão terminada')
    if (res.status >= 500) throw new Error(`servidor: ${res.status}`)
    return res
  }

  private async push(): Promise<void> {
    const { db } = this.store

    for (const { id } of await db.deletions.toArray()) {
      const res = await this.request('DELETE', `/api/pages/${id}`)
      if (res.status === 200 || res.status === 404) await db.deletions.delete(id)
    }

    const all = await db.pages.toArray()
    const dirty = pushOrder(all.filter((p) => p.dirty), all)
    let overLimit = 0
    for (const page of dirty) {
      const res = await this.request('PUT', `/api/pages/${page.id}`, toPayload(page))
      if (res.status === 200) {
        // Só marca como enviada se ninguém a alterou entretanto.
        await db.transaction('rw', db.pages, async () => {
          const current = await db.pages.get(page.id)
          if (current && current.rev === page.rev) await db.pages.update(page.id, { dirty: 0 })
        })
      } else if (res.status === 410) {
        // Apagada noutro dispositivo.
        await db.pages.delete(page.id)
      } else if (res.status === 402) {
        // Plano grátis no limite: a página fica guardada aqui e volta a tentar quando houver espaço (ou Pro).
        overLimit++
      } else if (res.status === 400 && page.parentId) {
        // Página-mãe já não existe no servidor: a página passa para o topo e volta a tentar.
        await db.pages.update(page.id, { parentId: null, rev: page.rev + 1 })
        this.again = true
      } else {
        console.warn('Página recusada pelo servidor', page.id, res.status, res.data)
      }
    }
    if (overLimit !== this.overLimit) {
      this.overLimit = overLimit
      for (const listener of this.limitListeners) listener(overLimit)
    }
  }

  private async pull(): Promise<void> {
    const { db } = this.store
    const cursor = (await db.meta.get('cursor'))?.value
    const res = await this.request('GET', cursor ? `/api/pages?since=${cursor}` : '/api/pages')
    if (res.status !== 200 || !res.data) return
    const data = res.data as { pages: RemotePage[]; cursor: string }
    await db.transaction('rw', db.pages, db.meta, async () => {
      for (const remote of data.pages) {
        const action = mergeRemote(await db.pages.get(remote.id), remote)
        if (action.kind === 'put') await db.pages.put(action.page)
        else if (action.kind === 'delete') await db.pages.delete(remote.id)
      }
      await db.meta.put({ key: 'cursor', value: data.cursor })
    })
  }
}

class OfflineError extends Error {}
