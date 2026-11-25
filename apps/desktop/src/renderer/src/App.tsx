import { useCallback, useEffect, useState } from 'react'
import type { AuthState } from '../../shared/types'
import type { AppInfo } from '../../preload'
import { AuthScreen } from './auth/AuthScreen'
import { I18nProvider } from './i18n'
import { SettingsProvider, useSettings } from './settings'
import { Logo } from './ui/Logo'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { Workspace } from './workspace/Workspace'

function Root() {
  const { settings } = useSettings()
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)

  const refresh = useCallback(() => {
    void window.remind.auth.state().then(setAuth)
  }, [])

  useEffect(() => {
    void window.remind.getInfo().then(setInfo)
    refresh()
    return window.remind.auth.onChanged(refresh)
  }, [refresh])

  return (
    <I18nProvider lang={settings.lang}>
      {!auth || !info ? (
        <div className="splash" data-testid="splash">
          <Logo size={48} />
        </div>
      ) : auth.status === 'signed-out' ? (
        <AuthScreen />
      ) : (
        <Workspace key={auth.user.id} user={auth.user} offline={Boolean(auth.offline)} version={info.version} serverUrl={info.serverUrl} />
      )}
      {info && <UpdatePrompt current={info.version} platform={info.platform} />}
      {info && (
        <span className="app-version" data-testid="app-version" hidden>
          v{info.version}
        </span>
      )}
    </I18nProvider>
  )
}

export function App() {
  return (
    <SettingsProvider>
      <Root />
    </SettingsProvider>
  )
}
