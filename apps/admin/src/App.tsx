import { useCallback, useEffect, useState } from 'react'
import { ApiError, auth, type AdminInfo } from './api'
import { Audit } from './Audit'
import { Dashboard } from './Dashboard'
import { Login } from './Login'
import { Users } from './Users'

type Route = { view: 'overview' } | { view: 'users'; id: string | null } | { view: 'audit' }

// Rotas no "#" para funcionar em qualquer caminho (/admin/ ou a raiz de admin.remind.uno).
function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'contas') return { view: 'users', id: parts[1] ? decodeURIComponent(parts[1]) : null }
  if (parts[0] === 'registo') return { view: 'audit' }
  return { view: 'overview' }
}

function toHash(route: Route): string {
  if (route.view === 'users') return route.id ? `#/contas/${encodeURIComponent(route.id)}` : '#/contas'
  if (route.view === 'audit') return '#/registo'
  return '#/'
}

export function App() {
  const [state, setState] = useState<'loading' | 'signed-out' | 'denied' | 'ready'>('loading')
  const [me, setMe] = useState<AdminInfo | null>(null)
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  const [menuOpen, setMenuOpen] = useState(false)

  const check = useCallback(async () => {
    try {
      const { admin } = await auth.me()
      setMe(admin)
      setState('ready')
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'denied' : 'signed-out')
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(location.hash))
      setMenuOpen(false)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((next: Route) => {
    location.hash = toHash(next)
  }, [])

  const signOut = async () => {
    await auth.signOut().catch(() => undefined)
    setMe(null)
    setState('signed-out')
  }

  if (state === 'loading') return <div className="center muted">A carregar…</div>
  if (state === 'signed-out') return <Login onSignedIn={() => void check()} />
  if (state === 'denied')
    return (
      <div className="center">
        <div className="login-card">
          <h1>Sem acesso</h1>
          <p className="muted">Esta conta não é de administrador.</p>
          <button className="btn" onClick={() => void signOut()}>
            Sair e entrar com outra conta
          </button>
        </div>
      </div>
    )

  const nav: { route: Route; label: string; active: boolean }[] = [
    { route: { view: 'overview' }, label: 'Visão geral', active: route.view === 'overview' },
    { route: { view: 'users', id: null }, label: 'Contas', active: route.view === 'users' },
    { route: { view: 'audit' }, label: 'Registo', active: route.view === 'audit' }
  ]

  return (
    <div className="shell">
      <header className="topbar">
        <button className="btn btn-ghost menu-toggle" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
          ☰
        </button>
        <span className="brand-small">
          <span className="logo" aria-hidden="true">
            R
          </span>
          Remind <span className="muted">admin</span>
        </span>
      </header>
      <nav className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Secções">
        <span className="brand-small desktop-only">
          <span className="logo" aria-hidden="true">
            R
          </span>
          Remind <span className="muted">admin</span>
        </span>
        {nav.map((item) => (
          <a key={item.label} href={toHash(item.route)} className={item.active ? 'active' : undefined} aria-current={item.active ? 'page' : undefined}>
            {item.label}
          </a>
        ))}
        <div className="sidebar-foot">
          <span className="muted small">{me?.email}</span>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </nav>
      <main className="content">
        {route.view === 'overview' && <Dashboard />}
        {route.view === 'users' && <Users selected={route.id} me={me?.id ?? ''} onSelect={(id) => go({ view: 'users', id })} />}
        {route.view === 'audit' && <Audit onOpenUser={(id) => go({ view: 'users', id })} />}
      </main>
    </div>
  )
}
