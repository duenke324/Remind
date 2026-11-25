import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuth } from '../src/auth'
import { FREE_PAGE_LIMIT, promoteAdmins } from '../src/plans'
import { createMemoryMailer } from '../src/mailer'
import { BASE_URL, createHarness } from './helpers/harness'

const h = createHarness()
const email = (name: string) => `${name}-${randomUUID()}@exemplo.pt`
const adminEmail = email('admin')
let admin: ReturnType<typeof h.client>
let adminId: string

async function newUser(name: string) {
  const address = email(name)
  await h.createVerifiedUser(address)
  const http = h.client({ bearer: await h.desktopLogin(address) })
  const id = (await h.pool.query<{ id: string }>('select id from "user" where email = $1', [address])).rows[0]!.id
  return { email: address, http, id }
}

beforeAll(async () => {
  await h.setup()
  await h.createVerifiedUser(adminEmail)
  await promoteAdmins(h.pool, [adminEmail])
  admin = h.client({ bearer: await h.desktopLogin(adminEmail) })
  adminId = (await h.pool.query<{ id: string }>('select id from "user" where email = $1', [adminEmail])).rows[0]!.id
})
afterAll(() => h.pool.end())

describe('acesso ao painel', () => {
  it('as rotas de admin do Better Auth estão fechadas ao exterior (sem "entrar como")', async () => {
    expect((await admin('/api/auth/admin/list-users')).status).toBe(404)
    expect((await admin('/api/auth/admin/impersonate-user', { body: { userId: adminId } })).status).toBe(404)
  })

  it('sem sessão: 401; conta normal: 403; admin: 200', async () => {
    const normal = await newUser('normal')
    expect((await h.client()('/api/admin/stats')).status).toBe(401)
    expect((await normal.http('/api/admin/stats')).status).toBe(403)
    const stats = await admin('/api/admin/stats')
    expect(stats.status).toBe(200)
    expect(stats.json.users).toBeGreaterThanOrEqual(2)
  })

  it('ADMIN_EMAILS: quem se regista com um desses emails fica admin', async () => {
    const address = email('novo-admin')
    const auth = createAuth({
      pool: h.pool,
      mailer: createMemoryMailer(),
      baseURL: BASE_URL,
      secret: 'segredo-de-teste-com-mais-de-32-caracteres!!',
      rateLimit: false,
      adminEmails: [address]
    })
    await auth.api.signUpEmail({ body: { email: address, password: 'palavra-passe-forte-1', name: 'X' } })
    const role = (await h.pool.query<{ role: string }>('select role from "user" where email = $1', [address])).rows[0]?.role
    expect(role).toBe('admin')
  })
})

describe('gerir contas', () => {
  it('procura por email e filtra', async () => {
    const u = await newUser('procurar')
    const found = await admin(`/api/admin/users?q=${encodeURIComponent(u.email)}`)
    expect(found.json.total).toBe(1)
    expect(found.json.users[0]).toMatchObject({ email: u.email, pro: false, pages: 0 })
    const admins = await admin('/api/admin/users?filtro=admins&limit=100')
    expect(admins.json.users.some((x: { email: string }) => x.email === adminEmail)).toBe(true)
  })

  it('dar e tirar Pro muda o plano da conta (e fica no registo)', async () => {
    const u = await newUser('pro')
    expect((await u.http('/api/me')).json).toMatchObject({ plan: 'free', limits: { pages: FREE_PAGE_LIMIT } })
    expect((await admin(`/api/admin/users/${u.id}/plan`, { body: { plan: 'pro', note: 'oferta' } })).status).toBe(200)
    expect((await u.http('/api/me')).json).toMatchObject({ plan: 'pro', limits: { pages: null } })
    await admin(`/api/admin/users/${u.id}/plan`, { body: { plan: 'free' } })
    expect((await u.http('/api/me')).json.plan).toBe('free')

    const detail = await admin(`/api/admin/users/${u.id}`)
    expect(detail.json.history.map((e: { action: string }) => e.action)).toEqual(['tirar-pro', 'dar-pro'])
  })

  it('Pro com data de fim expira sozinho', async () => {
    const u = await newUser('expira')
    await admin(`/api/admin/users/${u.id}/plan`, { body: { plan: 'pro', until: new Date(Date.now() - 1000).toISOString() } })
    expect((await u.http('/api/me')).json.plan).toBe('free')
  })

  it('banir termina as sessões e impede entrar; desbanir volta a deixar', async () => {
    const u = await newUser('banir')
    expect((await u.http('/api/pages')).status).toBe(200)
    expect((await admin(`/api/admin/users/${u.id}/ban`, { body: { reason: 'spam' } })).status).toBe(200)
    expect((await u.http('/api/pages')).status).toBe(401)
    const login = await h.client()('/api/auth/sign-in/email', { body: { email: u.email, password: 'palavra-passe-forte-1' } })
    expect(login.status).toBe(403)

    await admin(`/api/admin/users/${u.id}/unban`, { body: {} })
    const again = await h.client()('/api/auth/sign-in/email', { body: { email: u.email, password: 'palavra-passe-forte-1' } })
    expect(again.status).toBe(200)
  })

  it('um admin não se pode banir, apagar nem tirar o próprio papel', async () => {
    expect((await admin(`/api/admin/users/${adminId}/ban`, { body: { reason: 'x' } })).status).toBe(409)
    expect((await admin(`/api/admin/users/${adminId}/role`, { body: { role: 'user' } })).status).toBe(409)
    expect((await admin(`/api/admin/users/${adminId}`, { method: 'DELETE', body: { confirmEmail: adminEmail } })).status).toBe(409)
  })

  it('apagar exige escrever o email da conta e apaga também as páginas', async () => {
    const u = await newUser('apagar')
    await u.http(`/api/pages/${randomUUID()}`, { method: 'PUT', body: { title: 'x' } })
    expect((await admin(`/api/admin/users/${u.id}`, { method: 'DELETE', body: { confirmEmail: 'outro@x.pt' } })).status).toBe(400)
    expect((await admin(`/api/admin/users/${u.id}`, { method: 'DELETE', body: { confirmEmail: u.email } })).status).toBe(200)
    expect((await h.pool.query('select 1 from page where user_id = $1', [u.id])).rowCount).toBe(0)
    expect((await admin(`/api/admin/users/${u.id}`)).status).toBe(404)
    const log = await admin('/api/admin/audit')
    expect(log.json.entries[0]).toMatchObject({ action: 'apagar-conta', targetEmail: u.email, adminEmail })
  })

  it('dar papel de admin a outra conta', async () => {
    const u = await newUser('promover')
    await admin(`/api/admin/users/${u.id}/role`, { body: { role: 'admin' } })
    expect((await u.http('/api/admin/stats')).status).toBe(200)
  })
})

describe('limite do plano grátis', () => {
  const create = (http: ReturnType<typeof h.client>) => http(`/api/pages/${randomUUID()}`, { method: 'PUT', body: { title: 'p' } })

  it(`grátis: até ${FREE_PAGE_LIMIT} páginas; a seguinte é recusada, editar continua a dar; Pro: sem limite`, async () => {
    const u = await newUser('limite')
    let last = ''
    for (let i = 0; i < FREE_PAGE_LIMIT; i++) {
      const id = randomUUID()
      expect((await u.http(`/api/pages/${id}`, { method: 'PUT', body: { title: `p${i}` } })).status).toBe(200)
      last = id
    }
    const refused = await create(u.http)
    expect(refused.status).toBe(402)
    expect(refused.json.code).toBe('PAGE_LIMIT')
    expect((await u.http(`/api/pages/${last}`, { method: 'PUT', body: { title: 'editada' } })).status).toBe(200)
    expect((await u.http('/api/me')).json.usage.pages).toBe(FREE_PAGE_LIMIT)

    await admin(`/api/admin/users/${u.id}/plan`, { body: { plan: 'pro' } })
    expect((await create(u.http)).status).toBe(200)
  })
})
