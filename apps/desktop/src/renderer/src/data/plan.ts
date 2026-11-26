import { useCallback, useEffect, useState } from 'react'
import type { ApiResponse } from '../../../shared/types'

export interface Me {
  plan: 'free' | 'pro'
  role: string
  limits: { pages: number | null }
  usage: { pages: number }
}

/** O plano da conta (Grátis/Pro). Atualiza ao abrir, ao voltar à janela e quando o pagamento termina. */
export function usePlan(): { me: Me | null; refresh: () => void } {
  const [me, setMe] = useState<Me | null>(null)

  const refresh = useCallback(() => {
    void (window.remind.api.request('GET', '/api/me') as Promise<ApiResponse<Me>>).then((res) => {
      if (res.status === 200 && res.data) setMe(res.data)
    })
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    const offLink = window.remind.onDeepLink((link) => link.kind === 'pro-activated' && refresh())
    return () => {
      window.removeEventListener('focus', refresh)
      offLink()
    }
  }, [refresh])

  return { me, refresh }
}

/**
 * Abre a página do Remind Pro no browser, já com a sessão desta app (link de uso único).
 * A compra é sempre feita no site, com a Stripe.
 */
export async function openProPage(): Promise<boolean> {
  const res = (await window.remind.api.request('POST', '/api/billing/link', {})) as ApiResponse<{ url?: string }>
  const url = res.status === 200 ? res.data?.url : undefined
  if (!url) return false
  await window.remind.openExternal(url)
  return true
}
