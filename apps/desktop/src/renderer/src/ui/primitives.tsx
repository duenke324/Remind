import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Fecha ao clicar fora ou carregar em Esc. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [ref, onClose])
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  onSelect: () => void
}

/** Menu flutuante ancorado a um elemento (fica dentro do ecrã). */
export function Popover({
  anchor,
  onClose,
  children,
  align = 'start',
  className = ''
}: {
  anchor: HTMLElement
  onClose: () => void
  children: ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useDismiss(ref, onClose)

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect()
    const el = ref.current
    const width = el?.offsetWidth ?? 220
    const height = el?.offsetHeight ?? 200
    let left = align === 'end' ? rect.right - width : rect.left
    let top = rect.bottom + 4
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4)
    setPos({ top, left })
  }, [anchor, align])

  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      role="dialog"
    >
      {children}
    </div>,
    document.body
  )
}

export function Menu({ anchor, items, onClose, align }: { anchor: HTMLElement; items: MenuItem[]; onClose: () => void; align?: 'start' | 'end' }) {
  return (
    <Popover anchor={anchor} onClose={onClose} align={align} className="menu">
      <div role="menu">
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            className={`menu-item${item.danger ? ' danger' : ''}`}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </Popover>
  )
}

/** Janela modal centrada, com fundo escurecido. */
export function Modal({
  onClose,
  children,
  className = '',
  label
}: {
  onClose: () => void
  children: ReactNode
  className?: string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, onClose)
  return createPortal(
    <div className="modal-backdrop">
      <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>,
    document.body
  )
}

/** "há 5 minutos", "ontem", etc. */
export function relativeTime(iso: string, lang: 'pt' | 'en'): string {
  const rtf = new Intl.RelativeTimeFormat(lang === 'pt' ? 'pt-PT' : 'en', { numeric: 'auto' })
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return rtf.format(0, 'minute')
}
