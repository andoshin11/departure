import { createError, defineEventHandler, getQuery, type H3Event } from 'h3'
import type { DeparturesResponse, TrainInformation } from '@departure/shared'
import { fetchStation, fetchStationTimetables, fetchTrainInformation, lookupTitles } from '#server/utils/odpt-client'
import { buildDirections, collectReferencedIds, nameFromOdptId, selectTrainInformation } from '#server/utils/departures'
import { isStationId } from '#server/utils/query'
import { toServiceMoment } from '#server/utils/service-day'

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
export default defineEventHandler<Promise<DeparturesResponse>>(async (event) => {
  const stationId = getQuery(event).station
  if (!isStationId(stationId)) {
    throw createError({ statusCode: 400, statusMessage: 'station must be an odpt:Station id (e.g. odpt.Station:TokyoMetro.Ginza.Shibuya)' })
  }

  const [station, timetables] = await Promise.all([fetchStation(event, stationId), fetchStationTimetables(event, stationId)])
  if (!station) {
    throw createError({ statusCode: 404, statusMessage: `Station not found: ${stationId}` })
  }
  if (timetables.length === 0) {
    // ODPT は事業者によって駅時刻表を提供していない。空の結果を返すと「今日はもう電車が無い」と
    // 区別できないため、専用のステータスで明示する。
    throw createError({ statusCode: 404, statusMessage: `No station timetable in ODPT for ${stationId}` })
  }

  const now = new Date()
  // 運行情報は名称の解決と並行して取得する（失敗しても例外にならない。loadTrainInformation 参照）
  const trainInformationPromise = loadTrainInformation(event, station.railwayId, now)

  const ids = collectReferencedIds(timetables)
  const [stationTitles, railDirectionTitles, trainTypeTitles, railwayTitles] = await Promise.all([
    lookupTitles(event, 'odpt:Station', ids.stationIds),
    lookupTitles(event, 'odpt:RailDirection', ids.railDirectionIds),
    lookupTitles(event, 'odpt:TrainType', ids.trainTypeIds),
    lookupTitles(event, 'odpt:Railway', [station.railwayId]),
  ])

  const trainInformation = await trainInformationPromise
  return {
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
  }
})

async function loadTrainInformation(event: H3Event, railwayId: string, now: Date): Promise<TrainInformation> {
  try {
    const records = await fetchTrainInformation(event, railwayId)
    return selectTrainInformation(records, railwayId, now, (reason) => console.warn(`[departures] train information discarded: ${reason}`))
  } catch (error) {
    console.error(`[departures] failed to load train information for ${railwayId}`, error)
    return { kind: 'error' }
  }
}
