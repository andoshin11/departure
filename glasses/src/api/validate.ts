import type {
  Departure,
  DeparturesResponse,
  DirectionDepartures,
  NearbyStation,
  NearbyStationsResponse,
  StationRailway,
  TrainInformation,
} from '@departure/shared'
import { ApiError } from './errors'

// shared/src/index.ts の契約型に対する薄い実行時検証。
// api/ 側の実装バグやレスポンス形式の破壊的変更を、型が合っているふりをしたまま
// 描画層まで伝播させないための最後の砦。

type Json = Record<string, unknown>

function invalid(field: string): never {
  throw new ApiError(`API のレスポンス形式が不正です: ${field}`)
}

function asRecord(value: unknown, label: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(label)
  return value as Json
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) invalid(label)
  return value
}

function str(obj: Json, key: string, label: string): string {
  const v = obj[key]
  if (typeof v !== 'string') invalid(`${label}.${key}`)
  return v
}

function num(obj: Json, key: string, label: string): number {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) invalid(`${label}.${key}`)
  return v
}

function bool(obj: Json, key: string, label: string): boolean {
  const v = obj[key]
  if (typeof v !== 'boolean') invalid(`${label}.${key}`)
  return v
}

function validateRailway(value: unknown, label: string): StationRailway {
  const r = asRecord(value, label)
  return {
    stationId: str(r, 'stationId', label),
    railwayId: str(r, 'railwayId', label),
    railwayName: str(r, 'railwayName', label),
    operatorName: str(r, 'operatorName', label),
  }
}

function validateStation(value: unknown, label: string): NearbyStation {
  const s = asRecord(value, label)
  const railways = asArray(s.railways, `${label}.railways`).map((r, i) => validateRailway(r, `${label}.railways[${i}]`))
  // 路線が0件の駅は選択しても何もできないため、API の契約違反として扱う。
  if (railways.length === 0) invalid(`${label}.railways (empty)`)
  return { name: str(s, 'name', label), distanceMeters: num(s, 'distanceMeters', label), railways }
}

export function validateNearbyStationsResponse(data: unknown): NearbyStationsResponse {
  const d = asRecord(data, 'response')
  return { stations: asArray(d.stations, 'stations').map((s, i) => validateStation(s, `stations[${i}]`)) }
}

function validateDeparture(value: unknown, label: string): Departure {
  const d = asRecord(value, label)
  const trainType = d.trainType
  if (trainType !== null && typeof trainType !== 'string') invalid(`${label}.trainType`)
  return {
    time: str(d, 'time', label),
    destination: str(d, 'destination', label),
    trainType,
    nextServiceDay: bool(d, 'nextServiceDay', label),
    isLast: bool(d, 'isLast', label),
  }
}

function validateDirection(value: unknown, label: string): DirectionDepartures {
  const d = asRecord(value, label)
  return {
    directionName: str(d, 'directionName', label),
    departures: asArray(d.departures, `${label}.departures`).map((x, i) => validateDeparture(x, `${label}.departures[${i}]`)),
  }
}

function nullableStr(obj: Json, key: string, label: string): string | null {
  const v = obj[key]
  if (v !== null && typeof v !== 'string') invalid(`${label}.${key}`)
  return v
}

function isoDate(obj: Json, key: string, label: string): string {
  const v = str(obj, key, label)
  if (Number.isNaN(Date.parse(v))) invalid(`${label}.${key}`)
  return v
}

function validateTrainInformation(value: unknown): TrainInformation {
  const label = 'trainInformation'
  const t = asRecord(value, label)
  switch (t.kind) {
    case 'available':
      return {
        kind: 'available',
        text: str(t, 'text', label),
        status: nullableStr(t, 'status', label),
        cause: nullableStr(t, 'cause', label),
        date: isoDate(t, 'date', label),
        validUntil: isoDate(t, 'validUntil', label),
      }
    case 'unavailable':
    case 'error':
      return { kind: t.kind }
    default:
      invalid(`${label}.kind`)
  }
}

export function validateDeparturesResponse(data: unknown): DeparturesResponse {
  const d = asRecord(data, 'response')
  return {
    stationId: str(d, 'stationId', 'response'),
    stationName: str(d, 'stationName', 'response'),
    railwayName: str(d, 'railwayName', 'response'),
    generatedAt: str(d, 'generatedAt', 'response'),
    directions: asArray(d.directions, 'directions').map((x, i) => validateDirection(x, `directions[${i}]`)),
    trainInformation: validateTrainInformation(d.trainInformation),
  }
}
