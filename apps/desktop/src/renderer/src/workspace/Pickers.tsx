import { useState } from 'react'
import { useI18n } from '../i18n'
import { Popover } from '../ui/primitives'

const EMOJIS = [
  '📄', '📝', '📌', '📎', '📚', '📖', '🗂️', '📁', '🗓️', '📅', '✅', '☑️', '💡', '🎯', '🚀', '⭐',
  '🔥', '❤️', '💼', '🏠', '🧠', '🧩', '🛠️', '⚙️', '🔒', '🔑', '💰', '📈', '📊', '🧾', '🛒', '🎁',
  '🎨', '🎵', '🎬', '📷', '✈️', '🌍', '🏖️', '⛰️', '🌱', '🌸', '☀️', '🌙', '☕', '🍕', '🍎', '🏋️',
  '⚽', '🎮', '🐶', '🐱', '👋', '🙂', '😎', '🤔', '🎓', '🏫', '💻', '📱', '✉️', '💬', '🔔', '❓'
]

export const COVER_PRESETS = ['sunset', 'ocean', 'forest', 'sand', 'lavender', 'graphite', 'rose', 'mint'] as const

/** Estilo CSS de uma capa (predefinida ou imagem https). */
export function coverStyle(cover: string): React.CSSProperties {
  if (cover.startsWith('preset:')) return {}
  return { backgroundImage: `url("${cover.replace(/"/g, '%22')}")` }
}

export function coverClass(cover: string): string {
  return cover.startsWith('preset:') ? `cover-${cover.slice(7)}` : ''
}

export function EmojiPicker({
  anchor,
  onPick,
  onRemove,
  onClose
}: {
  anchor: HTMLElement
  onPick: (emoji: string) => void
  onRemove: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <Popover anchor={anchor} onClose={onClose} className="picker">
      <div className="picker-head">
        <span>{t('ws.addIcon')}</span>
        <button className="link" onClick={onRemove}>
          {t('ws.removeIcon')}
        </button>
      </div>
      <div className="emoji-grid">
        {EMOJIS.map((emoji) => (
          <button key={emoji} className="emoji" onClick={() => onPick(emoji)} aria-label={emoji}>
            {emoji}
          </button>
        ))}
      </div>
    </Popover>
  )
}

export function CoverPicker({
  anchor,
  onPick,
  onRemove,
  onClose
}: {
  anchor: HTMLElement
  onPick: (cover: string) => void
  onRemove: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const valid = /^https:\/\/\S+$/.test(url.trim())
  return (
    <Popover anchor={anchor} onClose={onClose} className="picker" align="end">
      <div className="picker-head">
        <span>{t('ws.changeCover')}</span>
        <button className="link" onClick={onRemove}>
          {t('ws.removeCover')}
        </button>
      </div>
      <div className="cover-grid">
        {COVER_PRESETS.map((preset) => (
          <button key={preset} className={`cover-swatch cover-${preset}`} aria-label={preset} onClick={() => onPick(`preset:${preset}`)} />
        ))}
      </div>
      <form
        className="cover-url"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onPick(url.trim())
        }}
      >
        <input placeholder={t('ws.coverUrl')} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={!valid}>
          {t('ws.apply')}
        </button>
      </form>
    </Popover>
  )
}
