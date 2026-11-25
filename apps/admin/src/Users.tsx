import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { admin, ApiError, type Filter, type UserDetail as Detail, type UserRow } from './api'
import { ACTION_LABELS, Badge, ErrorNote, fmtAgo, fmtBytes, fmtDate, fmtDateTime, Modal } from './ui'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todas' },
  { id: 'pro', label: 'Pro' },
  { id: 'gratis', label: 'Grátis' },
  { id: 'por-verificar', label: 'Por confirmar' },
  { id: 'banidos', label: 'Suspensas' },
  { id: 'admins', label: 'Admins' }
]
const PAGE_SIZE = 25

export function Users({ selected, onSelect, me }: { selected: string | null; onSelect: (id: string | null) => void; me: string }) {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<{ total: number; users: UserRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  // Procura enquanto se escreve, com uma pequena pausa.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim())
      setOffset(0)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let alive = true
    setError(null)
    admin.users({ q: query, filtro: filter, offset, limit: PAGE_SIZE }).then(
      (r) => alive && setData(r),
      (e: Error) => alive && setError(e.message)
    )
    return () => {
      alive = false
    }
  }, [query, filter, offset, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])

  return (
    <section className={selected ? 'with-drawer' : undefined}>
      <h1>Contas</h1>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Procurar por email ou nome"
          aria-label="Procurar por email ou nome"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips" role="tablist" aria-label="Filtrar contas">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={`chip${filter === f.id ? ' active' : ''}`}
              onClick={() => {
                setFilter(f.id)
                setOffset(0)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote error={error} />
      {!data ? (
        <p className="muted">A carregar…</p>
      ) : data.users.length === 0 ? (
        <p className="muted">Nenhuma conta encontrada.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="users">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Plano</th>
                  <th className="num">Páginas</th>
                  <th>Criada</th>
                  <th>Última vez</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className={selected === u.id ? 'selected' : undefined} onClick={() => onSelect(u.id)}>
                    <td>
                      <button className="row-link" onClick={(e) => (e.stopPropagation(), onSelect(u.id))}>
                        <span className="name">{u.name || '—'}</span>
                        <span className="muted small">{u.email}</span>
                      </button>
                      <span className="tags">
                        {u.role === 'admin' && <Badge tone="admin">Admin</Badge>}
                        {u.banned && <Badge tone="danger">Suspensa</Badge>}
                        {!u.emailVerified && <Badge tone="muted">Por confirmar</Badge>}
                      </span>
                    </td>
                    <td>{u.pro ? <Badge tone="pro">Pro</Badge> : <span className="muted">Grátis</span>}</td>
                    <td className="num">{u.pages}</td>
                    <td className="nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="nowrap">{fmtAgo(u.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">
              {offset + 1}–{offset + data.users.length} de {data.total}
            </span>
            <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Anterior
            </button>
            <button className="btn" disabled={offset + PAGE_SIZE >= data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Seguinte
            </button>
          </div>
        </>
      )}

      {selected && <UserDrawer id={selected} me={me} onClose={() => onSelect(null)} onChanged={refresh} />}
    </section>
  )
}

type Dialog = 'pro' | 'ban' | 'delete' | null

function UserDrawer({ id, me, onClose, onChanged }: { id: string; me: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    admin.user(id).then(setDetail, (e: Error) => setError(e.message))
  }, [id])

  useEffect(() => {
    setDetail(null)
    setNotice(null)
    load()
  }, [load])

  async function act(label: string, action: () => Promise<unknown>, close = false) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setNotice(label)
      setDialog(null)
      onChanged()
      if (close) onClose()
      else load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Algo correu mal.')
    } finally {
      setBusy(false)
    }
  }

  const u = detail?.user
  const self = u?.id === me

  return (
    <aside className="drawer" aria-label="Detalhe da conta">
      <div className="drawer-head">
        <h2>{u ? u.name || u.email : 'Conta'}</h2>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
      <ErrorNote error={error} />
      {notice && (
        <p className="ok" role="status">
          {notice}
        </p>
      )}
      {!detail || !u ? (
        <p className="muted">A carregar…</p>
      ) : (
        <>
          <dl className="facts">
            <dt>Email</dt>
            <dd>
              {u.email} {u.emailVerified ? <Badge tone="ok">confirmado</Badge> : <Badge tone="muted">por confirmar</Badge>}
            </dd>
            <dt>Plano</dt>
            <dd>
              {detail.plan === 'pro' ? <Badge tone="pro">Pro</Badge> : 'Grátis'}
              {detail.entitlement && (
                <span className="muted small">
                  {' '}
                  · {detail.entitlement.source === 'stripe' ? 'pago (Stripe)' : 'dado por admin'}
                  {detail.entitlement.expiresAt ? ` · até ${fmtDate(detail.entitlement.expiresAt)}` : ' · sem fim'}
                </span>
              )}
            </dd>
            <dt>Papel</dt>
            <dd>{u.role === 'admin' ? <Badge tone="admin">Admin</Badge> : 'Utilizador'}</dd>
            {u.banned && (
              <>
                <dt>Suspensa</dt>
                <dd>
                  <Badge tone="danger">Sim</Badge> {u.banReason}
                  {u.banExpires ? <span className="muted small"> · até {fmtDate(u.banExpires)}</span> : null}
                </dd>
              </>
            )}
            <dt>Páginas</dt>
            <dd>
              {detail.pages.total} ({detail.pages.trashed} no lixo) · {fmtBytes(detail.pages.bytes)}
            </dd>
            <dt>Entra com</dt>
            <dd>{detail.providers.map(providerName).join(', ') || '—'}</dd>
            <dt>Criada</dt>
            <dd>{fmtDateTime(u.createdAt)}</dd>
          </dl>

          <div className="actions">
            {detail.entitlement?.source === 'stripe' ? (
              <p className="muted small">O Pro desta conta é pago pelo Stripe; gere-se lá.</p>
            ) : detail.plan === 'pro' ? (
              <button className="btn" disabled={busy} onClick={() => void act('Pro retirado.', () => admin.setPlan(u.id, 'free'))}>
                Tirar Pro
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={() => setDialog('pro')}>
                Dar Pro
              </button>
            )}
            {!self &&
              (u.banned ? (
                <button className="btn" disabled={busy} onClick={() => void act('Conta reativada.', () => admin.unban(u.id))}>
                  Reativar conta
                </button>
              ) : (
                <button className="btn" disabled={busy} onClick={() => setDialog('ban')}>
                  Suspender conta
                </button>
              ))}
            {!self && (
              <button
                className="btn"
                disabled={busy || detail.sessions.length === 0}
                onClick={() => void act('Sessões terminadas.', () => admin.revokeSessions(u.id))}
              >
                Terminar sessões ({detail.sessions.length})
              </button>
            )}
            {!self && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void act(u.role === 'admin' ? 'Deixou de ser admin.' : 'Agora é admin.', () =>
                    admin.setRole(u.id, u.role === 'admin' ? 'user' : 'admin')
                  )
                }
              >
                {u.role === 'admin' ? 'Tirar admin' : 'Tornar admin'}
              </button>
            )}
            {!self && (
              <button className="btn btn-danger" disabled={busy} onClick={() => setDialog('delete')}>
                Apagar conta
              </button>
            )}
            {self && <p className="muted small">Esta é a tua conta: não a podes suspender, apagar nem tirar o teu papel.</p>}
          </div>

          <h3>Sessões ativas</h3>
          {detail.sessions.length === 0 ? (
            <p className="muted small">Nenhuma.</p>
          ) : (
            <ul className="list">
              {detail.sessions.map((s) => (
                <li key={s.id}>
                  <span>{device(s.userAgent)}</span>
                  <span className="muted small">
                    {s.ipAddress ?? 'IP desconhecido'} · ativa {fmtAgo(s.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3>Histórico de admin</h3>
          {detail.history.length === 0 ? (
            <p className="muted small">Nenhuma ação.</p>
          ) : (
            <ul className="list">
              {detail.history.map((h, i) => (
                <li key={i}>
                  <span>{ACTION_LABELS[h.action] ?? h.action}</span>
                  <span className="muted small">
                    {h.adminEmail} · {fmtDateTime(h.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {dialog === 'pro' && <ProDialog busy={busy} onClose={() => setDialog(null)} onSubmit={(until, note) => void act('Pro dado.', () => admin.setPlan(u.id, 'pro', until, note))} />}
          {dialog === 'ban' && <BanDialog busy={busy} onClose={() => setDialog(null)} onSubmit={(reason, days) => void act('Conta suspensa.', () => admin.ban(u.id, reason, days))} />}
          {dialog === 'delete' && (
            <DeleteDialog email={u.email} busy={busy} onClose={() => setDialog(null)} onSubmit={(email) => void act('Conta apagada.', () => admin.remove(u.id, email), true)} />
          )}
        </>
      )}
    </aside>
  )
}

function ProDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (until: string | null, note: string) => void }) {
  const [duration, setDuration] = useState<'sempre' | '30' | '90' | '365' | 'data'>('sempre')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    let until: string | null = null
    if (duration === 'data') until = new Date(`${date}T23:59:59`).toISOString()
    else if (duration !== 'sempre') until = new Date(Date.now() + Number(duration) * 86400_000).toISOString()
    onSubmit(until, note.trim())
  }
  return (
    <Modal title="Dar Remind Pro" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          Durante
          <select value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)}>
            <option value="sempre">Sem fim</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="365">1 ano</option>
            <option value="data">Até uma data…</option>
          </select>
        </label>
        {duration === 'data' && (
          <label>
            Até
            <input type="date" required min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        <label>
          Nota (opcional)
          <input value={note} maxLength={500} placeholder="ex.: oferta de lançamento" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Dar Pro
          </button>
        </div>
      </form>
    </Modal>
  )
}

function BanDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (reason: string, days: number | null) => void }) {
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('')
  return (
    <Modal title="Suspender conta" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(reason.trim(), days ? Number(days) : null)
        }}
      >
        <p className="muted small">A pessoa sai de todos os dispositivos e não consegue voltar a entrar enquanto a conta estiver suspensa.</p>
        <label>
          Motivo
          <input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label>
          Durante quantos dias (vazio = até reativares)
          <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-danger" disabled={busy || !reason.trim()}>
            Suspender
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteDialog({ email, busy, onClose, onSubmit }: { email: string; busy: boolean; onClose: () => void; onSubmit: (email: string) => void }) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === email.toLowerCase()
  return (
    <Modal title="Apagar conta" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (matches) onSubmit(typed.trim())
        }}
      >
        <p>
          Apaga a conta e <strong>todas as páginas</strong> de {email}. Não se pode desfazer.
        </p>
        <label>
          Para confirmar, escreve o email da conta
          <input autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-danger" disabled={busy || !matches}>
            Apagar para sempre
          </button>
        </div>
      </form>
    </Modal>
  )
}

function providerName(id: string): string {
  return ({ credential: 'Email e palavra-passe', google: 'Google', github: 'GitHub' } as Record<string, string>)[id] ?? id
}

function device(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido'
  const app = /Electron|Remind/i.test(ua) ? 'App Remind' : 'Browser'
  const os = /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Linux/i.test(ua) ? 'Linux' : ''
  return os ? `${app} · ${os}` : app
}
