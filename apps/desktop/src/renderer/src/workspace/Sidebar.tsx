import { useCallback, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import type { LocalPage } from '../data/sync-logic'
import { childrenMap, computeDrop, type DropPosition } from '../data/tree'
import { useI18n } from '../i18n'
import {
  CalendarIcon,
  ChevronIcon,
  CopyIcon,
  DotsIcon,
  GearIcon,
  PageIcon,
  PlusIcon,
  SearchIcon,
  SidebarIcon,
  SignOutIcon,
  SparkleIcon,
  StarIcon,
  TrashIcon
} from '../ui/icons'
import { Menu, type MenuItem } from '../ui/primitives'
import { useWorkspace } from './context'

const EXPANDED_KEY = 'remind.expanded'

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function PageTitle({ page }: { page: Pick<LocalPage, 'title' | 'icon'> }) {
  const { t } = useI18n()
  return (
    <>
      <span className="page-icon">{page.icon ?? <PageIcon />}</span>
      <span className={`page-name${page.title ? '' : ' untitled'}`}>{page.title || t('ws.untitled')}</span>
    </>
  )
}

interface Props {
  onSearch: () => void
  onSettings: () => void
  onTrash: (anchor: HTMLElement) => void
  onCollapse: () => void
  onCalendar: () => void
  calendarActive: boolean
}

export function Sidebar({ onSearch, onSettings, onTrash, onCollapse, onCalendar, calendarActive }: Props) {
  const { t } = useI18n()
  const { user, pages, store, currentId, open, createPage, plan, openPro } = useWorkspace()
  const [expanded, setExpanded] = useState(loadExpanded)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null)
  const [drag, setDrag] = useState<{ id: string; target: string | null; position: DropPosition | null }>({ id: '', target: null, position: null })

  const tree = useMemo(() => childrenMap(pages), [pages])
  const favorites = useMemo(() => pages.filter((p) => p.favorite && !p.trashedAt).sort((a, b) => a.title.localeCompare(b.title)), [pages])

  const toggle = useCallback((id: string, force?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (force ?? !next.has(id)) next.add(id)
      else next.delete(id)
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      } catch {
        /* só em memória */
      }
      return next
    })
  }, [])

  const pageMenu = (page: LocalPage, anchor: HTMLElement) =>
    setMenu({
      anchor,
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
            if (currentId === page.id) open(null)
          }
        }
      ]
    })

  const accountMenu = (anchor: HTMLElement) =>
    setMenu({
      anchor,
      items: [
        { label: t('ws.settings'), icon: <GearIcon />, onSelect: onSettings },
        { label: t('ws.signOut'), icon: <SignOutIcon />, danger: true, onSelect: () => void window.remind.auth.signOut() }
      ]
    })

  const onDragOver = (e: DragEvent, target: LocalPage) => {
    if (!drag.id) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - rect.top) / rect.height
    const position: DropPosition = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'
    if (!computeDrop(pages, drag.id, target.id, position)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (drag.target !== target.id || drag.position !== position) setDrag({ ...drag, target: target.id, position })
  }

  const onDrop = (e: DragEvent, target: LocalPage) => {
    e.preventDefault()
    if (!drag.id || !drag.position) return
    const result = computeDrop(pages, drag.id, target.id, drag.position)
    if (result) {
      void store.update(drag.id, result)
      if (drag.position === 'inside') toggle(target.id, true)
    }
    setDrag({ id: '', target: null, position: null })
  }

  const renderItem = (page: LocalPage, depth: number) => {
    const children = tree.get(page.id) ?? []
    const isOpen = expanded.has(page.id)
    const dropClass = drag.target === page.id && drag.position ? ` drop-${drag.position}` : ''
    return (
      <li key={page.id}>
        <div
          className={`tree-item${currentId === page.id ? ' active' : ''}${dropClass}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', page.id)
            setDrag({ id: page.id, target: null, position: null })
          }}
          onDragEnd={() => setDrag({ id: '', target: null, position: null })}
          onDragOver={(e) => onDragOver(e, page)}
          onDragLeave={() => drag.target === page.id && setDrag({ ...drag, target: null, position: null })}
          onDrop={(e) => onDrop(e, page)}
          onClick={() => open(page.id)}
          onContextMenu={(e: MouseEvent) => {
            e.preventDefault()
            pageMenu(page, e.currentTarget as HTMLElement)
          }}
          data-testid="tree-item"
          data-page-id={page.id}
        >
          <button
            className={`tree-toggle${isOpen ? ' open' : ''}`}
            aria-label={isOpen ? 'Fechar' : 'Abrir'}
            onClick={(e) => {
              e.stopPropagation()
              toggle(page.id)
            }}
          >
            <ChevronIcon size={12} />
          </button>
          <PageTitle page={page} />
          <span className="tree-actions">
            <button
              className="icon-btn"
              title={t('ws.moreActions')}
              aria-label={t('ws.moreActions')}
              onClick={(e) => {
                e.stopPropagation()
                pageMenu(page, e.currentTarget)
              }}
            >
              <DotsIcon size={14} />
            </button>
            <button
              className="icon-btn"
              title={t('ws.addSubpage')}
              aria-label={t('ws.addSubpage')}
              data-testid="add-subpage"
              onClick={(e) => {
                e.stopPropagation()
                toggle(page.id, true)
                void createPage(page.id)
              }}
            >
              <PlusIcon size={14} />
            </button>
          </span>
        </div>
        {isOpen && children.length > 0 && <ul>{children.map((child) => renderItem(child, depth + 1))}</ul>}
        {isOpen && children.length === 0 && (
          <div className="tree-empty" style={{ paddingLeft: 26 + depth * 14 }}>
            —
          </div>
        )}
      </li>
    )
  }

  const roots = tree.get(null) ?? []

  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar-top">
        <button className="account-btn" onClick={(e) => accountMenu(e.currentTarget)} data-testid="account-menu">
          <span className="avatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
          <span className="account-name">{user.name || user.email}</span>
        </button>
        <button className="icon-btn" title={t('ws.collapse')} aria-label={t('ws.collapse')} onClick={onCollapse}>
          <SidebarIcon />
        </button>
      </div>

      <nav className="sidebar-actions">
        <button className="nav-item" onClick={onSearch} data-testid="open-search">
          <SearchIcon /> <span>{t('ws.search')}</span> <kbd>Ctrl K</kbd>
        </button>
        <button className={`nav-item${calendarActive ? ' active' : ''}`} onClick={onCalendar} data-testid="open-calendar">
          <CalendarIcon /> <span>{t('cal.title')}</span>
        </button>
        <button className="nav-item" onClick={onSettings}>
          <GearIcon /> <span>{t('ws.settings')}</span>
        </button>
        <button className="nav-item" onClick={() => void createPage(null)} data-testid="new-page">
          <PlusIcon /> <span>{t('ws.newPage')}</span>
        </button>
        {plan === 'free' && (
          <button className="nav-item nav-pro" onClick={openPro} data-testid="open-pro">
            <SparkleIcon /> <span>{t('pro.navItem')}</span>
          </button>
        )}
      </nav>

      <div className="sidebar-scroll">
        {favorites.length > 0 && (
          <section>
            <h2 className="section-title">{t('ws.favorites')}</h2>
            <ul className="tree">
              {favorites.map((page) => (
                <li key={page.id}>
                  <div className={`tree-item${currentId === page.id ? ' active' : ''}`} style={{ paddingLeft: 24 }} onClick={() => open(page.id)}>
                    <PageTitle page={page} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h2 className="section-title">
            {t('ws.private')}
            <button className="icon-btn" title={t('ws.newPage')} aria-label={t('ws.newPage')} onClick={() => void createPage(null)}>
              <PlusIcon size={14} />
            </button>
          </h2>
          <ul className="tree" data-testid="page-tree">
            {roots.map((page) => renderItem(page, 0))}
          </ul>
        </section>
      </div>

      <div className="sidebar-bottom">
        <button className="nav-item" onClick={(e) => onTrash(e.currentTarget)} data-testid="open-trash">
          <TrashIcon /> <span>{t('ws.trash')}</span>
        </button>
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  )
}
