// ODPT API (v4) の JSON-LD レスポンスを、このアプリが使う最小限の形に変換する純粋関数群。
// 必須フィールドが欠けている／型が違う場合は例外を投げる（呼び出し側で 502 に変換する）。
// ODPT は事業者ごとに optional フィールドの有無が異なるため、必須にするのは
// このアプリの動作に不可欠なものだけに絞る。

export interface OdptStation {
  id: string
  /** odpt:stationTitle.ja → dc:title。どちらも無い駅は存在しない前提（欠けていれば例外） */
  title: string
  railwayId: string
  operatorId: string
  lat: number
  lon: number
}

export interface OdptTimetableEntry {
  departureTime: string
  destinationStationIds: string[]
  trainTypeId: string | null
  isLast: boolean
}

export interface OdptStationTimetable {
  railwayId: string
  /** 方面が無い時刻表（一部事業者のデータ）は null */
  railDirectionId: string | null
  calendarId: string
  entries: OdptTimetableEntry[]
}

type Json = Record<string, unknown>

function asRecord(value: unknown, label: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`)
  }
  return value as Json
}

export function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`)
  return value
}

function requireString(obj: Json, key: string, label: string): string {
  const v = obj[key]
  if (typeof v !== 'string' || v === '') throw new Error(`${label}.${key} is missing or not a string`)
  return v
}

function optionalString(obj: Json, key: string): string | null {
  const v = obj[key]
  return typeof v === 'string' && v !== '' ? v : null
}

function requireNumber(obj: Json, key: string, label: string): number {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label}.${key} is missing or not a number`)
  return v
}

/** 多言語タイトル（{ ja: ..., en: ... }）の ja を取り出す。無ければ null */
function jaTitle(obj: Json, key: string): string | null {
  const v = obj[key]
  if (typeof v !== 'object' || v === null) return null
  const ja = (v as Json).ja
  return typeof ja === 'string' && ja !== '' ? ja : null
}

/**
 * タイトル系フィールドのキー名。ODPT は型ごとに "odpt:<型名>Title" を持ち、dc:title は
 * 日本語名（任意項目）。多言語の ja を優先するのは、dc:title が省略されている事業者があるため。
 */
export const TITLE_FIELD = {
  'odpt:Station': 'odpt:stationTitle',
  'odpt:Railway': 'odpt:railwayTitle',
  'odpt:Operator': 'odpt:operatorTitle',
  'odpt:RailDirection': 'odpt:railDirectionTitle',
  'odpt:TrainType': 'odpt:trainTypeTitle',
} as const

export type TitledType = keyof typeof TITLE_FIELD

/** 任意の ODPT オブジェクトから日本語タイトルを取り出す（{型}Title.ja → dc:title）。無ければ null */
export function extractTitle(type: TitledType, value: unknown, label: string): { id: string; title: string | null } {
  const obj = asRecord(value, label)
  const id = requireString(obj, 'owl:sameAs', label)
  return { id, title: jaTitle(obj, TITLE_FIELD[type]) ?? optionalString(obj, 'dc:title') }
}

export function parseStation(value: unknown, index: number): OdptStation {
  const label = `odpt:Station[${index}]`
  const obj = asRecord(value, label)
  const { id, title } = extractTitle('odpt:Station', obj, label)
  if (title === null) throw new Error(`${label} (${id}) has no title`)
  return {
    id,
    title,
    railwayId: requireString(obj, 'odpt:railway', label),
    operatorId: requireString(obj, 'odpt:operator', label),
    lat: requireNumber(obj, 'geo:lat', label),
    lon: requireNumber(obj, 'geo:long', label),
  }
}

export function parseStations(data: unknown): OdptStation[] {
  return asArray(data, 'odpt:Station response').map((v, i) => parseStation(v, i))
}

const DEPARTURE_TIME_RE = /^\d{2}:\d{2}$/

function parseTimetableEntry(value: unknown, label: string): OdptTimetableEntry | null {
  const obj = asRecord(value, label)
  // 終着駅では到着時刻（odpt:arrivalTime）のみの列車がある。発車しないので対象外。
  const departureTime = optionalString(obj, 'odpt:departureTime')
  if (departureTime === null) return null
  if (!DEPARTURE_TIME_RE.test(departureTime)) throw new Error(`${label}.odpt:departureTime is malformed: ${departureTime}`)

  const dest = obj['odpt:destinationStation']
  const destinationStationIds = dest === undefined || dest === null ? [] : asArray(dest, `${label}.odpt:destinationStation`)
  if (!destinationStationIds.every((d): d is string => typeof d === 'string')) {
    throw new Error(`${label}.odpt:destinationStation contains non-string`)
  }

  return {
    departureTime,
    destinationStationIds,
    trainTypeId: optionalString(obj, 'odpt:trainType'),
    isLast: obj['odpt:isLast'] === true,
  }
}

export function parseStationTimetables(data: unknown): OdptStationTimetable[] {
  return asArray(data, 'odpt:StationTimetable response').map((value, i) => {
    const label = `odpt:StationTimetable[${i}]`
    const obj = asRecord(value, label)
    const objects = asArray(obj['odpt:stationTimetableObject'], `${label}.odpt:stationTimetableObject`)
    return {
      railwayId: requireString(obj, 'odpt:railway', label),
      railDirectionId: optionalString(obj, 'odpt:railDirection'),
      calendarId: requireString(obj, 'odpt:calendar', label),
      entries: objects
        .map((o, j) => parseTimetableEntry(o, `${label}.odpt:stationTimetableObject[${j}]`))
        .filter((e): e is OdptTimetableEntry => e !== null),
    }
  })
}
