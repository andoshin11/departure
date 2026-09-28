import { describe, expect, it } from 'vitest'
import { getTextWidth } from '@evenrealities/pretext'
import { departureLine, departureRows, formatDistance, formatJstTime, railwayLabel, stationLabel } from '../../src/format/departure'
import { MAX_TEXT_BYTES, TEXT_INNER_WIDTH } from '../../src/constants'
import { utf8ByteLength } from '../../src/format/textByteLimit'
import { makeDeparture, makeRailway, makeStation } from '../fixtures/data'

describe('formatDistance', () => {
  it('1000m 未満は m、以上は 0.1km 単位', () => {
    expect(formatDistance(0)).toBe('0m')
    expect(formatDistance(999)).toBe('999m')
    expect(formatDistance(1000)).toBe('1.0km')
    expect(formatDistance(1250)).toBe('1.3km')
  })
})

describe('ラベル', () => {
  it('駅: 駅名 + 距離', () => {
    expect(stationLabel(makeStation('渋谷', 1, 350))).toBe('渋谷　350m')
  })
  it('路線: 路線名（事業者名）', () => {
    expect(railwayLabel(makeRailway(0, { railwayName: '銀座線', operatorName: '東京メトロ' }))).toBe('銀座線（東京メトロ）')
  })
})

describe('formatJstTime', () => {
  it('UTC の ISO 文字列を JST の HH:MM にする（日付を跨ぐケースを含む）', () => {
    expect(formatJstTime('2026-09-28T03:05:00.000Z')).toBe('12:05')
    expect(formatJstTime('2026-09-28T15:30:00.000Z')).toBe('00:30')
  })
  it('不正な日時は例外', () => {
    expect(() => formatJstTime('not a date')).toThrow()
  })
})

describe('departureLine', () => {
  it('時刻・種別・行き先を並べる', () => {
    expect(departureLine(makeDeparture('12:03', { trainType: '急行', destination: '中央林間' }))).toBe('　12:03 急行 中央林間')
  })
  it('種別が無ければ省略、翌運行日は「翌」、終電は「終電」を付ける', () => {
    expect(departureLine(makeDeparture('05:12', { trainType: null, nextServiceDay: true }))).toBe('　翌05:12 浅草')
    expect(departureLine(makeDeparture('00:15', { isLast: true }))).toBe('　00:15 各停 浅草 終電')
  })
})

describe('departureRows', () => {
  it('方面名の行 + 発車予定の行を方面ぶん並べる', () => {
    const rows = departureRows(
      [
        { directionName: '浅草方面', departures: [makeDeparture('12:03'), makeDeparture('12:06')] },
        { directionName: '渋谷方面', departures: [] },
      ],
      TEXT_INNER_WIDTH,
      MAX_TEXT_BYTES,
    )
    expect(rows).toEqual(['浅草方面', '　12:03 各停 浅草', '　12:06 各停 浅草', '渋谷方面', '　該当するダイヤがありません'])
  })

  it('長い行は行幅に収まるよう切り詰める', () => {
    const rows = departureRows(
      [{ directionName: '方面'.repeat(50), departures: [makeDeparture('12:03', { destination: '行き先'.repeat(40) })] }],
      TEXT_INNER_WIDTH,
      MAX_TEXT_BYTES,
    )
    for (const row of rows) expect(getTextWidth(row)).toBeLessThanOrEqual(TEXT_INNER_WIDTH)
  })
  it('バイト数の上限に収まらない方面は載せず、載せきれなかった方面数を最終行で明示する', () => {
    const dir = (name: string) => ({ directionName: name, departures: [makeDeparture('12:00'), makeDeparture('12:05')] })
    const all = departureRows([dir('A方面'), dir('B方面'), dir('C方面')], TEXT_INNER_WIDTH, MAX_TEXT_BYTES)
    const oneLine = utf8ByteLength(all.slice(0, 3).join('\n'))
    // A方面（3行）+ 注記ぶんしか入らない上限
    const limited = departureRows([dir('A方面'), dir('B方面'), dir('C方面')], TEXT_INNER_WIDTH, oneLine + 60)
    expect(limited).toEqual([...all.slice(0, 3), '（他2方面は表示しきれません）'])
    expect(utf8ByteLength(limited.join('\n'))).toBeLessThanOrEqual(oneLine + 60)
  })
})
