import { createError, type H3Event } from 'h3'
import { hash } from 'ohash'
import { defineCachedFunction, useRuntimeConfig } from 'nitropack/runtime'
import {
  asArray,
  batchSameAsIds,
  extractTitle,
  parseStations,
  parseStationTimetables,
  type OdptStation,
  type OdptStationTimetable,
  type TitledType,
} from '#server/utils/odpt-parser'

// ODPT API (v4) へのアクセスを1箇所に集約する。
// - consumerKey は runtimeConfig（NUXT_ODPT_CONSUMER_KEY）から読み、未設定なら 500（fail-fast）。
// - upstream の失敗（ネットワーク・非2xx・形式不正）はすべて 502 に変換し、原因をログに残す。
// - 自動リトライはしない。

/** 名前解決（Railway/Operator/RailDirection/TrainType/Station の日本語名）のキャッシュ期間。マスタ系なので長め */
const TITLE_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24
/** 駅時刻表のキャッシュ期間。ダイヤ改正は事前告知されるので数時間の遅れは許容する */
const TIMETABLE_CACHE_MAX_AGE_SECONDS = 60 * 60 * 6

interface OdptConfig {
  baseUrl: string
  consumerKey: string
}

function readOdptConfig(event: H3Event | undefined): OdptConfig {
  const config = useRuntimeConfig(event)
  if (!config.odptConsumerKey) {
    console.error('[odpt] NUXT_ODPT_CONSUMER_KEY is not configured on the server')
    throw createError({ statusCode: 500, statusMessage: 'Server misconfiguration: ODPT consumer key is not set' })
  }
  return { baseUrl: config.odptBaseUrl, consumerKey: config.odptConsumerKey }
}

/** path は "odpt:Station" や "places/odpt:Station" 等。ログにはアクセストークンを出さない */
async function odptGet(config: OdptConfig, path: string, params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams(params)
  const logUrl = `${config.baseUrl}/${path}?${query.toString()}`
  query.set('acl:consumerKey', config.consumerKey)

  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/${path}?${query.toString()}`)
  } catch (error) {
    console.error(`[odpt] network error: url=${logUrl}`, error)
    throw createError({ statusCode: 502, statusMessage: `Failed to reach ODPT API (${path}): ${(error as Error).message}` })
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>')
    console.error(`[odpt] upstream error: url=${logUrl} status=${response.status} body=${body.slice(0, 500)}`)
    throw createError({ statusCode: 502, statusMessage: `ODPT API returned ${response.status} (${path})` })
  }

  try {
    return await response.json()
  } catch (error) {
    console.error(`[odpt] invalid JSON: url=${logUrl}`, error)
    throw createError({ statusCode: 502, statusMessage: `ODPT API returned invalid JSON (${path})` })
  }
}

/** パーサーが投げた形式エラーを 502 に変換する */
function parseOr502<T>(path: string, parse: () => T): T {
  try {
    return parse()
  } catch (error) {
    console.error(`[odpt] unexpected response structure: path=${path}`, error)
    throw createError({ statusCode: 502, statusMessage: `Unexpected ODPT response structure (${path}): ${(error as Error).message}` })
  }
}

export async function fetchNearbyStations(event: H3Event, lat: number, lon: number, radius: number): Promise<OdptStation[]> {
  const config = readOdptConfig(event)
  const path = 'places/odpt:Station'
  const data = await odptGet(config, path, { lat: String(lat), lon: String(lon), radius: String(radius) })
  return parseOr502(path, () => parseStations(data))
}

export async function fetchStation(event: H3Event, stationId: string): Promise<OdptStation | undefined> {
  const config = readOdptConfig(event)
  const path = 'odpt:Station'
  const data = await odptGet(config, path, { 'owl:sameAs': stationId })
  return parseOr502(path, () => parseStations(data))[0]
}

const cachedStationTimetables = defineCachedFunction(
  async (config: OdptConfig, stationId: string): Promise<OdptStationTimetable[]> => {
    const path = 'odpt:StationTimetable'
    const data = await odptGet(config, path, { 'odpt:station': stationId })
    return parseOr502(path, () => parseStationTimetables(data))
  },
  {
    maxAge: TIMETABLE_CACHE_MAX_AGE_SECONDS,
    swr: false,
    name: 'odpt-station-timetable',
    getKey: (_config: OdptConfig, stationId: string) => stationId,
  },
)

export function fetchStationTimetables(event: H3Event, stationId: string): Promise<OdptStationTimetable[]> {
  return cachedStationTimetables(readOdptConfig(event), stationId)
}

/**
 * ID の集合1つぶん（ソート済み）をキーにキャッシュする。Cloudflare KV のキー長上限（512バイト）を
 * 超えないよう、ID の列はハッシュ化してキーにする。戻り値は [id, title] の配列（KV に JSON で保存するため Map にしない） */
const cachedTitles = defineCachedFunction(
  async (config: OdptConfig, type: TitledType, ids: string[]): Promise<[string, string][]> => {
    const data = await odptGet(config, type, { 'owl:sameAs': ids.join(',') })
    return parseOr502(type, () =>
      asArray(data, `${type} response`)
        .map((v, i) => extractTitle(type, v, `${type}[${i}]`))
        .filter((t): t is { id: string; title: string } => t.title !== null)
        .map((t) => [t.id, t.title] as [string, string]),
    )
  },
  {
    maxAge: TITLE_CACHE_MAX_AGE_SECONDS,
    swr: false,
    name: 'odpt-titles',
    getKey: (_config: OdptConfig, type: TitledType, ids: string[]) => `${type}:${hash(ids)}`,
  },
)

/**
 * owl:sameAs → 日本語名。ODPT に存在しない（他事業者の直通先など）・名前が無い ID は結果に含めず、
 * 警告ログを残す（表示側は ID から組み立てた名前で縮退する。departures.ts の stationNameFromId 参照）。
 */
export async function lookupTitles(event: H3Event, type: TitledType, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].sort()
  if (unique.length === 0) return new Map()
  const config = readOdptConfig(event)

  const results = await Promise.all(batchSameAsIds(unique).map((batch) => cachedTitles(config, type, batch)))

  const titles = new Map(results.flat())
  const missing = unique.filter((id) => !titles.has(id))
  if (missing.length > 0) console.warn(`[odpt] titles not found for ${type}: ${missing.join(', ')}`)
  return titles
}
