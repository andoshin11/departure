import type { NearbyStation, StationRailway } from '@departure/shared'
import type { OdptStation } from './odpt-parser'
import { nameFromOdptId, type TitleMap } from './departures'

const EARTH_RADIUS_METERS = 6_371_000

/** 2点間の大円距離（m）。駅までの数 km 程度なら誤差は無視できる */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

export interface GroupStationsInput {
  stations: OdptStation[]
  lat: number
  lon: number
  railwayTitles: TitleMap
  operatorTitles: TitleMap
}

/**
 * 路線ごとの odpt:Station を駅名でまとめ、近い順に並べる。
 * 同じ駅名でも事業者が違えば出口の位置が離れていることがあるが、利用者にとっては
 * 「渋谷駅」は1つなので、駅名単位でまとめて路線選択画面で選ばせる。
 */
export function groupStationsByName(input: GroupStationsInput): NearbyStation[] {
  const { stations, lat, lon, railwayTitles, operatorTitles } = input

  const withDistance = stations
    .map((s) => ({ station: s, distance: distanceMeters(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distance - b.distance)

  const groups = new Map<string, NearbyStation>()
  for (const { station, distance } of withDistance) {
    const railway: StationRailway = {
      stationId: station.id,
      railwayId: station.railwayId,
      railwayName: railwayTitles.get(station.railwayId) ?? nameFromOdptId(station.railwayId),
      operatorName: operatorTitles.get(station.operatorId) ?? nameFromOdptId(station.operatorId),
    }
    const group = groups.get(station.title)
    if (group) {
      group.railways.push(railway)
    } else {
      // withDistance は近い順なので、最初に現れたものがグループ内の最短距離になる。
      groups.set(station.title, { name: station.title, distanceMeters: Math.round(distance), railways: [railway] })
    }
  }
  return [...groups.values()]
}
