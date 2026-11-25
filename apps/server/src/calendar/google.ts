// Cliente mínimo da Google Calendar API v3 (só o que o Remind usa).
// O `fetch` é injetável para os testes simularem a Google.

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
]

export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export type Fetch = typeof fetch

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export interface Calendar {
  id: string
  name: string
  color: string | null
  primary: boolean
  /** owner/writer podem criar e editar; reader/freeBusyReader só ver. */
  canEdit: boolean
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  description: string | null
  location: string | null
  /** Dia inteiro: datas AAAA-MM-DD (fim exclusivo, como na Google). Com hora: ISO com fuso. */
  allDay: boolean
  start: string
  end: string
  color: string | null
  htmlLink: string | null
  recurring: boolean
}

export interface EventInput {
  title: string
  description?: string | null
  location?: string | null
  allDay: boolean
  start: string
  end: string
  timeZone?: string
}

interface GoogleCalendarListEntry {
  id: string
  summary?: string
  summaryOverride?: string
  backgroundColor?: string
  primary?: boolean
  accessRole?: string
  hidden?: boolean
}

interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  htmlLink?: string
  recurringEventId?: string
  colorId?: string
}

export function createGoogleCalendar(accessToken: string, fetchImpl: Fetch = fetch, apiBase: string = GOOGLE_CALENDAR_API) {
  async function call<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
    const url = new URL(`${apiBase}${path}`)
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)
    let res: Response
    try {
      res = await fetchImpl(url, {
        method: init.method ?? 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' })
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body)
      })
    } catch {
      throw new GoogleError(502, 'Sem ligação à Google')
    }
    if (res.status === 204) return undefined as T
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    if (!res.ok) throw new GoogleError(res.status, data?.error?.message ?? `Google: ${res.status}`)
    return data as T
  }

  const toEvent = (calendarId: string, e: GoogleEvent): CalendarEvent | null => {
    if (e.status === 'cancelled' || !e.start || !e.end) return null
    const allDay = Boolean(e.start.date)
    return {
      id: e.id,
      calendarId,
      title: e.summary ?? '(sem título)',
      description: e.description ?? null,
      location: e.location ?? null,
      allDay,
      start: (allDay ? e.start.date : e.start.dateTime) ?? '',
      end: (allDay ? e.end.date : e.end.dateTime) ?? '',
      color: null,
      htmlLink: e.htmlLink ?? null,
      recurring: Boolean(e.recurringEventId)
    }
  }

  const toBody = (input: EventInput) => ({
    summary: input.title,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    start: input.allDay ? { date: input.start } : { dateTime: input.start, timeZone: input.timeZone },
    end: input.allDay ? { date: input.end } : { dateTime: input.end, timeZone: input.timeZone }
  })

  const enc = encodeURIComponent

  return {
    async calendars(): Promise<Calendar[]> {
      const items: GoogleCalendarListEntry[] = []
      let pageToken: string | undefined
      do {
        const data = await call<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>('/users/me/calendarList', {
          query: { maxResults: '250', ...(pageToken ? { pageToken } : {}) }
        })
        items.push(...(data.items ?? []))
        pageToken = data.nextPageToken
      } while (pageToken)
      return items
        .filter((c) => !c.hidden)
        .map((c) => ({
          id: c.id,
          name: c.summaryOverride ?? c.summary ?? c.id,
          color: c.backgroundColor ?? null,
          primary: Boolean(c.primary),
          canEdit: c.accessRole === 'owner' || c.accessRole === 'writer'
        }))
        .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, 'pt'))
    },

    /** Eventos entre `from` e `to` (ISO), com as repetições já desdobradas. */
    async events(calendarId: string, from: string, to: string): Promise<CalendarEvent[]> {
      const out: CalendarEvent[] = []
      let pageToken: string | undefined
      do {
        const data = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(`/calendars/${enc(calendarId)}/events`, {
          query: { timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', ...(pageToken ? { pageToken } : {}) }
        })
        for (const e of data.items ?? []) {
          const event = toEvent(calendarId, e)
          if (event) out.push(event)
        }
        pageToken = data.nextPageToken
      } while (pageToken && out.length < 5000)
      return out
    },

    async create(calendarId: string, input: EventInput): Promise<CalendarEvent> {
      const e = await call<GoogleEvent>(`/calendars/${enc(calendarId)}/events`, { method: 'POST', body: toBody(input) })
      return toEvent(calendarId, e)!
    },

    async update(calendarId: string, eventId: string, input: EventInput): Promise<CalendarEvent> {
      const e = await call<GoogleEvent>(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'PATCH', body: toBody(input) })
      return toEvent(calendarId, e)!
    },

    async remove(calendarId: string, eventId: string): Promise<void> {
      await call(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'DELETE' })
    }
  }
}
