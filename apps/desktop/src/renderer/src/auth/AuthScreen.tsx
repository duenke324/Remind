import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { SocialProvider } from '../../../shared/types'
import { errorMessage, useI18n } from '../i18n'
import { Logo } from '../ui/Logo'

type Mode = 'sign-in' | 'sign-up' | 'otp' | 'check-email' | 'forgot' | 'social-wait'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export function AuthScreen() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [providers, setProviders] = useState<SocialProvider[]>([])
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.remind.auth.providers().then(setProviders)
    return window.remind.auth.onSocialResult((result) => {
      if (!result.ok) {
        setMode('sign-in')
        setError(errorMessage(t, result.code))
      }
    })
  }, [t])

  useEffect(() => {
    if (mode === 'otp') codeRef.current?.focus()
  }, [mode])

  const go = (next: Mode) => {
    setError(null)
    setNotice(null)
    setMode(next)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const onSignIn = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const result = await window.remind.auth.signIn({ email: email.trim(), password })
      if (!result.ok) {
        setError(errorMessage(t, result.code))
        if (result.code === 'EMAIL_NOT_VERIFIED') setMode('check-email')
        return
      }
      if (result.next === 'otp') {
        setCode('')
        setMode('otp')
      }
    })
  }

  const onSignUp = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const result = await window.remind.auth.signUp({ name: name.trim(), email: email.trim(), password })
      if (!result.ok) return setError(errorMessage(t, result.code))
      setPassword('')
      setMode('check-email')
    })
  }

  const onVerify = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const result = await window.remind.auth.verifyOtp(code.replace(/\D/g, ''))
      if (!result.ok) {
        setError(errorMessage(t, result.code))
        setCode('')
        codeRef.current?.focus()
      }
    })
  }

  const onForgot = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const result = await window.remind.auth.requestPasswordReset(email.trim())
      if (!result.ok) return setError(errorMessage(t, result.code))
      setNotice(t('auth.forgotSent'))
    })
  }

  const social = (provider: SocialProvider) =>
    void run(async () => {
      const result = await window.remind.auth.startSocial(provider)
      if (!result.ok) return setError(errorMessage(t, result.code))
      setMode('social-wait')
    })

  const feedback = (
    <>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      )}
    </>
  )

  const socialButtons =
    providers.length > 0 ? (
      <>
        <div className="auth-social">
          {providers.includes('google') && (
            <button type="button" className="btn btn-outline" onClick={() => social('google')} disabled={busy}>
              <GoogleIcon /> {t('auth.continueGoogle')}
            </button>
          )}
          {providers.includes('github') && (
            <button type="button" className="btn btn-outline" onClick={() => social('github')} disabled={busy}>
              <GithubIcon /> {t('auth.continueGithub')}
            </button>
          )}
        </div>
        <div className="auth-divider">
          <span>{t('auth.or')}</span>
        </div>
      </>
    ) : null

  return (
    <div className="auth-screen">
      <div className="auth-drag" />
      <main className="auth-card">
        <Logo size={40} />

        {mode === 'sign-in' && (
          <>
            <h1>{t('auth.signInTitle')}</h1>
            <p className="auth-sub">{t('auth.subtitle')}</p>
            {socialButtons}
            <form onSubmit={onSignIn} className="auth-form">
              <label htmlFor="email">{t('auth.email')}</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              <label htmlFor="password">{t('auth.password')}</label>
              <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              {feedback}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {t('auth.signIn')}
              </button>
            </form>
            <button type="button" className="link" onClick={() => go('forgot')}>
              {t('auth.forgot')}
            </button>
            <p className="auth-switch">
              {t('auth.noAccount')}{' '}
              <button type="button" className="link" onClick={() => go('sign-up')}>
                {t('auth.signUp')}
              </button>
            </p>
          </>
        )}

        {mode === 'sign-up' && (
          <>
            <h1>{t('auth.signUpTitle')}</h1>
            <p className="auth-sub">{t('auth.subtitle')}</p>
            {socialButtons}
            <form onSubmit={onSignUp} className="auth-form">
              <label htmlFor="name">{t('auth.name')}</label>
              <input id="name" autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <label htmlFor="email">{t('auth.email')}</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <label htmlFor="password">{t('auth.password')}</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder={t('auth.passwordHint')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {feedback}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {t('auth.signUp')}
              </button>
            </form>
            <p className="auth-switch">
              {t('auth.haveAccount')}{' '}
              <button type="button" className="link" onClick={() => go('sign-in')}>
                {t('auth.signIn')}
              </button>
            </p>
          </>
        )}

        {mode === 'otp' && (
          <>
            <h1>{t('auth.otpTitle')}</h1>
            <p className="auth-sub">{t('auth.otpText', { email })}</p>
            <form onSubmit={onVerify} className="auth-form">
              <label htmlFor="code">{t('auth.otpCode')}</label>
              <input
                id="code"
                ref={codeRef}
                className="otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              {feedback}
              <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
                {t('auth.verify')}
              </button>
            </form>
            <div className="auth-row">
              <button type="button" className="link" onClick={() => go('sign-in')}>
                {t('auth.back')}
              </button>
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await window.remind.auth.resendOtp()
                    if (r.ok) setNotice(t('auth.codeResent'))
                    else setError(errorMessage(t, r.code))
                  })
                }
              >
                {t('auth.resendCode')}
              </button>
            </div>
          </>
        )}

        {mode === 'check-email' && (
          <>
            <h1>{t('auth.checkEmailTitle')}</h1>
            <p className="auth-sub">{t('auth.checkEmailText', { email })}</p>
            {feedback}
            <button type="button" className="btn btn-primary" onClick={() => go('sign-in')}>
              {t('auth.goToSignIn')}
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await window.remind.auth.resendVerification(email.trim())
                  if (r.ok) setNotice(t('auth.emailResent'))
                  else setError(errorMessage(t, r.code))
                })
              }
            >
              {t('auth.resendEmail')}
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <h1>{t('auth.forgotTitle')}</h1>
            <p className="auth-sub">{t('auth.forgotText')}</p>
            <form onSubmit={onForgot} className="auth-form">
              <label htmlFor="email">{t('auth.email')}</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              {feedback}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {t('auth.sendLink')}
              </button>
            </form>
            <button type="button" className="link" onClick={() => go('sign-in')}>
              {t('auth.back')}
            </button>
          </>
        )}

        {mode === 'social-wait' && (
          <>
            <div className="spinner" aria-hidden="true" />
            <p className="auth-sub">{t('auth.socialWaiting')}</p>
            <button type="button" className="link" onClick={() => go('sign-in')}>
              {t('auth.cancel')}
            </button>
          </>
        )}
      </main>
    </div>
  )
}
