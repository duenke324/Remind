import { describe, expect, it } from 'vitest'
import { isAllowedApiRequest } from '../../src/shared/api-paths'

describe('pedidos permitidos ao servidor', () => {
  it.each([
    ['GET', '/api/pages'],
    ['GET', '/api/pages?since=42'],
    ['PUT', '/api/pages/abc-123'],
    ['DELETE', '/api/pages/abc_123'],
    ['GET', '/api/me'],
    ['GET', '/api/calendar/status'],
    ['GET', '/api/calendar/calendars'],
    ['POST', '/api/calendar/connect'],
    ['DELETE', '/api/calendar/connection'],
    ['GET', '/api/calendar/events?from=2026-11-30T00:00:00.000Z&to=2027-01-11T00:00:00.000Z'],
    ['GET', '/api/calendar/events?from=2026-11-30T00:00:00Z&to=2027-01-11T00:00:00Z&calendars=eu%40gmail.com,x%40group.calendar.google.com'],
    ['POST', '/api/calendar/events'],
    ['PATCH', '/api/calendar/events/eu%40gmail.com/abc123_def'],
    ['DELETE', '/api/calendar/events/eu%40gmail.com/abc123']
  ])('%s %s', (method, path) => {
    expect(isAllowedApiRequest(method, path)).toBe(true)
  })

  it.each([
    ['POST', '/api/pages'],
    ['GET', '/api/admin/users'],
    ['POST', '/api/auth/sign-out'],
    ['GET', '/api/pages/../admin'],
    ['GET', '/api/calendar/events?from=ontem&to=hoje'],
    ['GET', '/api/calendar/events?from=2026-11-30T00:00:00%2B00:00&to=2027-01-11T00:00:00Z'],
    ['PATCH', '/api/calendar/events/a/b/c'],
    ['DELETE', '/api/calendar/events/eu@gmail.com/x?y=1'],
    ['PUT', '/api/calendar/events'],
    ['GET', 'https://evil.example/api/me'],
    [42, '/api/me'],
    ['GET', null]
  ])('recusa %s %s', (method, path) => {
    expect(isAllowedApiRequest(method, path)).toBe(false)
  })
})
