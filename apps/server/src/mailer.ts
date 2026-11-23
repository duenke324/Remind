import nodemailer from 'nodemailer'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Gmail (ou outro SMTP). Com o Gmail usa-se uma "password de app", nunca a palavra-passe da conta. */
export function createSmtpMailer(config: { host: string; port: number; user: string; pass: string; from: string }): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass }
  })
  return {
    async send(mail) {
      await transport.sendMail({ from: config.from, ...mail })
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
