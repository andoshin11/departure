import { describe, expect, it } from 'vitest'
import { extractTitle, parseStations, parseStationTimetables } from '#server/utils/odpt-parser'
import { odptStation, odptTimetable } from './fixtures/odpt'

describe('parseStations', () => {
  it('必要なフィールドだけを取り出す（stationTitle.ja を優先）', () => {
    expect(parseStations([odptStation('TokyoMetro.Ginza.Shibuya', '渋谷', 35.659, 139.702)])).toEqual([
      {
        id: 'odpt.Station:TokyoMetro.Ginza.Shibuya',
        title: '渋谷',
        railwayId: 'odpt.Railway:TokyoMetro.Ginza',
        operatorId: 'odpt.Operator:TokyoMetro',
        lat: 35.659,
        lon: 139.702,
      },
    ])
  })

  it('stationTitle が無ければ dc:title を使う', () => {
    const s = { ...odptStation('A.B.C', '駅', 0, 0), 'odpt:stationTitle': undefined, 'dc:title': '別名' }
    expect(parseStations([s])[0]!.title).toBe('別名')
  })

  it.each([
    ['配列でない', {}],
    ['タイトルが無い', [{ ...odptStation('A.B.C', '駅', 0, 0), 'odpt:stationTitle': undefined, 'dc:title': undefined }]],
    ['座標が無い', [{ ...odptStation('A.B.C', '駅', 0, 0), 'geo:lat': undefined }]],
    ['路線が無い', [{ ...odptStation('A.B.C', '駅', 0, 0), 'odpt:railway': undefined }]],
  ])('%s → 例外', (_label, data) => {
    expect(() => parseStations(data)).toThrow()
  })
})

describe('parseStationTimetables', () => {
  it('時刻表を取り出し、到着のみ（終着）の列車は除外する', () => {
    const tt = odptTimetable('TokyoMetro.Asakusa', 'Weekday', [
      { 'odpt:departureTime': '05:01', 'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Asakusa'], 'odpt:trainType': 'odpt.TrainType:TokyoMetro.Local' },
      { 'odpt:arrivalTime': '05:10', 'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Shibuya'] },
      { 'odpt:departureTime': '00:10', 'odpt:isLast': true },
    ])
    expect(parseStationTimetables([tt])).toEqual([
      {
        railwayId: 'odpt.Railway:TokyoMetro.Ginza',
        railDirectionId: 'odpt.RailDirection:TokyoMetro.Asakusa',
        calendarId: 'odpt.Calendar:Weekday',
        entries: [
          { departureTime: '05:01', destinationStationIds: ['odpt.Station:TokyoMetro.Ginza.Asakusa'], trainTypeId: 'odpt.TrainType:TokyoMetro.Local', isLast: false },
          { departureTime: '00:10', destinationStationIds: [], trainTypeId: null, isLast: true },
        ],
      },
    ])
  })

  it('方面が無い時刻表は railDirectionId: null', () => {
    const tt = { ...odptTimetable('X', 'Weekday', []), 'odpt:railDirection': undefined }
    expect(parseStationTimetables([tt])[0]!.railDirectionId).toBeNull()
  })

  it.each([
    ['時刻の形式が不正', [odptTimetable('X', 'Weekday', [{ 'odpt:departureTime': '5:01' }])]],
    ['カレンダーが無い', [{ ...odptTimetable('X', 'Weekday', []), 'odpt:calendar': undefined }]],
    ['stationTimetableObject が無い', [{ ...odptTimetable('X', 'Weekday', []), 'odpt:stationTimetableObject': undefined }]],
    ['行き先が文字列でない', [odptTimetable('X', 'Weekday', [{ 'odpt:departureTime': '05:01', 'odpt:destinationStation': [1] }])]],
  ])('%s → 例外', (_label, data) => {
    expect(() => parseStationTimetables(data)).toThrow()
  })
})

describe('extractTitle', () => {
  it('型ごとの多言語タイトル（ja）→ dc:title の順で採用し、どちらも無ければ null', () => {
    expect(extractTitle('odpt:Railway', { 'owl:sameAs': 'r', 'odpt:railwayTitle': { ja: '銀座線', en: 'Ginza' } }, 'x')).toEqual({ id: 'r', title: '銀座線' })
    expect(extractTitle('odpt:RailDirection', { 'owl:sameAs': 'd', 'dc:title': '浅草方面' }, 'x')).toEqual({ id: 'd', title: '浅草方面' })
    expect(extractTitle('odpt:TrainType', { 'owl:sameAs': 't' }, 'x')).toEqual({ id: 't', title: null })
  })

  it('owl:sameAs が無ければ例外', () => {
    expect(() => extractTitle('odpt:Operator', { 'dc:title': 'x' }, 'x')).toThrow()
  })
})
