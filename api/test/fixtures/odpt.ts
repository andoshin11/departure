// ODPT API v4 のレスポンス（JSON-LD）の形を模したテスト用データ。

/** key は "<事業者>.<路線>.<駅>" */
export function odptStation(key: string, title: string, lat: number, lon: number): Record<string, unknown> {
  const [operator, railway] = key.split('.')
  return {
    '@id': `urn:ucode:_${key}`,
    '@type': 'odpt:Station',
    'dc:date': '2026-09-01T00:00:00+09:00',
    'owl:sameAs': `odpt.Station:${key}`,
    'dc:title': title,
    'odpt:stationTitle': { ja: title, en: key.split('.').pop() },
    'odpt:operator': `odpt.Operator:${operator}`,
    'odpt:railway': `odpt.Railway:${operator}.${railway}`,
    'geo:lat': lat,
    'geo:long': lon,
  }
}

export function odptTimetable(direction: string, calendar: string, objects: Record<string, unknown>[]): Record<string, unknown> {
  return {
    '@id': `urn:ucode:_tt_${direction}_${calendar}`,
    '@type': 'odpt:StationTimetable',
    'owl:sameAs': `odpt.StationTimetable:TokyoMetro.Ginza.Shibuya.${direction}.${calendar}`,
    'odpt:operator': 'odpt.Operator:TokyoMetro',
    'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza',
    'odpt:station': 'odpt.Station:TokyoMetro.Ginza.Shibuya',
    'odpt:railDirection': `odpt.RailDirection:${direction}`,
    'odpt:calendar': `odpt.Calendar:${calendar}`,
    'odpt:stationTimetableObject': objects,
  }
}
