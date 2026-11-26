import { useEffect, useMemo, useState } from 'react'
import { searchPages } from '../data/tree'
import { useI18n, type Lang } from '../i18n'
import { useSettings, type ThemePref } from '../settings'
import { RestoreIcon, SearchIcon, SignOutIcon, TrashIcon } from '../ui/icons'
import { Modal, Popover, relativeTime } from '../ui/primitives'
import { announceUpdate } from '../ui/UpdatePrompt'
import { useWorkspace } from './context'
import { PageTitle } from './Sidebar'

export function SearchModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n()
  const { pages, open } = useWorkspace()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  const results = useMemo(() => {
    if (query.trim()) return searchPages(pages, query)
    return [...pages]
      .filter((p) => !p.trashedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map((page) => ({ page, snippet: null }))
  }, [pages, query])

  useEffect(() => setIndex(0), [query])

  const choose = (i: number) => {
    const hit = results[i]
    if (!hit) return
    open(hit.page.id)
    onClose()
  }

  return (
    <Modal onClose={onClose} className="search-modal" label={t('ws.search')}>
      <div className="search-input">
        <SearchIcon />
        <input
          autoFocus
          placeholder={t('ws.searchPlaceholder')}
          value={query}
          data-testid="search-input"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(index)
            }
          }}
        />
      </div>
      <div className="search-results" role="listbox">
        {!query.trim() && results.length > 0 && <div className="section-title">{t('ws.recent')}</div>}
        {query.trim() && results.length === 0 && <p className="muted pad">{t('ws.noResults')}</p>}
        {results.map((hit, i) => (
          <button
            key={hit.page.id}
            role="option"
            aria-selected={i === index}
            className={`search-hit${i === index ? ' selected' : ''}`}
            onMouseEnter={() => setIndex(i)}
            onClick={() => choose(i)}
            data-testid="search-hit"
          >
            <span className="hit-title">
              <PageTitle page={hit.page} />
            </span>
            {hit.snippet && <span className="hit-snippet">…{hit.snippet}…</span>}
            <span className="hit-time">{relativeTime(hit.page.updatedAt, lang)}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function TrashPopover({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { t } = useI18n()
  const { pages, store, open, currentId } = useWorkspace()
  const [filter, setFilter] = useState('')
  const trashed = pages
    .filter((p) => p.trashedAt && p.title.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => (b.trashedAt ?? '').localeCompare(a.trashedAt ?? ''))

  return (
    <Popover anchor={anchor} onClose={onClose} className="trash-popover">
      <input className="trash-filter" placeholder={t('ws.searchPlaceholder')} value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
      {trashed.length === 0 && <p className="muted pad">{t('ws.trashEmpty')}</p>}
      <ul data-testid="trash-list">
        {trashed.map((page) => (
          <li key={page.id} className="trash-item">
            <button className="trash-open" onClick={() => open(page.id)}>
              <PageTitle page={page} />
            </button>
            <button className="icon-btn" title={t('ws.restore')} aria-label={t('ws.restore')} onClick={() => void store.restore(page.id)} data-testid="restore">
              <RestoreIcon size={14} />
            </button>
            <button
              className="icon-btn danger"
              title={t('ws.deleteForever')}
              aria-label={t('ws.deleteForever')}
              onClick={() => {
                if (confirm(t('ws.deleteForeverConfirm', { title: page.title || t('ws.untitled') }))) {
                  void store.deleteForever(page.id)
                  if (currentId === page.id) open(null)
                }
              }}
            >
              <TrashIcon size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  )
}

export function SettingsModal({ onClose, version, serverUrl }: { onClose: () => void; version: string; serverUrl: string }) {
  const { t } = useI18n()
  const { user, plan, openPro } = useWorkspace()
  const { settings, update } = useSettings()

  return (
    <Modal onClose={onClose} className="settings-modal" label={t('ws.settings')}>
      <h2>{t('ws.settings')}</h2>

      <section className="settings-section">
        <h3>{t('ws.account')}</h3>
        <div className="account-card">
          <span className="avatar big">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
          <div>
            <div className="strong">{user.name}</div>
            <div className="muted">{user.email}</div>
          </div>
          <button className="btn btn-outline btn-sm push-right" onClick={() => void window.remind.auth.signOut()} data-testid="sign-out">
            <SignOutIcon size={14} /> {t('ws.signOut')}
          </button>
        </div>
      </section>

      <section className="settings-section" data-testid="settings-plan">
        <h3>{t('pro.planTitle')}</h3>
        <div className="settings-row">
          <span>
            {plan === 'pro' ? (
              <>
                <span className="pro-badge">Pro</span> {t('pro.planPro')}
              </>
            ) : plan === 'free' ? (
              t('pro.planFree')
            ) : (
              <span className="muted">—</span>
            )}
          </span>
          {plan && (
            <button className={`btn btn-sm ${plan === 'pro' ? 'btn-outline' : 'btn-primary'}`} onClick={openPro} data-testid="settings-pro">
              {plan === 'pro' ? t('pro.manage') : t('pro.upgrade')}
            </button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h3>{t('ws.appearance')}</h3>
        <label className="settings-row">
          <span>{t('ws.theme')}</span>
          <select value={settings.theme} onChange={(e) => update({ theme: e.target.value as ThemePref })} data-testid="theme-select">
            <option value="system">{t('ws.themeSystem')}</option>
            <option value="light">{t('ws.themeLight')}</option>
            <option value="dark">{t('ws.themeDark')}</option>
          </select>
        </label>
        <label className="settings-row">
          <span>{t('ws.language')}</span>
          <select value={settings.lang} onChange={(e) => update({ lang: e.target.value as Lang })} data-testid="lang-select">
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </label>
      </section>

      <section className="settings-section">
        <h3>{t('ws.about')}</h3>
        <p className="muted">
          Remind · {t('ws.version', { version })} · {serverUrl}
        </p>
        <p className="muted">{t('ws.shortcuts')}</p>
        <UpdateCheck />
      </section>

      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          {t('ws.close')}
        </button>
      </div>
    </Modal>
  )
}

function UpdateCheck() {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'checking' | 'current' | 'error'>('idle')
  return (
    <div className="settings-row">
      <span>
        <button
          className="btn btn-outline btn-sm"
          data-testid="check-updates"
          disabled={state === 'checking'}
          onClick={async () => {
            setState('checking')
            const result = await window.remind.updates.check()
            if (result.status === 'available') {
              setState('idle')
              announceUpdate(result.update)
            } else setState(result.status)
          }}
        >
          {state === 'checking' ? t('upd.checking') : t('upd.check')}
        </button>
        {(state === 'current' || state === 'error') && (
          <span className="muted update-status" data-testid="update-status">
            {t(state === 'current' ? 'upd.current' : 'upd.error')}
          </span>
        )}
      </span>
    </div>
  )
}
