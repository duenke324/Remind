import { useState, type FormEvent } from 'react'
import { ApiError, auth } from './api'
import { ErrorNote } from './ui'

/** Entrar no painel: email + palavra-passe e depois o código de 6 dígitos enviado por email. */
export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<'password' | 'otp'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof ApiError ? message(e) : 'Algo correu mal. Tenta outra vez.')
    } finally {
      setBusy(false)
    }
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const next = await auth.signIn(email.trim(), password)
      if (next === 'otp') setStep('otp')
      else onSignedIn()
    })
  }

  const submitCode = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await auth.verifyOtp(code.trim())
      onSignedIn()
    })
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={step === 'password' ? submitPassword : submitCode}>
        <div className="brand">
          <span className="logo" aria-hidden="true">
            R
          </span>
          <div>
            <strong>Remind</strong>
            <span className="muted">Painel de administração</span>
          </div>
        </div>

        {step === 'password' ? (
          <>
            <label>
              Email
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Palavra-passe
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'A entrar…' : 'Entrar'}
            </button>
          </>
        ) : (
          <>
            <p className="muted">Enviámos um código de 6 dígitos para {email}. Expira em 10 minutos.</p>
            <label>
              Código
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <button className="btn btn-primary" disabled={busy || code.length !== 6}>
              {busy ? 'A verificar…' : 'Verificar'}
            </button>
            <button
              type="button"
              className="btn btn-link"
              disabled={busy}
              onClick={() => void run(async () => (await auth.resendOtp(), setInfo('Enviámos um código novo.')))}
            >
              Enviar novo código
            </button>
          </>
        )}
        <ErrorNote error={error} />
        {info && <p className="muted">{info}</p>}
      </form>
    </div>
  )
}

function message(e: ApiError): string {
  if (e.status === 0) return 'Sem ligação ao servidor.'
  if (e.status === 401) return 'Email, palavra-passe ou código errados.'
  if (e.status === 403) return e.message || 'Esta conta não pode entrar.'
  if (e.status === 429) return 'Demasiadas tentativas. Espera um minuto.'
  return e.message
}
