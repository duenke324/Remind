import { useEffect, useRef, type ReactNode } from 'react'

const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const rel = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' })

export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—')
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—')

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'agora'
  if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day')
  return fmtDate(iso)
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export const ACTION_LABELS: Record<string, string> = {
  'dar-pro': 'Deu Pro',
  'tirar-pro': 'Tirou Pro',
  banir: 'Suspendeu a conta',
  desbanir: 'Reativou a conta',
  'terminar-sessoes': 'Terminou as sessões',
  'mudar-papel': 'Mudou o papel',
  'apagar-conta': 'Apagou a conta'
}

export function Badge({ tone, children }: { tone: 'pro' | 'admin' | 'danger' | 'muted' | 'ok'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

/** Janela modal acessível: fecha com Esc e com clique fora; o foco vai para o primeiro campo. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="error" role="alert">
      {error}
    </p>
  )
}
