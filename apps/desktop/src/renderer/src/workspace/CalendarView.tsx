import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  addDays,
  calendarApi,
  CalendarError,
  eventBounds,
  eventsOnDay,
  layoutDay,
  newDraft,
  parseYmd,
  sameDay,
  shift,
  startOfDay,
  visibleDays,
  ymd,
  type CalendarInfo,
  type CalendarView as View,
  type CalEvent,
  type EventDraft
} from '../data/calendar'
import { useI18n } from '../i18n'
import { ChevronIcon, PlusIcon, SidebarIcon } from '../ui/icons'
import { Modal } from '../ui/primitives'
import { useWorkspace } from './context'

const HOUR_PX = 48
const VIEW_KEY = 'remind.calendarView'

type Load =
  | { state: 'loading' }
  | { state: 'disconnected' }
  | { state: 'reconnect' }
  | { state: 'offline' }
  | { state: 'error'; message: string }
  | { state: 'ready'; events: CalEvent[]; calendars: CalendarInfo[] }

export function CalendarView({ sidebarOpen, onExpand }: { sidebarOpen: boolean; onExpand: () => void }) {
  const { t, lang } = useI18n()
  const { plan, openPro } = useWorkspace()
  const locale = lang === 'pt' ? 'pt-PT' : 'en-GB'
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      return v === 'week' || v === 'day' ? v : 'month'
    } catch {
      return 'month'
    }
  })
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ draft: EventDraft; event: CalEvent | null } | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [reload, setReload] = useState(0)

  const days = useMemo(() => visibleDays(view, anchor), [view, anchor])
  const from = days[0]!
  const to = addDays(days[days.length - 1]!, 1)

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      /* só em memória */
    }
  }, [view])

  useEffect(() => {
    let alive = true
    setLoad((l) => (l.state === 'ready' ? l : { state: 'loading' }))
    calendarApi.events(from, to).then(
      (data) => alive && setLoad({ state: 'ready', ...data }),
      (e: unknown) => {
        if (!alive) return
        const code = e instanceof CalendarError ? e.code : null
        if (code === 'CALENDAR_NOT_CONNECTED') setLoad({ state: 'disconnected' })
        else if (code === 'CALENDAR_RECONNECT') setLoad({ state: 'reconnect' })
        else if (code === 'OFFLINE') setLoad({ state: 'offline' })
        else setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    )
    return () => {
      alive = false
    }
    // from/to derivam de view+anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor, reload, plan])

  // Quando a ligação à Google termina no browser, a app recebe remind://calendar/connected.
  useEffect(
    () =>
      window.remind.onDeepLink((link) => {
        if (link.kind === 'calendar-connected') {
          setWaiting(false)
          setReload((n) => n + 1)
        }
      }),
    []
  )

  const connect = useCallback(async () => {
    try {
      const { url } = await calendarApi.connect()
      setWaiting(true)
      await window.remind.openExternal(url)
    } catch (e) {
      setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const refresh = () => setReload((n) => n + 1)
  const ready = load.state === 'ready' ? load : null
  const calendars = ready?.calendars ?? []
  const events = (ready?.events ?? []).filter((e) => !hidden.has(e.calendarId))
  const writable = calendars.filter((c) => c.canEdit && !c.locked)
  const primary = writable.find((c) => c.primary) ?? writable[0]

  const openNew = (day: Date, hour: number | null) => {
    if (!primary) return
    setEditing({ draft: newDraft(primary.id, day, hour), event: null })
  }
  const openEvent = (event: CalEvent) =>
    setEditing({
      event,
      draft: {
        calendarId: event.calendarId,
        title: event.title,
        description: event.description,
        location: event.location,
        allDay: event.allDay,
        start: event.start,
        end: event.end
      }
    })

  const title =
    view === 'day'
      ? anchor.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${from.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  return (
    <div className="calendar" data-testid="calendar">
      <header className="cal-header">
        {!sidebarOpen && (
          <button className="icon-btn" title={t('ws.expand')} aria-label={t('ws.expand')} onClick={onExpand}>
            <SidebarIcon />
          </button>
        )}
        <h1 className="cal-title">{title.charAt(0).toUpperCase() + title.slice(1)}</h1>
        <div className="cal-nav">
          <button className="btn" onClick={() => setAnchor(startOfDay(new Date()))}>
            {t('cal.today')}
          </button>
          <button className="icon-btn" aria-label={t('cal.previous')} onClick={() => setAnchor(shift(view, anchor, -1))}>
            <ChevronIcon className="flip" />
          </button>
          <button className="icon-btn" aria-label={t('cal.next')} onClick={() => setAnchor(shift(view, anchor, 1))}>
            <ChevronIcon />
          </button>
        </div>
        <div className="cal-views" role="tablist" aria-label={t('cal.title')}>
          {(['month', 'week', 'day'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={`chip${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
              {t(`cal.${v}`)}
            </button>
          ))}
        </div>
        {ready && primary && (
          <button className="btn btn-primary" onClick={() => openNew(view === 'month' ? anchor : anchor, view === 'month' ? null : 9)} data-testid="cal-new">
            <PlusIcon size={14} /> {t('cal.newEvent')}
          </button>
        )}
      </header>

      {ready && calendars.length > 1 && (
        <div className="cal-filters" aria-label={t('cal.calendars')}>
          {calendars.map((c) => (
            <label key={c.id} className={`cal-filter${c.locked ? ' locked' : ''}`} title={c.locked ? t('cal.proLocked') : undefined}>
              <input
                type="checkbox"
                disabled={c.locked}
                checked={!c.locked && !hidden.has(c.id)}
                onChange={() =>
                  setHidden((prev) => {
                    const next = new Set(prev)
                    if (next.has(c.id)) next.delete(c.id)
                    else next.add(c.id)
                    return next
                  })
                }
              />
              <span className="dot" style={{ background: c.color ?? 'var(--accent)' }} />
              {c.name}
              {c.locked && (
                <button type="button" className="pro-badge pro-badge-btn" onClick={openPro} title={t('pro.upgrade')} data-testid="cal-go-pro">
                  Pro
                </button>
              )}
            </label>
          ))}
        </div>
      )}

      {ready && (
        <div className="cal-footer">
          <button
            className="btn btn-link small"
            onClick={() => {
              if (window.confirm(t('cal.disconnectConfirm'))) void calendarApi.disconnect().then(refresh, refresh)
            }}
          >
            {t('cal.disconnect')}
          </button>
        </div>
      )}

      {load.state === 'loading' && <p className="cal-message muted">{t('cal.loading')}</p>}
      {load.state === 'offline' && <p className="cal-message muted">{t('cal.offline')}</p>}
      {load.state === 'error' && (
        <p className="cal-message error" role="alert">
          {load.message}
        </p>
      )}
      {(load.state === 'disconnected' || load.state === 'reconnect') && (
        <div className="cal-connect">
          <h2>{t('cal.connectTitle')}</h2>
          <p className="muted">{load.state === 'reconnect' ? t('cal.reconnect') : t('cal.connectText')}</p>
          <button className="btn btn-primary" onClick={() => void connect()} data-testid="cal-connect">
            {t('cal.connect')}
          </button>
          {waiting && <p className="muted small">{t('cal.connecting')}</p>}
        </div>
      )}

      {ready &&
        (view === 'month' ? (
          <MonthGrid days={days} anchor={anchor} events={events} locale={locale} onDay={(d) => openNew(d, null)} onEvent={openEvent} onOpenDay={(d) => (setAnchor(d), setView('day'))} />
        ) : (
          <TimeGrid days={days} events={events} locale={locale} onSlot={openNew} onEvent={openEvent} />
        ))}

      {editing && ready && (
        <EventModal
          draft={editing.draft}
          event={editing.event}
          calendars={calendars}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function EventChip({ event, onClick }: { event: CalEvent; onClick: () => void }) {
  const { lang } = useI18n()
  const time = event.allDay ? '' : new Date(event.start).toLocaleTimeString(lang === 'pt' ? 'pt-PT' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <button
      className={`cal-chip${event.allDay ? ' all-day' : ''}`}
      style={{ ['--event-color' as string]: event.color ?? 'var(--accent)' }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={event.title}
    >
      {time && <span className="cal-time">{time}</span>}
      <span className="cal-chip-title">{event.title}</span>
    </button>
  )
}

function MonthGrid({
  days,
  anchor,
  events,
  locale,
  onDay,
  onEvent,
  onOpenDay
}: {
  days: Date[]
  anchor: Date
  events: CalEvent[]
  locale: string
  onDay: (d: Date) => void
  onEvent: (e: CalEvent) => void
  onOpenDay: (d: Date) => void
}) {
  const { t } = useI18n()
  const today = new Date()
  return (
    <div className="cal-month">
      {days.slice(0, 7).map((d) => (
        <div key={`h${ymd(d)}`} className="cal-weekday">
          {d.toLocaleDateString(locale, { weekday: 'short' })}
        </div>
      ))}
      {days.map((d) => {
        const list = eventsOnDay(events, d)
        const shown = list.slice(0, 3)
        return (
          <div
            key={ymd(d)}
            className={`cal-cell${d.getMonth() !== anchor.getMonth() ? ' other-month' : ''}${sameDay(d, today) ? ' today' : ''}`}
            onClick={() => onDay(d)}
            data-date={ymd(d)}
          >
            <button className="cal-daynum" onClick={(e) => (e.stopPropagation(), onOpenDay(d))}>
              {d.getDate()}
            </button>
            {shown.map((e) => (
              <EventChip key={`${e.calendarId}:${e.id}`} event={e} onClick={() => onEvent(e)} />
            ))}
            {list.length > shown.length && (
              <button className="cal-more" onClick={(e) => (e.stopPropagation(), onOpenDay(d))}>
                {t('cal.more', { count: String(list.length - shown.length) })}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TimeGrid({
  days,
  events,
  locale,
  onSlot,
  onEvent
}: {
  days: Date[]
  events: CalEvent[]
  locale: string
  onSlot: (d: Date, hour: number | null) => void
  onEvent: (e: CalEvent) => void
}) {
  const { t } = useI18n()
  const scroller = useRef<HTMLDivElement>(null)
  const today = new Date()
  useEffect(() => {
    scroller.current?.scrollTo({ top: 7.5 * HOUR_PX })
  }, [])
  const cols = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }
  return (
    <div className="cal-time-grid">
      <div className="cal-time-head" style={cols}>
        <div />
        {days.map((d) => (
          <div key={ymd(d)} className={`cal-col-head${sameDay(d, today) ? ' today' : ''}`}>
            <span>{d.toLocaleDateString(locale, { weekday: 'short' })}</span>
            <strong>{d.getDate()}</strong>
          </div>
        ))}
        <div className="cal-allday-label muted small">{t('cal.allDay')}</div>
        {days.map((d) => (
          <div key={`a${ymd(d)}`} className="cal-allday" onClick={() => onSlot(d, null)}>
            {eventsOnDay(events, d)
              .filter((e) => e.allDay)
              .map((e) => (
                <EventChip key={`${e.calendarId}:${e.id}`} event={e} onClick={() => onEvent(e)} />
              ))}
          </div>
        ))}
      </div>
      <div className="cal-time-body" ref={scroller}>
        <div className="cal-time-inner" style={{ ...cols, height: 24 * HOUR_PX }}>
          <div className="cal-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="cal-hour-label" style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={ymd(d)} className="cal-day-col">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="cal-slot" style={{ top: h * HOUR_PX, height: HOUR_PX }} onClick={() => onSlot(d, h)} />
              ))}
              {sameDay(d, today) && <div className="cal-now" style={{ top: ((today.getHours() * 60 + today.getMinutes()) / 60) * HOUR_PX }} />}
              {layoutDay(events, d).map(({ event, top, height, column, columns }) => (
                <button
                  key={`${event.calendarId}:${event.id}`}
                  className="cal-block"
                  style={{
                    top: (top / 60) * HOUR_PX,
                    height: Math.max(18, (height / 60) * HOUR_PX - 2),
                    left: `calc(${(column / columns) * 100}% + 2px)`,
                    width: `calc(${100 / columns}% - 4px)`,
                    ['--event-color' as string]: event.color ?? 'var(--accent)'
                  }}
                  onClick={() => onEvent(event)}
                  title={event.title}
                >
                  <strong>{event.title}</strong>
                  <span>
                    {eventBounds(event).start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {eventBounds(event).end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Converte entre os valores dos campos (data/hora locais) e o formato da API. */
function toFields(d: EventDraft) {
  if (d.allDay) return { startDate: d.start, endDate: ymd(addDays(parseYmd(d.end), -1)), startTime: '09:00', endTime: '10:00' }
  const s = new Date(d.start)
  const e = new Date(d.end)
  const hm = (x: Date) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
  return { startDate: ymd(s), endDate: ymd(e), startTime: hm(s), endTime: hm(e) }
}

function EventModal({
  draft,
  event,
  calendars,
  onClose,
  onSaved
}: {
  draft: EventDraft
  event: CalEvent | null
  calendars: CalendarInfo[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const readOnly = event !== null && !event.canEdit
  const initial = toFields(draft)
  const [title, setTitle] = useState(draft.title)
  const [allDay, setAllDay] = useState(draft.allDay)
  const [startDate, setStartDate] = useState(initial.startDate)
  const [endDate, setEndDate] = useState(initial.endDate)
  const [startTime, setStartTime] = useState(initial.startTime)
  const [endTime, setEndTime] = useState(initial.endTime)
  const [calendarId, setCalendarId] = useState(draft.calendarId)
  const [location, setLocation] = useState(draft.location ?? '')
  const [description, setDescription] = useState(draft.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const writable = calendars.filter((c) => c.canEdit && !c.locked)

  const build = (): EventDraft | null => {
    if (allDay) {
      if (endDate < startDate) return null
      return { calendarId, title: title.trim(), description: description.trim() || null, location: location.trim() || null, allDay: true, start: startDate, end: ymd(addDays(parseYmd(endDate), 1)) }
    }
    const s = new Date(`${startDate}T${startTime}`)
    const e = new Date(`${endDate}T${endTime}`)
    if (!(e > s)) return null
    return {
      calendarId,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      allDay: false,
      start: s.toISOString(),
      end: e.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved()
    } catch (e) {
      setError(e instanceof CalendarError && e.code === 'PRO_REQUIRED' ? t('cal.proLocked') : e instanceof Error ? e.message : t('cal.error'))
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = build()
    if (!next) return setError(t('cal.badDates'))
    void run(() => (event ? calendarApi.update(event.calendarId, event.id, next) : calendarApi.create(next)))
  }

  return (
    <Modal onClose={onClose} label={event ? t('cal.editEvent') : t('cal.newEvent')} className="cal-modal">
      <form onSubmit={submit} className="cal-form">
        <input
          className="cal-form-title"
          placeholder={t('cal.form.title')}
          aria-label={t('cal.form.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          readOnly={readOnly}
          required
          autoFocus={!readOnly}
          maxLength={1024}
        />
        <label className="cal-check">
          <input type="checkbox" checked={allDay} disabled={readOnly} onChange={(e) => setAllDay(e.target.checked)} />
          {t('cal.allDay')}
        </label>
        <div className="cal-form-row">
          <label>
            {t('cal.form.start')}
            <input type="date" value={startDate} readOnly={readOnly} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          {!allDay && (
            <label>
              &nbsp;
              <input type="time" value={startTime} readOnly={readOnly} onChange={(e) => setStartTime(e.target.value)} required />
            </label>
          )}
        </div>
        <div className="cal-form-row">
          <label>
            {t('cal.form.end')}
            <input type="date" value={endDate} readOnly={readOnly} onChange={(e) => setEndDate(e.target.value)} required />
          </label>
          {!allDay && (
            <label>
              &nbsp;
              <input type="time" value={endTime} readOnly={readOnly} onChange={(e) => setEndTime(e.target.value)} required />
            </label>
          )}
        </div>
        {!readOnly && writable.length > 1 && !event && (
          <label>
            {t('cal.form.calendar')}
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t('cal.form.location')}
          <input value={location} readOnly={readOnly} onChange={(e) => setLocation(e.target.value)} maxLength={1024} />
        </label>
        <label>
          {t('cal.form.description')}
          <textarea value={description} readOnly={readOnly} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={8000} />
        </label>
        {event?.recurring && !readOnly && <p className="muted small">{t('cal.recurring')}</p>}
        {readOnly && <p className="muted small">{t('cal.readOnly')}</p>}
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {event?.htmlLink && (
            <button type="button" className="btn btn-link" onClick={() => void window.remind.openExternal(event.htmlLink!)}>
              {t('cal.openGoogle')}
            </button>
          )}
          {event && !readOnly && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => (confirmDelete ? void run(() => calendarApi.remove(event.calendarId, event.id)) : setConfirmDelete(true))}
            >
              {confirmDelete ? t('cal.confirmDelete') : t('cal.delete')}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            {t('cal.cancel')}
          </button>
          {!readOnly && (
            <button className="btn btn-primary" disabled={busy || !title.trim()}>
              {t('cal.save')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
