import { Hono } from 'hono'
import type { Auth } from '../auth'

const STATE = /^[A-Za-z0-9_-]{16,128}$/
const MIN_PASSWORD = 8

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** Página simples, sem JavaScript, para os passos que acontecem no browser. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Remind</title>
<style>
:root{color-scheme:light dark;--bg:#f7f7f5;--card:#fff;--fg:#1f1f1f;--muted:#6b6b6b;--accent:#2f6feb;--border:#e5e5e3}
@media (prefers-color-scheme:dark){:root{--bg:#191919;--card:#232323;--fg:#ececec;--muted:#9b9b9b;--border:#333}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:min(420px,calc(100% - 32px));background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px}
h1{font-size:22px;margin:0 0 8px}p{color:var(--muted);margin:0 0 16px}
label{display:block;font-size:13px;margin:12px 0 4px}
input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;font:inherit}
button,.btn{display:inline-block;margin-top:16px;width:100%;box-sizing:border-box;text-align:center;padding:10px 12px;border:0;border-radius:8px;background:var(--accent);color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.error{color:#d93025}
</style></head><body><main><div style="font-weight:700;margin-bottom:16px">Remind</div>${body}</main></body></html>`
}

export function webRoutes(auth: Auth, baseURL: string) {
  const app = new Hono()

  app.get('/auth/verified', (c) =>
    c.html(page('Email confirmado', '<h1>Email confirmado ✓</h1><p>Já podes voltar à app Remind e entrar na tua conta.</p>'))
  )

  const resetForm = (token: string, error?: string) =>
    page(
      'Nova palavra-passe',
      `<h1>Nova palavra-passe</h1><p>Escolhe uma palavra-passe com pelo menos ${MIN_PASSWORD} caracteres.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/auth/reset-password">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label for="password">Nova palavra-passe</label><input id="password" name="password" type="password" minlength="${MIN_PASSWORD}" autocomplete="new-password" required>
<label for="confirm">Repetir palavra-passe</label><input id="confirm" name="confirm" type="password" minlength="${MIN_PASSWORD}" autocomplete="new-password" required>
<button type="submit">Guardar</button></form>`
    )

  app.get('/auth/reset-password', (c) => {
    const token = c.req.query('token')
    const error = c.req.query('error')
    if (error || !token) {
      return c.html(page('Link inválido', '<h1>Link inválido ou expirado</h1><p>Pede um novo link na app Remind.</p>'), 400)
    }
    return c.html(resetForm(token))
  })

  app.post('/auth/reset-password', async (c) => {
    const form = await c.req.parseBody()
    const token = typeof form.token === 'string' ? form.token : ''
    const password = typeof form.password === 'string' ? form.password : ''
    const confirm = typeof form.confirm === 'string' ? form.confirm : ''
    if (!token) return c.html(page('Link inválido', '<h1>Link inválido</h1>'), 400)
    if (password !== confirm) return c.html(resetForm(token, 'As palavras-passe não coincidem.'), 400)
    if (password.length < MIN_PASSWORD) return c.html(resetForm(token, `Usa pelo menos ${MIN_PASSWORD} caracteres.`), 400)
    try {
      await auth.api.resetPassword({ body: { newPassword: password, token } })
    } catch {
      return c.html(page('Link expirado', '<h1>Link inválido ou expirado</h1><p>Pede um novo link na app Remind.</p>'), 400)
    }
    return c.html(page('Palavra-passe alterada', '<h1>Palavra-passe alterada ✓</h1><p>Volta à app Remind e entra com a nova palavra-passe.</p>'))
  })

  // 2) De volta do Google/GitHub, já com sessão no browser: entregamos um token de uso único à app.
  app.get('/desktop/oauth/complete', async (c) => {
    const state = c.req.query('state') ?? ''
    if (!STATE.test(state)) return c.html(page('Pedido inválido', '<h1>Pedido inválido</h1>'), 400)
    let token: string
    try {
      ;({ token } = await auth.api.generateOneTimeToken({ headers: c.req.raw.headers }))
    } catch {
      return c.html(page('Sessão em falta', '<h1>Não foi possível entrar</h1><p>Volta à app e tenta de novo.</p>'), 401)
    }
    const link = `remind://auth/callback?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`
    c.header('cache-control', 'no-store')
    return c.html(
      page(
        'A voltar ao Remind',
        `<h1>Sessão iniciada ✓</h1><p>Clica no botão para voltar à app Remind. Podes fechar esta janela depois.</p>
<a class="btn" href="${escapeHtml(link)}">Abrir o Remind</a>
<meta http-equiv="refresh" content="0;url=${escapeHtml(link)}">`
      )
    )
  })

  app.get('/desktop/oauth/error', (c) =>
    c.html(page('Erro no login', '<h1>Não foi possível entrar</h1><p>O login foi cancelado ou falhou. Volta à app e tenta de novo.</p>'), 400)
  )

  // 1) (registada depois das rotas fixas acima) A app abre isto no browser do sistema; daqui seguimos para o Google/GitHub.
  app.get('/desktop/oauth/:provider', async (c) => {
    const provider = c.req.param('provider')
    const state = c.req.query('state') ?? ''
    const providers = Object.keys(auth.options.socialProviders ?? {})
    if (!STATE.test(state)) return c.text('Pedido inválido', 400)
    if (!providers.includes(provider)) return c.text('Fornecedor não disponível', 404)

    const res = await auth.api.signInSocial({
      body: {
        provider: provider as 'google' | 'github',
        callbackURL: `${baseURL}/desktop/oauth/complete?state=${state}`,
        errorCallbackURL: `${baseURL}/desktop/oauth/error`
      },
      headers: c.req.raw.headers,
      asResponse: true
    })
    const { url } = (await res.json()) as { url?: string }
    if (!url) return c.text('Não foi possível iniciar o login', 502)
    const redirect = new Response(null, { status: 302, headers: { location: url } })
    for (const cookie of res.headers.getSetCookie()) redirect.headers.append('set-cookie', cookie)
    return redirect
  })

  return app
}
