// Pedidos ao servidor do Remind. O painel é servido pela mesma origem que a API, por isso a sessão
// viaja num cookie (httpOnly) e nunca passa pelo JavaScript.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    })
  } catch {
    throw new ApiError(0, 'Sem ligação ao servidor')
  }
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* resposta sem JSON */
  }
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && ('error' in data || 'message' in data)
        ? String((data as { error?: unknown; message?: unknown }).error ?? (data as { message?: unknown }).message)
        : '') || `Erro ${res.status}`
    throw new ApiError(res.status, message)
  }
  return data as T
}

// ---------- Sessão ----------

export interface AdminInfo {
  id: string
  email: string
}

export const auth = {
  /** Passo 1: email + palavra-passe. As contas Remind têm sempre verificação em dois passos. */
  async signIn(email: string, password: string): Promise<'otp' | 'done'> {
    const data = await call<{ twoFactorRedirect?: boolean }>('/api/auth/sign-in/email', { body: { email, password } })
    if (data?.twoFactorRedirect) {
      await call('/api/auth/two-factor/send-otp', { body: {} })
      return 'otp'
    }
    return 'done'
  },
  /** Passo 2: código de 6 dígitos enviado por email. */
  verifyOtp: (code: string) => call('/api/auth/two-factor/verify-otp', { body: { code } }),
  resendOtp: () => call('/api/auth/two-factor/send-otp', { body: {} }),
  signOut: () => call('/api/auth/sign-out', { body: {} }),
  /** Quem está ligado, se for admin. 401 = sem sessão, 403 = sessão sem papel de admin. */
  me: () => call<{ admin: AdminInfo }>('/api/admin/me')
}

// ---------- Remind Pro (página /pro) ----------

export interface BillingStatus {
  email: string
  plan: 'free' | 'pro'
  source: 'manual' | 'stripe' | null
  expiresAt: string | null
  /** Os pagamentos estão configurados no servidor. */
  available: boolean
  /** Tem cliente na Stripe (pode abrir o portal). */
  canManage: boolean
}

export const billing = {
  status: () => call<BillingStatus>('/api/billing/status'),
  checkout: (interval: 'month' | 'year') => call<{ url: string }>('/api/billing/checkout', { body: { interval } }),
  portal: () => call<{ url: string }>('/api/billing/portal', { body: {} }),
  /** Sai só neste browser (a sessão pode ser a mesma da app, que continua ligada). */
  forget: () => call('/pro/sair', { body: {} })
}

// ---------- Painel ----------

export interface Stats {
  users: number
  verified: number
  new7d: number
  new30d: number
  banned: number
  pro: number
  pages: number
  active7d: number
  signupsByWeek: { week: string; count: number }[]
}

export type Filter = 'todos' | 'pro' | 'gratis' | 'banidos' | 'por-verificar' | 'admins'

export interface UserRow {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string | null
  banned: boolean | null
  createdAt: string
  pro: boolean
  pages: number
  lastSeenAt: string | null
}

export interface UserDetail {
  user: UserRow & { image: string | null; banReason: string | null; banExpires: string | null; updatedAt: string }
  plan: 'free' | 'pro'
  entitlement: { plan: string; source: 'manual' | 'stripe'; expiresAt: string | null; note: string | null; createdAt: string } | null
  pages: { total: number; trashed: number; bytes: number }
  sessions: { id: string; createdAt: string; updatedAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null }[]
  providers: string[]
  history: { adminEmail: string; action: string; details: Record<string, unknown>; createdAt: string }[]
}

export interface AuditEntry {
  adminEmail: string
  targetEmail: string | null
  targetId: string | null
  action: string
  details: Record<string, unknown>
  createdAt: string
}

export const admin = {
  stats: () => call<Stats>('/api/admin/stats'),
  users: (params: { q?: string; filtro?: Filter; offset?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
    return call<{ total: number; users: UserRow[] }>(`/api/admin/users?${qs}`)
  },
  user: (id: string) => call<UserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),
  setPlan: (id: string, plan: 'pro' | 'free', until?: string | null, note?: string) =>
    call(`/api/admin/users/${encodeURIComponent(id)}/plan`, { body: { plan, until: until ?? null, ...(note ? { note } : {}) } }),
  ban: (id: string, reason: string, days: number | null) => call(`/api/admin/users/${encodeURIComponent(id)}/ban`, { body: { reason, days } }),
  unban: (id: string) => call(`/api/admin/users/${encodeURIComponent(id)}/unban`, { body: {} }),
  revokeSessions: (id: string) => call(`/api/admin/users/${encodeURIComponent(id)}/revoke-sessions`, { body: {} }),
  setRole: (id: string, role: 'admin' | 'user') => call(`/api/admin/users/${encodeURIComponent(id)}/role`, { body: { role } }),
  remove: (id: string, confirmEmail: string) => call(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', body: { confirmEmail } }),
  audit: () => call<{ entries: AuditEntry[] }>('/api/admin/audit')
}
