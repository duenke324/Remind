// Gera o servidor no formato de saída da Vercel (Build Output API v3): uma função Node com tudo
// empacotado num só ficheiro. Assim não dependemos de como a Vercel compila TypeScript.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, '.vercel/output')
const fn = join(output, 'functions/index.func')

rmSync(output, { recursive: true, force: true })
mkdirSync(fn, { recursive: true })

await build({
  entryPoints: [join(root, 'src/vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: false,
  sourcemap: false,
  // pg-native é opcional (o pg usa a versão em JavaScript).
  external: ['pg-native'],
  // Algumas dependências ainda usam require().
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning'
})

writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      maxDuration: 30,
      // Dublin: ao lado da base de dados (Supabase eu-west-1, Irlanda).
      regions: ['dub1']
    },
    null,
    2
  )
)

// Painel de admin (apps/admin): ficheiros estáticos servidos pela mesma origem que a API, em /admin
// e na raiz de admin.remind.uno. Assim a sessão viaja num cookie sem CORS nem cookies partilhados.
const adminDir = join(root, '../admin')
if (existsSync(join(adminDir, 'package.json'))) {
  execSync('npm run build', { cwd: adminDir, stdio: 'inherit' })
  cpSync(join(adminDir, 'dist'), join(output, 'static/admin'), { recursive: true })
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains'
}

// Domínios onde a raiz é o painel de admin.
const ADMIN_HOSTS = ['admin.remind.uno', 'admin-remind.pt']
// O painel só carrega ficheiros próprios e só fala com a própria origem.
const adminHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow'
}

writeFileSync(
  join(output, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/(.*)', headers: securityHeaders, continue: true },
        { src: '^/admin(?:/.*)?$', headers: adminHeaders, continue: true },
        ...ADMIN_HOSTS.map((host) => ({ src: '^/(?!api/).*$', has: [{ type: 'host', value: host }], headers: adminHeaders, continue: true })),
        { handle: 'filesystem' },
        // Nos domínios do painel, tudo o que não é /api é o painel.
        ...ADMIN_HOSTS.map((host) => ({ src: '^/(?!api/)(?!admin/).*$', has: [{ type: 'host', value: host }], dest: '/admin/index.html' })),
        { src: '^/admin(?:/.*)?$', dest: '/admin/index.html' },
        { src: '/(.*)', dest: '/index' }
      ]
    },
    null,
    2
  )
)

console.info('Servidor gerado em .vercel/output')
