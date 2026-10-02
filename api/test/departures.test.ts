import { describe, expect, it, vi } from 'vitest'
import { buildDirections, collectReferencedIds, selectUpcoming, nameFromOdptId } from '../src/utils/departures'
import type { OdptStationTimetable, OdptTimetableEntry } from '../src/utils/odpt-parser'

function entry(departureTime: string, overrides: Partial<OdptTimetableEntry> = {}): OdptTimetableEntry {
  return {
    departureTime,
    destinationStationIds: ['odpt.Station:M.G.Asakusa'],
    trainTypeId: 'odpt.TrainType:M.Local',
    isLast: false,
    ...overrides,
  }
}

function timetable(calendar: string, times: string[], direction: string | null = 'odpt.RailDirection:M.Asakusa'): OdptStationTimetable {
  return {
    railwayId: 'odpt.Railway:M.G',
    railDirectionId: direction,
    calendarId: `odpt.Calendar:${calendar}`,
    entries: times.map((t) => entry(t)),
  }
}

const times = (candidates: ReturnType<typeof selectUpcoming>) =>
  candidates.map((c) => `${c.nextServiceDay ? '翌' : ''}${c.entry.departureTime}`)

describe('selectUpcoming', () => {
  // 2026-09-28 は月曜（平日）、2026-09-26 は土曜
  const weekday = timetable('Weekday', ['05:00', '12:00', '12:05', '12:10', '12:15', '23:50', '00:20'])
  const holiday = timetable('SaturdayHoliday', ['06:00', '06:30', '07:00', '07:30'])

  it('現在時刻以降（同時刻を含む）の列車を最大3本、時刻順に返す', () => {
    expect(times(selectUpcoming([weekday, holiday], { date: '2026-09-28', minutes: 12 * 60 }))).toEqual(['12:00', '12:05', '12:10'])
  })

  it('土曜は Saturday が無ければ SaturdayHoliday のダイヤを使う', () => {
    expect(times(selectUpcoming([weekday, holiday], { date: '2026-09-26', minutes: 6 * 60 + 10 }))).toEqual(['06:30', '07:00', '07:30'])
  })

  it('深夜 0 時台の列車は前日の運行日の最後として扱う', () => {
    expect(times(selectUpcoming([weekday], { date: '2026-09-28', minutes: 23 * 60 + 55 }))).toEqual(['00:20', '翌05:00', '翌12:00'])
  })

  it('終電後は翌運行日のダイヤ（曜日が変わればカレンダーも変わる）の始発から返す', () => {
    // 2026-09-25（金）の終電後 → 翌運行日 2026-09-26（土）は SaturdayHoliday
    expect(times(selectUpcoming([weekday, holiday], { date: '2026-09-25', minutes: 26 * 60 }))).toEqual(['翌06:00', '翌06:30', '翌07:00'])
  })

  it('時刻表が時刻順でなくても並べ替える', () => {
    const shuffled = timetable('Weekday', ['12:10', '00:05', '12:00'])
    expect(times(selectUpcoming([shuffled], { date: '2026-09-28', minutes: 11 * 60 }))).toEqual(['12:00', '12:10', '00:05'])
  })

  it('該当するカレンダーの時刻表が無ければ空', () => {
    expect(selectUpcoming([timetable('Specific.Foo', ['12:00'])], { date: '2026-09-28', minutes: 0 })).toEqual([])
  })
})

describe('buildDirections', () => {
  const titles = {
    stationTitles: new Map([
      ['odpt.Station:M.G.Asakusa', '浅草'],
      ['odpt.Station:M.G.Shibuya', '渋谷'],
    ]),
    railDirectionTitles: new Map([
      ['odpt.RailDirection:M.Asakusa', '浅草方面'],
      ['odpt.RailDirection:M.Shibuya', '渋谷方面'],
    ]),
    trainTypeTitles: new Map([['odpt.TrainType:M.Local', '各停']]),
  }
  const moment = { date: '2026-09-28', minutes: 12 * 60 }

  it('方面ごとにまとめ、名前を解決する（方面は ID 順で安定）', () => {
    const toShibuya: OdptStationTimetable = {
      ...timetable('Weekday', [], 'odpt.RailDirection:M.Shibuya'),
      entries: [entry('12:01', { destinationStationIds: ['odpt.Station:M.G.Shibuya'], isLast: true, trainTypeId: null })],
    }
    const result = buildDirections({ timetables: [toShibuya, timetable('Weekday', ['12:00', '12:03'])], moment, ...titles })
    expect(result).toEqual([
      {
        directionName: '浅草方面',
        departures: [
          { time: '12:00', destination: '浅草', trainType: '各停', nextServiceDay: false, isLast: false },
          { time: '12:03', destination: '浅草', trainType: '各停', nextServiceDay: false, isLast: false },
          // 当日の残りが3本未満なので翌運行日（2026-09-29 火曜 = Weekday）の始発から補う
          { time: '12:00', destination: '浅草', trainType: '各停', nextServiceDay: true, isLast: false },
        ],
      },
      {
        directionName: '渋谷方面',
        departures: [
          { time: '12:01', destination: '渋谷', trainType: null, nextServiceDay: false, isLast: true },
          { time: '12:01', destination: '渋谷', trainType: null, nextServiceDay: true, isLast: true },
        ],
      },
    ])
  })

  it('複数の行き先は「・」で連結、ODPT に無い駅は ID から名前を組み立てて通知する', () => {
    const tt: OdptStationTimetable = {
      ...timetable('Weekday', []),
      entries: [entry('12:00', { destinationStationIds: ['odpt.Station:M.G.Asakusa', 'odpt.Station:Other.Line.Oshiage'] })],
    }
    const onUnresolvedStation = vi.fn()
    const [dir] = buildDirections({ timetables: [tt], moment, ...titles, onUnresolvedStation })
    expect(dir!.departures[0]!.destination).toBe('浅草・Oshiage')
    expect(onUnresolvedStation).toHaveBeenCalledWith('odpt.Station:Other.Line.Oshiage')
  })

  it('方面の無い時刻表は「方面不明」、ダイヤが無い方面は空配列で残す', () => {
    const result = buildDirections({
      timetables: [timetable('Weekday', ['12:30'], null), timetable('Specific.X', ['12:00'], 'odpt.RailDirection:M.Shibuya')],
      moment,
      ...titles,
    })
    expect(result.map((d) => [d.directionName, d.departures.length])).toEqual([
      ['方面不明', 2], // 当日 1 本 + 翌運行日 1 本（時刻表に1本しか無い）
      ['渋谷方面', 0],
    ])
  })
})

describe('collectReferencedIds / nameFromOdptId', () => {
  it('コロン以降にドットが無い ID（事業者・方面）もそのまま名前にする', () => {
    expect(nameFromOdptId('odpt.Operator:Keio')).toBe('Keio')
    expect(nameFromOdptId('odpt.RailDirection:Inbound')).toBe('Inbound')
  })

  it('名前解決が必要な ID を重複なく集める', () => {
    const ids = collectReferencedIds([timetable('Weekday', ['12:00', '12:05']), timetable('Holiday', ['12:00'], null)])
    expect(ids).toEqual({
      stationIds: ['odpt.Station:M.G.Asakusa'],
      railDirectionIds: ['odpt.RailDirection:M.Asakusa'],
      trainTypeIds: ['odpt.TrainType:M.Local'],
    })
  })

  it('ID の最後の要素を名前にする', () => {
    expect(nameFromOdptId('odpt.Station:JR-East.Yamanote.Shibuya')).toBe('Shibuya')
  })
})
