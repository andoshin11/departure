import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { DeparturesResponse, TrainInformation } from '@departure/shared'
import type { AppEnv } from '../env'
import {
  fetchStation,
  fetchStationTimetables,
  fetchTrainInformation,
  lookupTitles,
  odptContext,
  type OdptContext,
} from '../utils/odpt-client'
import { buildDirections, collectReferencedIds, nameFromOdptId, selectTrainInformation } from '../utils/departures'
import { isStationId } from '../utils/query'
import { toServiceMoment } from '../utils/service-day'

export const departures = new Hono<AppEnv>()

/**
 * GET /api/departures?station=<odpt:Station の owl:sameAs>
 *
 * その駅（路線）から次に発車する列車を、方面ごとに最大 MAX_DEPARTURES_PER_DIRECTION 本返す。
 * 現在時刻はサーバーの時計（JST 換算）を使う。時刻表の取得・名前解決はキャッシュされるが、
 * 「次の列車」の計算はリクエストごとに行うため、レスポンス自体はキャッシュしない。
 *
 * あわせて路線の運行情報（odpt:TrainInformation）を返す。運行情報は補助的な情報なので、取得に失敗しても
 * 発車予定（時刻表）は返し、trainInformation を { kind: 'error' } にして画面で明示する（失敗はログに残す）。
 */
departures.get('/', async (c) => {
  const stationId = c.req.query('station')
  if (!isStationId(stationId)) {
    throw new HTTPException(400, { message: 'station must be an odpt:Station id (e.g. odpt.Station:TokyoMetro.Ginza.Shibuya)' })
  }

  const odpt = odptContext(c.env)
  const [station, timetables] = await Promise.all([fetchStation(odpt, stationId), fetchStationTimetables(odpt, stationId)])
  if (!station) {
    throw new HTTPException(404, { message: `Station not found: ${stationId}` })
  }
  if (timetables.length === 0) {
    // ODPT は事業者によって駅時刻表を提供していない。空の結果を返すと「今日はもう電車が無い」と
    // 区別できないため、専用のステータスで明示する。
    throw new HTTPException(404, { message: `No station timetable in ODPT for ${stationId}` })
  }

  const now = new Date()
  // 運行情報は名称の解決と並行して取得する（失敗しても例外にならない。loadTrainInformation 参照）
  const trainInformationPromise = loadTrainInformation(odpt, station.railwayId, now)

  const ids = collectReferencedIds(timetables)
  const [stationTitles, railDirectionTitles, trainTypeTitles, railwayTitles] = await Promise.all([
    lookupTitles(odpt, 'odpt:Station', ids.stationIds),
    lookupTitles(odpt, 'odpt:RailDirection', ids.railDirectionIds),
    lookupTitles(odpt, 'odpt:TrainType', ids.trainTypeIds),
    lookupTitles(odpt, 'odpt:Railway', [station.railwayId]),
  ])

  const trainInformation = await trainInformationPromise
  return c.json<DeparturesResponse>({
    stationId,
    stationName: station.title,
    railwayName: railwayTitles.get(station.railwayId) ?? nameFromOdptId(station.railwayId),
    generatedAt: now.toISOString(),
    directions: buildDirections({
      timetables,
      moment: toServiceMoment(now),
      stationTitles,
      railDirectionTitles,
      trainTypeTitles,
    }),
    trainInformation,
  })
})

async function loadTrainInformation(odpt: OdptContext, railwayId: string, now: Date): Promise<TrainInformation> {
  try {
    const records = await fetchTrainInformation(odpt, railwayId)
    return selectTrainInformation(records, railwayId, now, (reason) => console.warn(`[departures] train information discarded: ${reason}`))
  } catch (error) {
    console.error(`[departures] failed to load train information for ${railwayId}`, error)
    return { kind: 'error' }
  }
}
