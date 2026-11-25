import nodemailer from 'nodemailer'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
  /** Confirma que o servidor de email aceita as credenciais (sem enviar nada). */
  verify?(): Promise<void>
}

/** Código curto do erro (ex.: EAUTH), sem mensagens que possam conter dados da conta. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code
  return typeof code === 'string' && /^[A-Z_]{2,32}$/.test(code) ? code : 'DESCONHECIDO'
}

/** Código de resposta SMTP (ex.: 535), que não contém dados da conta. */
function responseCode(error: unknown): string {
  const code = (error as { responseCode?: unknown })?.responseCode
  return typeof code === 'number' && Number.isInteger(code) ? ` ${code}` : ''
}

/** Quanto tempo uma falha fica guardada antes de se testar outra vez (um sucesso fica para sempre). */
export const RETRY_AFTER_MS = 60_000

const checks = new WeakMap<Mailer, { result: Promise<string>; failedAt?: number }>()

/** Testa a ligação ao email: "ok" ou "erro: <código>". Não faz login no servidor de email a cada pedido. */
export function checkMailer(mailer: Mailer, now: () => number = Date.now): Promise<string> {
  const cached = checks.get(mailer)
  if (cached && (cached.failedAt === undefined || now() - cached.failedAt < RETRY_AFTER_MS)) return cached.result
  const entry: { result: Promise<string>; failedAt?: number } = { result: Promise.resolve('ok') }
  entry.result = mailer.verify
    ? mailer.verify().then(
        () => 'ok',
        (error) => {
          entry.failedAt = now()
          console.error('[email] O servidor de email recusou a ligação:', errorCode(error), (error as Error)?.message)
          return `erro: ${errorCode(error)}${responseCode(error)}`
        }
      )
    : Promise.resolve('ok')
  checks.set(mailer, entry)
  return entry.result
}

/** Gmail (ou outro SMTP). Com o Gmail usa-se uma "password de app", nunca a palavra-passe da conta. */
export function createSmtpMailer(config: { host: string; port: number; user: string; pass: string; from: string }): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    // Na porta 587 a ligação começa sem cifra e passa a TLS (STARTTLS): obrigamos essa passagem,
    // para a chave nunca seguir em claro se alguém no caminho tentar impedir o TLS.
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass }
  })
  return {
    async send(mail) {
      try {
        await transport.sendMail({ from: config.from, ...mail })
      } catch (error) {
        // O Better Auth apanha este erro e responde 200 na mesma: sem este registo a falha seria invisível.
        console.error('[email] Falha a enviar email:', errorCode(error), (error as Error)?.message)
        throw error
      }
    },
    async verify() {
      await transport.verify()
    }
  }
}

/** Para testes e desenvolvimento: guarda os emails em memória e, opcionalmente, mostra-os no terminal. */
export function createMemoryMailer(options: { log?: boolean } = {}): Mailer & { sent: Mail[] } {
  const sent: Mail[] = []
  return {
    sent,
    async send(mail) {
      sent.push(mail)
      if (options.log) console.info(`\n[email para ${mail.to}] ${mail.subject}\n${mail.text}\n`)
    }
  }
}
