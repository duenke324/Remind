import { useEffect, useMemo, useRef, useState } from 'react'
import type { LocalPage } from '../data/sync-logic'
import { ancestors, isInTrash } from '../data/tree'
import { useI18n } from '../i18n'
import { CheckIcon, CloudOffIcon, CopyIcon, DotsIcon, ImageIcon, RestoreIcon, SidebarIcon, SmileIcon, StarIcon, TrashIcon } from '../ui/icons'
import { Menu, relativeTime, type MenuItem } from '../ui/primitives'
import { useWorkspace } from './context'
import { Editor, type EditorHandle } from './Editor'
import { CoverPicker, EmojiPicker, coverClass, coverStyle } from './Pickers'
import { PageTitle } from './Sidebar'

function SyncBadge() {
  const { t } = useI18n()
  const { syncStatus, offline } = useWorkspace()
  if (offline || syncStatus === 'offline')
    return (
      <span className="sync-badge offline" title={t('ws.offline')} data-testid="sync-status" data-status="offline">
        <CloudOffIcon size={14} /> Offline
      </span>
    )
  if (syncStatus === 'error')
    return (
      <span className="sync-badge error" data-testid="sync-status" data-status="error">
        {t('ws.syncError')}
      </span>
    )
  if (syncStatus === 'syncing')
    return (
      <span className="sync-badge" data-testid="sync-status" data-status="syncing">
        {t('ws.syncing')}
      </span>
    )
  return (
    <span className="sync-badge ok" data-testid="sync-status" data-status="idle">
      <CheckIcon size={14} /> {t('ws.synced')}
    </span>
  )
}

export function PageView({ page, sidebarOpen, onExpand }: { page: LocalPage; sidebarOpen: boolean; onExpand: () => void }) {
  const { t, lang } = useI18n()
  const { pages, store, open } = useWorkspace()
  const [title, setTitle] = useState(page.title)
  const [picker, setPicker] = useState<{ kind: 'emoji' | 'cover'; anchor: HTMLElement } | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null)
  const editorRef = useRef<EditorHandle>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const editingTitle = useRef(false)

  const trail = useMemo(() => ancestors(pages, page.id), [pages, page.id])
  const inTrash = useMemo(() => isInTrash(pages, page.id), [pages, page.id])

  // O título acompanha alterações vindas de fora (sincronização, barra lateral) quando não está a ser editado.
  useEffect(() => {
    if (!editingTitle.current) setTitle(page.title)
  }, [page.title])

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  // Página nova: o cursor começa no título.
  useEffect(() => {
    if (!page.title && page.content.length === 0) titleRef.current?.focus()
  }, [page.id])

  const saveTitle = (value: string) => {
    setTitle(value)
    void store.update(page.id, { title: value.replace(/\n/g, ' ').slice(0, 2000) })
  }

  const moreMenu = (anchor: HTMLElement) =>
    setMenu({
      anchor,
      align: 'end',
      items: [
        {
          label: page.favorite ? t('ws.removeFavorite') : t('ws.addFavorite'),
          icon: <StarIcon filled={page.favorite} />,
          onSelect: () => void store.update(page.id, { favorite: !page.favorite })
        },
        {
          label: t('ws.duplicate'),
          icon: <CopyIcon />,
          onSelect: async () => {
            const copy = await store.duplicate(page.id, t('ws.copySuffix'))
            if (copy) open(copy.id)
          }
        },
        {
          label: t('ws.moveToTrash'),
          icon: <TrashIcon />,
          danger: true,
          onSelect: () => {
            void store.trash(page.id)
            open(null)
          }
        }
      ]
    } as { anchor: HTMLElement; items: MenuItem[] })

  return (
    <div className="page-view" data-testid="page-view">
      <header className="topbar">
        {!sidebarOpen && (
          <button className="icon-btn" title={t('ws.expand')} aria-label={t('ws.expand')} onClick={onExpand}>
            <SidebarIcon />
          </button>
        )}
        <nav className="breadcrumbs" aria-label="breadcrumbs">
          {trail.map((p, i) => (
            <span key={p.id} className="crumb">
              {i > 0 && <span className="crumb-sep">/</span>}
              <button className="crumb-btn" onClick={() => open(p.id)}>
                <PageTitle page={p} />
              </button>
            </span>
          ))}
        </nav>
        <div className="topbar-right">
          <span className="edited">{t('ws.editedAt', { time: relativeTime(page.updatedAt, lang) })}</span>
          <SyncBadge />
          <button
            className={`icon-btn${page.favorite ? ' starred' : ''}`}
            title={page.favorite ? t('ws.removeFavorite') : t('ws.addFavorite')}
            aria-label={page.favorite ? t('ws.removeFavorite') : t('ws.addFavorite')}
            onClick={() => void store.update(page.id, { favorite: !page.favorite })}
            data-testid="favorite-toggle"
          >
            <StarIcon filled={page.favorite} />
          </button>
          <button className="icon-btn" title={t('ws.moreActions')} aria-label={t('ws.moreActions')} onClick={(e) => moreMenu(e.currentTarget)}>
            <DotsIcon />
          </button>
        </div>
      </header>

      {inTrash && (
        <div className="trash-banner" role="status">
          <span>{t('ws.trashBanner')}</span>
          <button className="btn btn-outline btn-sm" onClick={() => void store.restore(page.id)}>
            <RestoreIcon size={14} /> {t('ws.restore')}
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (confirm(t('ws.deleteForeverConfirm', { title: page.title || t('ws.untitled') }))) {
                void store.deleteForever(page.id)
                open(null)
              }
            }}
          >
            <TrashIcon size={14} /> {t('ws.deleteForever')}
          </button>
        </div>
      )}

      <div className="page-scroll">
        {page.cover && (
          <div className={`cover ${coverClass(page.cover)}`} style={coverStyle(page.cover)} data-testid="page-cover">
            {!inTrash && (
              <button className="btn btn-glass btn-sm cover-change" onClick={(e) => setPicker({ kind: 'cover', anchor: e.currentTarget })}>
                {t('ws.changeCover')}
              </button>
            )}
          </div>
        )}
        <div className={`page-body${page.cover ? ' has-cover' : ''}`}>
          {page.icon && (
            <button
              className="page-big-icon"
              onClick={(e) => !inTrash && setPicker({ kind: 'emoji', anchor: e.currentTarget })}
              data-testid="page-icon"
            >
              {page.icon}
            </button>
          )}
          {!inTrash && (
            <div className="page-controls">
              {!page.icon && (
                <button className="ghost-btn" onClick={(e) => setPicker({ kind: 'emoji', anchor: e.currentTarget })} data-testid="add-icon">
                  <SmileIcon size={14} /> {t('ws.addIcon')}
                </button>
              )}
              {!page.cover && (
                <button className="ghost-btn" onClick={(e) => setPicker({ kind: 'cover', anchor: e.currentTarget })} data-testid="add-cover">
                  <ImageIcon size={14} /> {t('ws.addCover')}
                </button>
              )}
            </div>
          )}
          <textarea
            ref={titleRef}
            className="page-title-input"
            rows={1}
            placeholder={t('ws.titlePlaceholder')}
            value={title}
            readOnly={inTrash}
            data-testid="page-title"
            onFocus={() => (editingTitle.current = true)}
            onBlur={() => (editingTitle.current = false)}
            onChange={(e) => saveTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault()
                editorRef.current?.focusStart()
              }
            }}
          />
          <Editor
            key={page.id}
            ref={editorRef}
            content={page.content}
            clean={!page.dirty}
            readOnly={inTrash}
            onChange={(content) => void store.update(page.id, { content })}
          />
        </div>
      </div>

      {picker?.kind === 'emoji' && (
        <EmojiPicker
          anchor={picker.anchor}
          onClose={() => setPicker(null)}
          onPick={(icon) => {
            void store.update(page.id, { icon })
            setPicker(null)
          }}
          onRemove={() => {
            void store.update(page.id, { icon: null })
            setPicker(null)
          }}
        />
      )}
      {picker?.kind === 'cover' && (
        <CoverPicker
          anchor={picker.anchor}
          onClose={() => setPicker(null)}
          onPick={(cover) => {
            void store.update(page.id, { cover })
            setPicker(null)
          }}
          onRemove={() => {
            void store.update(page.id, { cover: null })
            setPicker(null)
          }}
        />
      )}
      {menu && <Menu anchor={menu.anchor} items={menu.items} align="end" onClose={() => setMenu(null)} />}
    </div>
  )
}
