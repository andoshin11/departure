import { describe, expect, it } from 'vitest'
import { distanceMeters, groupStationsByName } from '../src/utils/nearby'
import type { OdptStation } from '../src/utils/odpt-parser'

function station(id: string, title: string, lat: number, lon: number): OdptStation {
  const [operator, railway] = id.split('.')
  return {
    id: `odpt.Station:${id}`,
    title,
    railwayId: `odpt.Railway:${operator}.${railway}`,
    operatorId: `odpt.Operator:${operator}`,
    lat,
    lon,
  }
}

describe('distanceMeters', () => {
  it('同一点は 0、緯度 0.01 度はおよそ 1.11km', () => {
    expect(distanceMeters(35.6, 139.7, 35.6, 139.7)).toBe(0)
    expect(distanceMeters(35.6, 139.7, 35.61, 139.7)).toBeCloseTo(1112, -1)
  })
})

describe('groupStationsByName', () => {
  const railwayTitles = new Map([
    ['odpt.Railway:TokyoMetro.Ginza', '銀座線'],
    ['odpt.Railway:TokyoMetro.Hanzomon', '半蔵門線'],
    ['odpt.Railway:Tokyu.Toyoko', '東横線'],
  ])
  const operatorTitles = new Map([
    ['odpt.Operator:TokyoMetro', '東京メトロ'],
    ['odpt.Operator:Tokyu', '東急電鉄'],
  ])

  it('同じ駅名をまとめ、近い順に並べる（グループの距離は最も近い路線の距離）', () => {
    const stations = [
      station('TokyoMetro.Hanzomon.Shibuya', '渋谷', 35.6585, 139.7013),
      station('Tokyu.Toyoko.Daikanyama', '代官山', 35.648, 139.703),
      station('TokyoMetro.Ginza.Shibuya', '渋谷', 35.659, 139.7016),
    ]
    const result = groupStationsByName({ stations, lat: 35.659, lon: 139.7016, railwayTitles, operatorTitles })
    expect(result.map((s) => s.name)).toEqual(['渋谷', '代官山'])
    expect(result[0]).toEqual({
      name: '渋谷',
      distanceMeters: 0,
      railways: [
        {
          stationId: 'odpt.Station:TokyoMetro.Ginza.Shibuya',
          railwayId: 'odpt.Railway:TokyoMetro.Ginza',
          railwayName: '銀座線',
          operatorName: '東京メトロ',
        },
        {
          stationId: 'odpt.Station:TokyoMetro.Hanzomon.Shibuya',
          railwayId: 'odpt.Railway:TokyoMetro.Hanzomon',
          railwayName: '半蔵門線',
          operatorName: '東京メトロ',
        },
      ],
    })
    expect(result[1]!.distanceMeters).toBeGreaterThan(1000)
  })

  it('名前を解決できない路線・事業者は ID から名前を組み立てる', () => {
    const [s] = groupStationsByName({
      stations: [station('Keio.Inokashira.Shibuya', '渋谷', 0, 0)],
      lat: 0,
      lon: 0,
      railwayTitles,
      operatorTitles,
    })
    expect(s!.railways[0]).toMatchObject({ railwayName: 'Inokashira', operatorName: 'Keio' })
  })

  it('0 件なら空配列', () => {
    expect(groupStationsByName({ stations: [], lat: 0, lon: 0, railwayTitles, operatorTitles })).toEqual([])
  })
})
