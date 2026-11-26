import { useCallback, useEffect, useState } from 'react'
import { ApiError, billing, type BillingStatus } from '../api'
import { Login } from '../Login'
import { ErrorNote } from '../ui'

export const PRICES = { month: '2,99 €', year: '24 €' }
const APP_LINK = 'remind://pro/ativado'
const SITE = 'https://remind.uno'

/** O que o Pro dá hoje. Só entra aqui o que já funciona. */
export const BENEFITS = [
  { title: 'Páginas ilimitadas', detail: 'No plano grátis são 50.' },
  { title: 'Todos os teus calendários Google', detail: 'No plano grátis, só o principal.' },
  { title: 'Apoias um projeto independente', detail: 'Feito em Portugal, sem anúncios nem venda de dados.' }
]

const fmtDate = (iso: string) => new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))

type State = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'ready'; status: BillingStatus } | { kind: 'error'; message: string }

export function ProPage() {
  // Volta da Stripe: /pro/obrigado?session_id=…
  const thanks = /\/obrigado\/?$/.test(location.pathname) || new URLSearchParams(location.search).has('session_id')
  const [state, setState] = useState<State>({ kind: 'loading' })

  const load = useCallback(async () => {
    try {
      setState({ kind: 'ready', status: await billing.status() })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState({ kind: 'signed-out' })
      else setState({ kind: 'error', message: e instanceof ApiError && e.status === 0 ? 'Sem ligação ao servidor.' : 'Algo correu mal. Recarrega a página.' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (state.kind === 'loading') return <div className="center muted">A carregar…</div>
  if (state.kind === 'error') return <div className="center error">{state.message}</div>
  if (state.kind === 'signed-out') {
    return (
      <Login
        subtitle="Remind Pro"
        onSignedIn={() => void load()}
        footer={
          <p className="muted small">
            Ainda não tens conta?{' '}
            <a href={SITE} data-testid="get-app">
              Descarrega o Remind
            </a>{' '}
            e cria-a na app. Depois volta aqui.
          </p>
        }
      />
    )
  }
  return thanks ? <Thanks initial={state.status} /> : <Plans status={state.status} onSignOut={() => void billing.forget().then(load)} />
}

function Header() {
  return (
    <header className="pro-header">
      <span className="logo" aria-hidden="true">
        R
      </span>
      <strong>Remind</strong>
      <span className="pro-pill">Pro</span>
    </header>
  )
}

function Plans({ status, onSignOut }: { status: BillingStatus; onSignOut: () => void }) {
  const [busy, setBusy] = useState<'month' | 'year' | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const go = async (what: 'month' | 'year' | 'portal') => {
    setBusy(what)
    setError(null)
    try {
      const { url } = what === 'portal' ? await billing.portal() : await billing.checkout(what)
      location.assign(url)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Algo correu mal. Tenta outra vez.')
      setBusy(null)
    }
  }

  const pro = status.plan === 'pro'
  return (
    <div className="pro-page">
      <Header />
      <main className="pro-main">
        {pro ? (
          <section className="pro-active" data-testid="pro-active">
            <h1>Tens o Remind Pro ✓</h1>
            <p className="muted">
              {status.source === 'stripe' && status.expiresAt
                ? `A tua subscrição está ativa. Próxima renovação até ${fmtDate(status.expiresAt)}.`
                : status.expiresAt
                  ? `O teu Pro é válido até ${fmtDate(status.expiresAt)}.`
                  : 'O teu Pro não tem data de fim.'}
            </p>
            <div className="pro-actions">
              <a className="btn btn-primary" href={APP_LINK}>
                Abrir o Remind
              </a>
              {status.canManage && (
                <button className="btn" onClick={() => void go('portal')} disabled={busy !== null} data-testid="manage">
                  {busy === 'portal' ? 'A abrir…' : 'Gerir subscrição'}
                </button>
              )}
            </div>
          </section>
        ) : (
          <>
            <h1>Mais espaço para as tuas ideias</h1>
            <p className="muted pro-lead">O Remind continua grátis. O Pro tira os limites e ajuda o Remind a crescer.</p>
            <ul className="pro-benefits">
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <strong>{b.title}</strong>
                  <span className="muted">{b.detail}</span>
                </li>
              ))}
            </ul>
            {!status.available && (
              <p className="pro-notice" data-testid="unavailable">
                Os pagamentos ainda não estão abertos. Volta daqui a uns dias.
              </p>
            )}
            <div className="pro-plans">
              <article className="pro-plan">
                <h2>Mensal</h2>
                <p className="pro-price">
                  {PRICES.month}
                  <span className="muted"> / mês</span>
                </p>
                <p className="muted small">Cancela quando quiseres.</p>
                <button className="btn" disabled={!status.available || busy !== null} onClick={() => void go('month')} data-testid="buy-month">
                  {busy === 'month' ? 'A abrir o pagamento…' : 'Escolher mensal'}
                </button>
              </article>
              <article className="pro-plan pro-plan-best">
                <span className="pro-save">Poupa 33%</span>
                <h2>Anual</h2>
                <p className="pro-price">
                  {PRICES.year}
                  <span className="muted"> / ano</span>
                </p>
                <p className="muted small">Fica a 2 € por mês.</p>
                <button className="btn btn-primary" disabled={!status.available || busy !== null} onClick={() => void go('year')} data-testid="buy-year">
                  {busy === 'year' ? 'A abrir o pagamento…' : 'Escolher anual'}
                </button>
              </article>
            </div>
            <p className="muted small">O pagamento é feito na Stripe, com cartão, Apple Pay ou Google Pay. O Remind nunca vê os dados do cartão.</p>
          </>
        )}
        <ErrorNote error={error} />
        <p className="muted small pro-account">
          Conta: {status.email} ·{' '}
          <button className="btn-link" onClick={onSignOut} data-testid="sign-out">
            Não és tu? Sair
          </button>
        </p>
      </main>
    </div>
  )
}

/** Depois de pagar: o webhook da Stripe pode demorar uns segundos a ativar o Pro. */
function Thanks({ initial }: { initial: BillingStatus }) {
  const [status, setStatus] = useState(initial)
  const [waited, setWaited] = useState(0)

  useEffect(() => {
    if (status.plan === 'pro' || waited >= 30) return
    const timer = setTimeout(async () => {
      try {
        setStatus(await billing.status())
      } catch {
        /* tenta outra vez */
      }
      setWaited((w) => w + 2)
    }, 2000)
    return () => clearTimeout(timer)
  }, [status, waited])

  const pro = status.plan === 'pro'
  return (
    <div className="pro-page">
      <Header />
      <main className="pro-main pro-thanks" data-testid={pro ? 'thanks-active' : 'thanks-waiting'}>
        {pro ? (
          <>
            <h1>Bem-vindo ao Remind Pro 🎉</h1>
            <p className="muted">O Pro já está ativo na conta {status.email}. Na app, aparece sozinho em segundos.</p>
            <a className="btn btn-primary" href={APP_LINK}>
              Voltar ao Remind
            </a>
          </>
        ) : waited < 30 ? (
          <>
            <h1>A confirmar o pagamento…</h1>
            <p className="muted">Só um momento, estamos a ativar o Pro na tua conta.</p>
          </>
        ) : (
          <>
            <h1>Pagamento recebido</h1>
            <p className="muted">A ativação está a demorar mais do que o normal. Recarrega esta página daqui a um minuto. Se continuar, guarda o recibo que a Stripe te enviou por email e fala connosco em remind.uno.</p>
          </>
        )}
      </main>
    </div>
  )
}
