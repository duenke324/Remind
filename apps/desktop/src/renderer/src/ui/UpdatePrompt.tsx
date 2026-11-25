import { useEffect, useState } from 'react'
import type { UpdateInfo } from '../../../shared/update'
import { useI18n } from '../i18n'
import { Modal } from './primitives'

const SNOOZE_MS = 24 * 60 * 60 * 1000
const snoozeKey = (version: string) => `remind:update-snooze:${version}`

function snoozed(version: string): boolean {
  try {
    return Date.now() < Number(localStorage.getItem(snoozeKey(version)) ?? 0)
  } catch {
    return false
  }
}

function snooze(version: string): void {
  try {
    localStorage.setItem(snoozeKey(version), String(Date.now() + SNOOZE_MS))
  } catch {
    // Sem armazenamento: o aviso volta na próxima verificação.
  }
}

/** Anuncia uma atualização a toda a app (o botão das Definições também usa isto). */
export function announceUpdate(update: UpdateInfo): void {
  window.dispatchEvent(new CustomEvent<UpdateInfo>('remind:update', { detail: update }))
}

/** Pop-up "Há uma versão nova" — aparece quando a app encontra uma versão mais recente. */
export function UpdatePrompt({ current, platform }: { current: string; platform: string }) {
  const { t } = useI18n()
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    const show = (u: UpdateInfo | null) => {
      if (u && !snoozed(u.version)) setUpdate(u)
    }
    const offMain = window.remind.updates.onAvailable(show)
    void window.remind.updates.pending().then(show)
    // Pedido manual (Definições → Procurar atualizações): mostra sempre, mesmo que tenha sido adiado.
    const onManual = (e: Event) => setUpdate((e as CustomEvent<UpdateInfo>).detail)
    window.addEventListener('remind:update', onManual)
    return () => {
      offMain()
      window.removeEventListener('remind:update', onManual)
    }
  }, [])

  if (!update) return null
  const later = () => {
    snooze(update.version)
    setUpdate(null)
  }
  const how = platform === 'win32' ? t('upd.howWin') : platform === 'darwin' ? t('upd.howMac') : t('upd.howOther')

  return (
    <Modal onClose={later} className="update-modal" label={t('upd.title')}>
      <div className="update-badge">v{update.version}</div>
      <h2>{t('upd.title')}</h2>
      <p>{t('upd.body', { version: update.version, current })}</p>
      <p className="muted">{how}</p>
      <div className="modal-actions">
        <button className="btn btn-outline update-notes" onClick={() => void window.remind.openExternal(update.releaseUrl)}>
          {t('upd.whatsNew')}
        </button>
        <button className="btn btn-outline" onClick={later} data-testid="update-later">
          {t('upd.later')}
        </button>
        <button
          className="btn btn-primary"
          data-testid="update-now"
          onClick={() => {
            void window.remind.openExternal(update.downloadUrl)
            setUpdate(null)
          }}
        >
          {t('upd.now')}
        </button>
      </div>
    </Modal>
  )
}
