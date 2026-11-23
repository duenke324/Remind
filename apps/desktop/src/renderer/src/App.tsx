import { useEffect, useState } from 'react'
import type { AppInfo } from '../../preload'

export function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.remind.getInfo().then(setInfo)
  }, [])

  return (
    <main className="welcome">
      <h1 data-testid="app-title">Remind</h1>
      <p>Páginas feitas de blocos. Em construção.</p>
      {info && (
        <p className="meta" data-testid="app-version">
          v{info.version} · {info.platform}
        </p>
      )}
    </main>
  )
}
