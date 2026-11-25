import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '../../../shared/types'
import { PageStore, useLive } from '../data/store'
import { SyncEngine, type SyncStatus } from '../data/sync'
import type { LocalPage } from '../data/sync-logic'
import { useI18n } from '../i18n'
import { PlusIcon, SidebarIcon } from '../ui/icons'
import { Logo } from '../ui/Logo'
import { WorkspaceContext, type WorkspaceValue } from './context'
import { SearchModal, SettingsModal, TrashPopover } from './Overlays'
import { PageView } from './PageView'
import { Sidebar } from './Sidebar'

const lastPageKey = (userId: string) => `remind.lastPage.${userId}`

export function Workspace({ user, offline, version, serverUrl }: { user: User; offline: boolean; version: string; serverUrl: string }) {
  const { t } = useI18n()
  const store = useMemo(() => new PageStore(user.id), [user.id])
  const sync = useMemo(() => new SyncEngine(store), [store])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [overLimit, setOverLimit] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const pages = useLive<LocalPage[]>(
    async () => {
      const all = await store.all()
      setLoaded(true)
      return all
    },
    [store],
    []
  )
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(lastPageKey(user.id)))
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [overlay, setOverlay] = useState<'search' | 'settings' | null>(null)
  const [trashAnchor, setTrashAnchor] = useState<HTMLElement | null>(null)

  useEffect(() => {
    sync.start()
    const off = sync.subscribe(setSyncStatus)
    const offLimit = sync.onLimit(setOverLimit)
    return () => {
      off()
      offLimit()
      sync.stop()
      store.db.close()
    }
  }, [sync, store])

  const open = useCallback(
    (id: string | null) => {
      setCurrentId(id)
      try {
        if (id) localStorage.setItem(lastPageKey(user.id), id)
        else localStorage.removeItem(lastPageKey(user.id))
      } catch {
        /* só em memória */
      }
    },
    [user.id]
  )

  const createPage = useCallback(
    async (parentId: string | null = null) => {
      const page = await store.create({ parentId })
      open(page.id)
    },
    [store, open]
  )

  // Atalhos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'k' || key === 'p') {
        e.preventDefault()
        setOverlay((o) => (o === 'search' ? null : 'search'))
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        void createPage(null)
      } else if (e.key === '\\') {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createPage])

  // Links remind://page/<id>
  useEffect(() => window.remind.onDeepLink((link) => link.kind === 'open-page' && open(link.pageId)), [open])

  const current = pages.find((p) => p.id === currentId) ?? null

  const value: WorkspaceValue = { user, store, pages, loaded, currentId: current?.id ?? null, open, createPage, syncStatus, offline }

  return (
    <WorkspaceContext.Provider value={value}>
      <div className={`workspace${sidebarOpen ? '' : ' sidebar-closed'}`}>
        {sidebarOpen && (
          <Sidebar
            onSearch={() => setOverlay('search')}
            onSettings={() => setOverlay('settings')}
            onTrash={(anchor) => setTrashAnchor(anchor)}
            onCollapse={() => setSidebarOpen(false)}
          />
        )}
        <main className="main">
          {overLimit > 0 && (
            <div className="limit-banner" role="status" data-testid="limit-banner">
              {t('ws.limitBanner', { count: String(overLimit) })}
            </div>
          )}
          {current ? (
            // Um ecrã novo por página: nada do estado da página anterior (título a meio, menus) passa para a seguinte.
            <PageView key={current.id} page={current} sidebarOpen={sidebarOpen} onExpand={() => setSidebarOpen(true)} />
          ) : (
            <div className="empty-state">
              {!sidebarOpen && (
                <button className="icon-btn floating" title={t('ws.expand')} aria-label={t('ws.expand')} onClick={() => setSidebarOpen(true)}>
                  <SidebarIcon />
                </button>
              )}
              {loaded && (
                <>
                  <Logo size={56} />
                  {pages.some((p) => !p.trashedAt) ? (
                    <h1>Remind</h1>
                  ) : (
                    <>
                      <h1>{t('ws.emptyTitle')}</h1>
                      <p className="muted">{t('ws.emptyText')}</p>
                    </>
                  )}
                  <button className="btn btn-primary" onClick={() => void createPage(null)} data-testid="empty-new-page">
                    <PlusIcon size={14} /> {t('ws.newPage')}
                  </button>
                  <p className="muted small">{t('ws.shortcuts')}</p>
                </>
              )}
            </div>
          )}
        </main>
      </div>
      {overlay === 'search' && <SearchModal onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && <SettingsModal onClose={() => setOverlay(null)} version={version} serverUrl={serverUrl} />}
      {trashAnchor && <TrashPopover anchor={trashAnchor} onClose={() => setTrashAnchor(null)} />}
    </WorkspaceContext.Provider>
  )
}
