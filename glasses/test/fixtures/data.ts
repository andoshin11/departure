import type { Departure, DeparturesResponse, NearbyStation, StationRailway } from '@departure/shared'

export function makeRailway(i: number, overrides: Partial<StationRailway> = {}): StationRailway {
  return {
    stationId: `odpt.Station:Op.Line${i}.Sta`,
    railwayId: `odpt.Railway:Op.Line${i}`,
    railwayName: `${i}号線`,
    operatorName: 'テスト鉄道',
    ...overrides,
  }
}

export function makeStation(name: string, railwayCount = 1, distanceMeters = 100): NearbyStation {
  return { name, distanceMeters, railways: Array.from({ length: railwayCount }, (_, i) => makeRailway(i)) }
}

export function makeDeparture(time: string, overrides: Partial<Departure> = {}): Departure {
  return { time, destination: '浅草', trainType: '各停', nextServiceDay: false, isLast: false, ...overrides }
}

export function makeDepartures(stationId: string, overrides: Partial<DeparturesResponse> = {}): DeparturesResponse {
  return {
    stationId,
    stationName: '渋谷',
    railwayName: '銀座線',
    generatedAt: '2026-09-28T03:00:00.000Z',
    directions: [
      { directionName: '浅草方面', departures: [makeDeparture('12:03'), makeDeparture('12:06'), makeDeparture('12:09')] },
      {
        directionName: '渋谷方面',
        departures: [makeDeparture('12:04', { destination: '渋谷' }), makeDeparture('12:07', { destination: '渋谷' })],
      },
    ],
    ...overrides,
  }
}
