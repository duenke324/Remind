import { describe, expect, it } from 'vitest'
import { eventsOnDay, layoutDay, newDraft, shift, startOfWeek, visibleDays, ymd } from '../../src/renderer/src/data/calendar'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)
const timed = (id: string, start: Date, end: Date) => ({ id, allDay: false, start: start.toISOString(), end: end.toISOString() })
const allDay = (id: string, start: string, end: string) => ({ id, allDay: true, start, end })

describe('datas do calendário', () => {
  it('a semana começa à segunda', () => {
    expect(ymd(startOfWeek(at(2026, 11, 25)))).toBe('2026-11-23') // quarta → segunda
    expect(ymd(startOfWeek(at(2026, 11, 29)))).toBe('2026-11-23') // domingo → segunda anterior
  })

  it('o mês mostra 6 semanas completas a começar à segunda', () => {
    const days = visibleDays('month', at(2026, 12, 15))
    expect(days).toHaveLength(42)
    expect(ymd(days[0]!)).toBe('2026-11-30')
    expect(days.some((d) => ymd(d) === '2026-12-31')).toBe(true)
    expect(visibleDays('week', at(2026, 12, 3)).map(ymd)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'])
  })

  it('avançar e recuar', () => {
    expect(ymd(shift('month', at(2026, 1, 31), 1))).toBe('2026-02-01')
    expect(ymd(shift('week', at(2026, 12, 3), -1))).toBe('2026-11-26')
    expect(ymd(shift('day', at(2026, 12, 31), 1))).toBe('2027-01-01')
  })

  it('eventos de dia inteiro usam o fim exclusivo da Google; eventos de vários dias aparecem em cada dia', () => {
    const events = [allDay('ferias', '2026-12-24', '2026-12-27'), timed('noite', at(2026, 12, 1, 22), at(2026, 12, 2, 2)), timed('meia-noite', at(2026, 12, 3, 23), at(2026, 12, 4, 0))]
    expect(eventsOnDay(events, at(2026, 12, 26)).map((e) => e.id)).toEqual(['ferias'])
    expect(eventsOnDay(events, at(2026, 12, 27)).map((e) => e.id)).toEqual([])
    expect(eventsOnDay(events, at(2026, 12, 2)).map((e) => e.id)).toEqual(['noite'])
    expect(eventsOnDay(events, at(2026, 12, 4)).map((e) => e.id)).toEqual([])
  })

  it('eventos sobrepostos ficam lado a lado', () => {
    const day = at(2026, 12, 1)
    const boxes = layoutDay(
      [timed('a', at(2026, 12, 1, 9), at(2026, 12, 1, 11)), timed('b', at(2026, 12, 1, 10), at(2026, 12, 1, 12)), timed('c', at(2026, 12, 1, 14), at(2026, 12, 1, 15))],
      day
    )
    const by = Object.fromEntries(boxes.map((b) => [b.event.id, b]))
    expect(by.a).toMatchObject({ top: 540, height: 120, column: 0, columns: 2 })
    expect(by.b).toMatchObject({ top: 600, column: 1, columns: 2 })
    expect(by.c).toMatchObject({ top: 840, column: 0, columns: 1 })
  })

  it('rascunho de evento novo', () => {
    expect(newDraft('primary', at(2026, 12, 1), null)).toMatchObject({ allDay: true, start: '2026-12-01', end: '2026-12-02' })
    const d = newDraft('primary', at(2026, 12, 1), 9)
    expect(new Date(d.start).getHours()).toBe(9)
    expect(new Date(d.end).getTime() - new Date(d.start).getTime()).toBe(3_600_000)
  })
})
