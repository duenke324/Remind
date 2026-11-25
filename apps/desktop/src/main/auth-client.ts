import { isAllowedApiRequest } from '../shared/api-paths'
import { randomBytes } from 'node:crypto'
import type { ApiResponse, AuthResult, AuthState, SignInResult, SocialProvider, User } from '../shared/types'
import { clearSession, loadSession, saveSession } from './session-store'

const SOCIAL_STATE_TTL_MS = 10 * 60 * 1000

interface HttpResult {
  status: number
  json: Record<string, unknown> | null
  headers: Headers
}

/**
 * Fala com o servidor de contas a partir do processo principal.
 * Os cookies do passo do código OTP ficam só aqui; no fim guardamos apenas o token bearer.
 */
export class AuthClient {
  private jar = new Map<string, string>()
  private socialState: { value: string; expiresAt: number } | null = null
  private session = loadSession()

  constructor(
    readonly serverUrl: string,
    private readonly openExternal: (url: string) => Promise<void>,
    /** App instalada (não em desenvolvimento). */
    private readonly packaged = false
  ) {}

  private async http(path: string, init: { method?: string; body?: unknown; bearer?: boolean } = {}): Promise<HttpResult> {
    const headers = new Headers({ origin: this.serverUrl, accept: 'application/json' })
    if (init.body !== undefined) headers.set('content-type', 'application/json')
    if (this.jar.size) headers.set('cookie', [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '))
    if (init.bearer && this.session) headers.set('authorization', `Bearer ${this.session.token}`)
    const res = await fetch(`${this.serverUrl}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'manual'
    })
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const index = pair?.indexOf('=') ?? -1
      if (!pair || index < 1) continue
      const name = pair.slice(0, index)
      const value = pair.slice(index + 1)
      if (!value || /max-age=0/i.test(cookie)) this.jar.delete(name)
      else this.jar.set(name, value)
    }
    let json: Record<string, unknown> | null = null
    try {
      json = (await res.json()) as Record<string, unknown> | null
    } catch {
      /* resposta sem JSON */
    }
    return { status: res.status, json, headers: res.headers }
  }

  private static failure(res: HttpResult): { ok: false; code: string; message?: string } {
    const code = typeof res.json?.code === 'string' ? res.json.code : `HTTP_${res.status}`
    const message = typeof res.json?.message === 'string' ? res.json.message : undefined
    return { ok: false, code, message }
  }

  private async guard<T>(run: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> {
    try {
      return await run()
    } catch {
      // Uma app instalada a apontar para o servidor local foi gerada sem endereço de servidor.
      const unconfigured = this.packaged && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(`${this.serverUrl}/`)
      return { ok: false, code: unconfigured ? 'NO_SERVER' : 'NETWORK' }
    }
  }

  private finish(res: HttpResult): AuthResult {
    const token = res.headers.get('set-auth-token')
    const user = (res.json?.user ?? null) as User | null
    if (!token || !user) return AuthClient.failure(res)
    this.session = { token, user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null } }
    saveSession(this.session)
    this.jar.clear()
    return { ok: true }
  }

  async providers(): Promise<SocialProvider[]> {
    try {
      const res = await this.http('/api/config')
      const list = Array.isArray(res.json?.providers) ? (res.json.providers as string[]) : []
      return list.filter((p): p is SocialProvider => p === 'google' || p === 'github')
    } catch {
      return []
    }
  }

  signUp(input: { name: string; email: string; password: string }): Promise<AuthResult> {
    return this.guard(async () => {
      const res = await this.http('/api/auth/sign-up/email', {
        body: { ...input, callbackURL: `${this.serverUrl}/auth/verified` }
      })
      return res.status === 200 ? { ok: true } : AuthClient.failure(res)
    })
  }

  signIn(input: { email: string; password: string }): Promise<SignInResult> {
    return this.guard(async () => {
      this.jar.clear()
      const res = await this.http('/api/auth/sign-in/email', {
        body: { ...input, callbackURL: `${this.serverUrl}/auth/verified` }
      })
      if (res.status !== 200) return AuthClient.failure(res)
      if (res.json?.twoFactorRedirect) {
        const sent = await this.http('/api/auth/two-factor/send-otp', { body: {} })
        return sent.status === 200 ? { ok: true, next: 'otp' as const } : AuthClient.failure(sent)
      }
      const done = this.finish(res)
      return done.ok ? { ok: true, next: 'done' as const } : done
    })
  }

  resendOtp(): Promise<AuthResult> {
    return this.guard(async () => {
      const res = await this.http('/api/auth/two-factor/send-otp', { body: {} })
      return res.status === 200 ? { ok: true } : AuthClient.failure(res)
    })
  }

  verifyOtp(code: string): Promise<AuthResult> {
    return this.guard(async () => {
      const res = await this.http('/api/auth/two-factor/verify-otp', { body: { code } })
      return res.status === 200 ? this.finish(res) : AuthClient.failure(res)
    })
  }

  resendVerification(email: string): Promise<AuthResult> {
    return this.guard(async () => {
      const res = await this.http('/api/auth/send-verification-email', {
        body: { email, callbackURL: `${this.serverUrl}/auth/verified` }
      })
      return res.status === 200 ? { ok: true } : AuthClient.failure(res)
    })
  }

  requestPasswordReset(email: string): Promise<AuthResult> {
    return this.guard(async () => {
      const res = await this.http('/api/auth/request-password-reset', {
        body: { email, redirectTo: `${this.serverUrl}/auth/reset-password` }
      })
      return res.status === 200 ? { ok: true } : AuthClient.failure(res)
    })
  }

  /** Abre o browser no Google/GitHub. O resultado chega mais tarde por remind://auth/callback. */
  async startSocial(provider: SocialProvider): Promise<AuthResult> {
    const value = randomBytes(24).toString('base64url')
    this.socialState = { value, expiresAt: Date.now() + SOCIAL_STATE_TTL_MS }
    await this.openExternal(`${this.serverUrl}/desktop/oauth/${provider}?state=${value}`)
    return { ok: true }
  }

  completeSocial(params: Record<string, string>): Promise<AuthResult> {
    return this.guard(async () => {
      const expected = this.socialState
      this.socialState = null
      // Só aceitamos o retorno de um login que esta app iniciou (impede que um link alheio nos faça entrar noutra conta).
      if (!expected || expected.expiresAt < Date.now() || params.state !== expected.value || !params.token) {
        return { ok: false, code: 'INVALID_STATE' }
      }
      this.jar.clear()
      const res = await this.http('/api/auth/one-time-token/verify', { body: { token: params.token } })
      return res.status === 200 ? this.finish(res) : AuthClient.failure(res)
    })
  }

  /** Estado atual. Sem rede, confia na sessão guardada (a app funciona offline). */
  async state(): Promise<AuthState> {
    if (!this.session) return { status: 'signed-out' }
    try {
      const res = await this.http('/api/auth/get-session', { bearer: true })
      const user = res.json?.user as User | undefined
      if (res.status === 200 && user) {
        this.session = { ...this.session, user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null } }
        saveSession(this.session)
        return { status: 'signed-in', user: this.session.user }
      }
      if (res.status === 200 || res.status === 401) {
        this.forget()
        return { status: 'signed-out' }
      }
      return { status: 'signed-in', user: this.session.user, offline: true }
    } catch {
      return { status: 'signed-in', user: this.session.user, offline: true }
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.session) await this.http('/api/auth/sign-out', { body: {}, bearer: true })
    } catch {
      /* sem rede: termina localmente na mesma */
    }
    this.forget()
  }

  private forget(): void {
    this.session = null
    this.jar.clear()
    clearSession()
  }

  get userId(): string | null {
    return this.session?.user.id ?? null
  }

  /** Pedidos à API de páginas com o token da sessão. Só caminhos /api/pages são permitidos. */
  async api(method: string, path: string, body?: unknown): Promise<ApiResponse> {
    if (!isAllowedApiRequest(method, path)) return { status: 400, data: null }
    if (!this.session) return { status: 401, data: null }
    try {
      const res = await this.http(path, { method, body, bearer: true })
      if (res.status === 401) this.forget()
      return { status: res.status, data: res.json }
    } catch {
      return { status: 0, data: null }
    }
  }
}
