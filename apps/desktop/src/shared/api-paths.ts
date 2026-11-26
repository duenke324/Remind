/**
 * Pedidos que a interface da app pode fazer ao servidor através do processo principal.
 * Tudo o resto é recusado: mesmo que a interface fosse comprometida, não chegava a outras rotas.
 */
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const ID = '[A-Za-z0-9_-]{1,64}'
// A app manda sempre as datas em UTC (toISOString), por isso só se aceita o "Z".
const ISO = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z'
const ENC = '[A-Za-z0-9%._~-]{1,320}'
const EVENT = '[A-Za-z0-9_-]{1,1024}'

const RULES: { methods: ApiMethod[]; path: RegExp }[] = [
  { methods: ['GET'], path: new RegExp(`^/api/pages(\\?since=\\d{1,19})?$`) },
  { methods: ['PUT', 'DELETE'], path: new RegExp(`^/api/pages/${ID}$`) },
  { methods: ['GET'], path: /^\/api\/me$/ },
  { methods: ['POST'], path: /^\/api\/billing\/link$/ },
  { methods: ['GET'], path: /^\/api\/calendar\/(status|calendars)$/ },
  { methods: ['POST'], path: /^\/api\/calendar\/connect$/ },
  { methods: ['DELETE'], path: /^\/api\/calendar\/connection$/ },
  {
    methods: ['GET'],
    path: new RegExp(`^/api/calendar/events\\?from=${ISO}&to=${ISO}(&calendars=[A-Za-z0-9%._~,-]{1,4000})?$`)
  },
  { methods: ['POST'], path: /^\/api\/calendar\/events$/ },
  { methods: ['PATCH', 'DELETE'], path: new RegExp(`^/api/calendar/events/${ENC}/${EVENT}$`) }
]

export function isAllowedApiRequest(method: unknown, path: unknown): method is ApiMethod {
  if (typeof method !== 'string' || typeof path !== 'string' || path.length > 4500) return false
  return RULES.some((r) => r.methods.includes(method as ApiMethod) && r.path.test(path))
}
