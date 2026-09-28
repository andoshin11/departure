import { describe, expect, it } from 'vitest'
import { calendarCandidates, departureMinutes, nextDate, toServiceMoment } from '#server/utils/service-day'

/** JST の壁時計時刻から Date を作る */
function jst(iso: string): Date {
  return new Date(`${iso}+09:00`)
}

describe('toServiceMoment', () => {
  it('日中はその日の運行日・経過分', () => {
    expect(toServiceMoment(jst('2026-09-28T12:34:00'))).toEqual({ date: '2026-09-28', minutes: 12 * 60 + 34 })
  })

  it('03:00 より前の深夜帯は前日の運行日の 24 時台以降として扱う', () => {
    expect(toServiceMoment(jst('2026-09-29T00:30:00'))).toEqual({ date: '2026-09-28', minutes: 24 * 60 + 30 })
    expect(toServiceMoment(jst('2026-09-29T02:59:00'))).toEqual({ date: '2026-09-28', minutes: 26 * 60 + 59 })
  })

  it('03:00 ちょうどで新しい運行日になる', () => {
    expect(toServiceMoment(jst('2026-09-29T03:00:00'))).toEqual({ date: '2026-09-29', minutes: 180 })
  })

  it('月末・年末を跨ぐ', () => {
    expect(toServiceMoment(jst('2027-01-01T01:00:00')).date).toBe('2026-12-31')
  })
})

describe('departureMinutes', () => {
  it('03:00 未満の発車時刻は +24h', () => {
    expect(departureMinutes('05:00')).toBe(300)
    expect(departureMinutes('23:59')).toBe(1439)
    expect(departureMinutes('00:15')).toBe(1455)
    expect(departureMinutes('02:59')).toBe(1619)
    expect(departureMinutes('03:00')).toBe(180)
  })
})

describe('nextDate', () => {
  it('月末・年末・閏年', () => {
    expect(nextDate('2026-09-30')).toBe('2026-10-01')
    expect(nextDate('2026-12-31')).toBe('2027-01-01')
    expect(nextDate('2028-02-28')).toBe('2028-02-29')
  })
})

describe('calendarCandidates', () => {
  it('平日: 曜日指定 → Weekday', () => {
    expect(calendarCandidates('2026-09-28')).toEqual(['odpt.Calendar:Monday', 'odpt.Calendar:Weekday'])
  })
  it('土曜: Saturday → SaturdayHoliday', () => {
    expect(calendarCandidates('2026-09-26')).toEqual(['odpt.Calendar:Saturday', 'odpt.Calendar:SaturdayHoliday'])
  })
  it('日曜: Sunday → Holiday → SaturdayHoliday', () => {
    expect(calendarCandidates('2026-09-27')).toEqual(['odpt.Calendar:Sunday', 'odpt.Calendar:Holiday', 'odpt.Calendar:SaturdayHoliday'])
  })
  it('平日の祝日（2026-09-22 秋分の日）: Holiday → SaturdayHoliday', () => {
    expect(calendarCandidates('2026-09-22')).toEqual(['odpt.Calendar:Holiday', 'odpt.Calendar:SaturdayHoliday'])
  })
  it('年末年始（12/30〜1/3）は祝日扱い、1/4 は平日', () => {
    expect(calendarCandidates('2026-12-30')[0]).toBe('odpt.Calendar:Holiday')
    expect(calendarCandidates('2027-01-02')[0]).toBe('odpt.Calendar:Holiday')
    expect(calendarCandidates('2027-01-04')).toEqual(['odpt.Calendar:Monday', 'odpt.Calendar:Weekday'])
  })
})
