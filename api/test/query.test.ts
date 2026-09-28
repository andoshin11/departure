import { describe, expect, it } from 'vitest'
import { isStationId, parseCoordinate, parseRadius } from '#server/utils/query'

describe('parseCoordinate', () => {
  it('範囲内の数値文字列だけを受け付ける', () => {
    expect(parseCoordinate('35.6', -90, 90)).toBe(35.6)
    expect(parseCoordinate('-90', -90, 90)).toBe(-90)
    for (const v of ['91', 'abc', '', ' ', undefined, ['1'], 'Infinity']) expect(parseCoordinate(v, -90, 90)).toBeNull()
  })
})

describe('parseRadius', () => {
  it('1 以上 max 以下の整数', () => {
    expect(parseRadius('1000', 4000)).toBe(1000)
    for (const v of ['0', '4001', '10.5', 'x', undefined]) expect(parseRadius(v, 4000)).toBeNull()
  })
})

describe('isStationId', () => {
  it('odpt.Station: で始まる ID だけを受け付ける', () => {
    expect(isStationId('odpt.Station:TokyoMetro.Ginza.Shibuya')).toBe(true)
    expect(isStationId('odpt.Station:JR-East.Yamanote.Shibuya')).toBe(true)
    for (const v of ['odpt.Railway:TokyoMetro.Ginza', 'odpt.Station:A,B', 'odpt.Station:', undefined, 1]) expect(isStationId(v)).toBe(false)
  })
})
