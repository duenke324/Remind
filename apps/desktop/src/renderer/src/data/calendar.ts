import type { ApiResponse } from '../../../shared/types'

// ---------- Tipos (iguais aos do servidor) ----------

export interface CalendarInfo {
  id: string
  name: string
  color: string | null
  primary: boolean
  canEdit: boolean
  /** Plano grátis: só o calendário principal; os outros aparecem bloqueados. */
  locked: boolean
}

export interface CalEvent {
  id: string
  calendarId: string
  title: string
  description: string | null
  location: string | null
  /** Dia inteiro: datas AAAA-MM-DD com fim exclusivo. Com hora: ISO. */
  allDay: boolean
  start: string
  end: string
  color: string | null
  htmlLink: string | null
  recurring: boolean
  canEdit: boolean
}

export interface EventDraft {
  calendarId: string
  title: string
  description: string | null
  location: string | null
  allDay: boolean
  start: string
  end: string
  timeZone?: string
}

export type CalendarView = 'month' | 'week' | 'day'

// ---------- Pedidos ----------

export class CalendarError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string
  ) {
    super(message)
  }
}

async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = (await window.remind.api.request(method, path, body)) as ApiResponse<T & { error?: string; code?: string }>
  if (res.status === 0) throw new CalendarError(0, 'OFFLINE', 'offline')
  if (res.status < 200 || res.status >= 300) {
    throw new CalendarError(res.status, res.data?.code ?? null, res.data?.error ?? `Erro ${res.status}`)
  }
  return res.data as T
}

export const calendarApi = {
  status: () => call<{ connected: boolean; plan: 'free' | 'pro'; allCalendars: boolean }>('GET', '/api/calendar/status'),
  connect: () => call<{ url: string }>('POST', '/api/calendar/connect', {}),
  disconnect: () => call<{ ok: true }>('DELETE', '/api/calendar/connection'),
  events: (from: Date, to: Date) =>
    call<{ events: CalEvent[]; calendars: CalendarInfo[] }>(
      'GET',
      `/api/calendar/events?from=${from.toISOString()}&to=${to.toISOString()}`
    ),
  create: (draft: EventDraft) => call<{ event: CalEvent }>('POST', '/api/calendar/events', draft),
  update: (calendarId: string, eventId: string, draft: EventDraft) =>
    call<{ event: CalEvent }>('PATCH', `/api/calendar/events/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventId)}`, draft),
  remove: (calendarId: string, eventId: string) =>
    call<{ ok: true }>('DELETE', `/api/calendar/events/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventId)}`)
}

// ---------- Datas (hora local; semanas começam à segunda) ----------

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function startOfWeek(d: Date): Date {
  const day = startOfDay(d)
  const offset = (day.getDay() + 6) % 7 // segunda = 0
  return addDays(day, -offset)
}

/** Data local AAAA-MM-DD (sem passar por UTC). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

/** Os dias que cada vista mostra. O mês tem sempre 6 semanas completas. */
export function visibleDays(view: CalendarView, anchor: Date): Date[] {
  if (view === 'day') return [startOfDay(anchor)]
  if (view === 'week') {
    const start = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }
  const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function shift(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  if (view === 'day') return addDays(anchor, direction)
  if (view === 'week') return addDays(anchor, 7 * direction)
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1)
}

/** Início e fim (exclusivo) de um evento, em hora local. */
export function eventBounds(e: Pick<CalEvent, 'allDay' | 'start' | 'end'>): { start: Date; end: Date } {
  if (e.allDay) return { start: parseYmd(e.start), end: parseYmd(e.end) }
  return { start: new Date(e.start), end: new Date(e.end) }
}

/** Eventos que tocam num dia (um evento de vários dias aparece em cada um). */
export function eventsOnDay<T extends Pick<CalEvent, 'allDay' | 'start' | 'end'>>(events: T[], day: Date): T[] {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = addDays(startOfDay(day), 1).getTime()
  return events
    .filter((e) => {
      const { start, end } = eventBounds(e)
      const s = start.getTime()
      // Um evento com hora que acaba exatamente à meia-noite não conta para o dia seguinte.
      const en = Math.max(end.getTime(), s + 1)
      return s < dayEnd && en > dayStart
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || eventBounds(a).start.getTime() - eventBounds(b).start.getTime())
}

/** Posição de um evento com hora na grelha de um dia: topo e altura em minutos, e coluna se houver sobreposições. */
export function layoutDay<T extends Pick<CalEvent, 'allDay' | 'start' | 'end' | 'id'>>(
  events: T[],
  day: Date
): { event: T; top: number; height: number; column: number; columns: number }[] {
  const dayStart = startOfDay(day).getTime()
  const timed = eventsOnDay(events, day).filter((e) => !e.allDay)
  const boxes = timed.map((event) => {
    const { start, end } = eventBounds(event)
    const top = Math.max(0, (start.getTime() - dayStart) / 60_000)
    const bottom = Math.min(1440, (end.getTime() - dayStart) / 60_000)
    return { event, top, height: Math.max(20, bottom - top), column: 0, columns: 1 }
  })
  // Agrupa eventos que se sobrepõem e distribui-os em colunas lado a lado.
  let group: typeof boxes = []
  let groupEnd = -1
  const flush = () => {
    const ends: number[] = []
    for (const box of group) {
      let col = ends.findIndex((endAt) => endAt <= box.top)
      if (col === -1) col = ends.length
      ends[col] = box.top + box.height
      box.column = col
    }
    for (const box of group) box.columns = ends.length
    group = []
  }
  for (const box of boxes.sort((a, b) => a.top - b.top)) {
    if (box.top >= groupEnd) flush()
    group.push(box)
    groupEnd = Math.max(groupEnd, box.top + box.height)
  }
  flush()
  return boxes
}

/** Rascunho para um evento novo: dia inteiro no mês, uma hora a partir da hora escolhida na semana/dia. */
export function newDraft(calendarId: string, day: Date, hour: number | null): EventDraft {
  if (hour === null) return { calendarId, title: '', description: null, location: null, allDay: true, start: ymd(day), end: ymd(addDays(day, 1)) }
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour)
  const end = new Date(start.getTime() + 3_600_000)
  return { calendarId, title: '', description: null, location: null, allDay: false, start: start.toISOString(), end: end.toISOString() }
}
