import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Lang } from './i18n'

export type ThemePref = 'system' | 'light' | 'dark'

interface Settings {
  theme: ThemePref
  lang: Lang
}

const KEY = 'remind.settings'

function load(): Settings {
  const fallbackLang: Lang = navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en'
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    return {
      theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system',
      lang: raw.lang === 'pt' || raw.lang === 'en' ? raw.lang : fallbackLang
    }
  } catch {
    return { theme: 'system', lang: fallbackLang }
  }
}

const SettingsContext = createContext<{
  settings: Settings
  resolvedTheme: 'light' | 'dark'
  update: (patch: Partial<Settings>) => void
} | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(load)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  const resolvedTheme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.lang = settings.lang === 'pt' ? 'pt-PT' : 'en'
  }, [resolvedTheme, settings.lang])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* armazenamento indisponível: fica só em memória */
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ settings, resolvedTheme, update }), [settings, resolvedTheme, update])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('SettingsProvider em falta')
  return value
}
