import type { Mail } from './mailer'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="pt-PT"><body style="font-family:system-ui,sans-serif;background:#f7f7f5;padding:24px">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:8px;padding:24px;color:#1f1f1f">
<h1 style="font-size:20px;margin-top:0">${escapeHtml(title)}</h1>${body}
<p style="color:#888;font-size:12px;margin-top:24px">Se não foste tu, ignora este email.</p></div></body></html>`
}

export function verificationEmail(to: string, url: string): Mail {
  return {
    to,
    subject: 'Confirma o teu email no Remind',
    text: `Olá! Abre este link para confirmar o teu email no Remind:\n${url}\n\nSe não foste tu, ignora este email.`,
    html: layout(
      'Confirma o teu email',
      `<p>Clica no botão para confirmar o teu email no Remind.</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#2f6feb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Confirmar email</a></p>`
    )
  }
}

export function otpEmail(to: string, code: string, minutes: number): Mail {
  return {
    to,
    subject: `${code} é o teu código de acesso ao Remind`,
    text: `O teu código de acesso ao Remind é ${code}.\nExpira em ${minutes} minutos. Nunca partilhes este código.`,
    html: layout(
      'Código de acesso',
      `<p>Usa este código para entrar no Remind:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:700">${escapeHtml(code)}</p>
<p>Expira em ${minutes} minutos. Nunca partilhes este código.</p>`
    )
  }
}

export function resetPasswordEmail(to: string, url: string): Mail {
  return {
    to,
    subject: 'Redefinir a palavra-passe do Remind',
    text: `Pediste para redefinir a palavra-passe do Remind. Abre este link (válido 1 hora):\n${url}`,
    html: layout(
      'Redefinir palavra-passe',
      `<p>Pediste para redefinir a palavra-passe. O link é válido durante 1 hora.</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#2f6feb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Escolher nova palavra-passe</a></p>`
    )
  }
}
