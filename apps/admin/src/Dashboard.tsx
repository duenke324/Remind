import { useEffect, useState } from 'react'
import { admin, type Stats } from './api'
import { ErrorNote } from './ui'

const PRICE_MONTHLY = 2.99

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    admin.stats().then(setStats, (e: Error) => setError(e.message))
  }, [])

  if (error) return <ErrorNote error={error} />
  if (!stats) return <p className="muted">A carregar…</p>

  const proShare = stats.users ? Math.round((stats.pro / stats.users) * 100) : 0
  const cards: { label: string; value: string; hint?: string }[] = [
    { label: 'Contas', value: n(stats.users), hint: `${n(stats.verified)} com email confirmado` },
    { label: 'Novas (7 dias)', value: n(stats.new7d), hint: `${n(stats.new30d)} nos últimos 30 dias` },
    { label: 'Ativas (7 dias)', value: n(stats.active7d), hint: 'abriram a app esta semana' },
    { label: 'Pro', value: n(stats.pro), hint: `${proShare}% das contas` },
    {
      label: 'Receita mensal estimada',
      value: eur(stats.pro * PRICE_MONTHLY),
      hint: 'Pro × 2,99 €; valores reais chegam com o Stripe'
    },
    { label: 'Páginas', value: n(stats.pages), hint: stats.users ? `${(stats.pages / stats.users).toFixed(1)} por conta` : undefined },
    { label: 'Suspensas', value: n(stats.banned) }
  ]

  const max = Math.max(1, ...stats.signupsByWeek.map((w) => w.count))

  return (
    <section>
      <h1>Visão geral</h1>
      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <span className="card-label">{c.label}</span>
            <span className="card-value">{c.value}</span>
            {c.hint && <span className="card-hint">{c.hint}</span>}
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Contas novas por semana</h2>
        {stats.signupsByWeek.length === 0 ? (
          <p className="muted">Ainda sem registos nas últimas 12 semanas.</p>
        ) : (
          <div className="bars" role="img" aria-label="Contas novas por semana nas últimas 12 semanas">
            {stats.signupsByWeek.map((w) => (
              <div className="bar" key={w.week} title={`Semana de ${new Date(w.week).toLocaleDateString('pt-PT')}: ${w.count}`}>
                <span className="bar-value">{w.count}</span>
                <span className="bar-fill" style={{ height: `${(w.count / max) * 100}%` }} />
                <span className="bar-label">{new Date(w.week).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

const n = (v: number) => v.toLocaleString('pt-PT')
const eur = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
