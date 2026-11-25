import { useEffect, useState } from 'react'
import { admin, type AuditEntry } from './api'
import { ACTION_LABELS, ErrorNote, fmtDateTime } from './ui'

/** Registo de tudo o que os admins fizeram (só leitura). */
export function Audit({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    admin.audit().then((r) => setEntries(r.entries), (e: Error) => setError(e.message))
  }, [])

  if (error) return <ErrorNote error={error} />
  if (!entries) return <p className="muted">A carregar…</p>

  return (
    <section>
      <h1>Registo de ações</h1>
      <p className="muted">As últimas 200 ações feitas por admins. Não se pode apagar.</p>
      {entries.length === 0 ? (
        <p className="muted">Ainda não há ações registadas.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Admin</th>
                <th>Ação</th>
                <th>Conta</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="nowrap">{fmtDateTime(e.createdAt)}</td>
                  <td>{e.adminEmail}</td>
                  <td>{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td>
                    {e.targetId && e.action !== 'apagar-conta' ? (
                      <button className="btn btn-link" onClick={() => onOpenUser(e.targetId!)}>
                        {e.targetEmail}
                      </button>
                    ) : (
                      e.targetEmail ?? '—'
                    )}
                  </td>
                  <td className="muted small">{describe(e.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function describe(details: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof details.reason === 'string') parts.push(`motivo: ${details.reason}`)
  if (typeof details.days === 'number') parts.push(`${details.days} dias`)
  if (typeof details.until === 'string') parts.push(`até ${new Date(details.until).toLocaleDateString('pt-PT')}`)
  if (typeof details.note === 'string') parts.push(details.note)
  if (typeof details.to === 'string') parts.push(`${details.from} → ${details.to}`)
  return parts.join(' · ')
}
