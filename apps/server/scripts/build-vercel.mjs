// Gera o servidor no formato de saída da Vercel (Build Output API v3): uma função Node com tudo
// empacotado num só ficheiro. Assim não dependemos de como a Vercel compila TypeScript.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
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

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains'
}

writeFileSync(
  join(output, 'config.json'),
  JSON.stringify({ version: 3, routes: [{ src: '/(.*)', headers: securityHeaders, continue: true }, { src: '/(.*)', dest: '/index' }] }, null, 2)
)

console.info('Servidor gerado em .vercel/output')
