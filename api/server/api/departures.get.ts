import { createError, defineEventHandler, getQuery } from 'h3'
import type { DeparturesResponse } from '@departure/shared'
import { fetchStation, fetchStationTimetables, lookupTitles } from '#server/utils/odpt-client'
import { buildDirections, collectReferencedIds, nameFromOdptId } from '#server/utils/departures'
import { isStationId } from '#server/utils/query'
import { toServiceMoment } from '#server/utils/service-day'

/**
 * GET /api/departures?station=<odpt:Station の owl:sameAs>
 *
 * その駅（路線）から次に発車する列車を、方面ごとに最大 MAX_DEPARTURES_PER_DIRECTION 本返す。
 * 現在時刻はサーバーの時計（JST 換算）を使う。時刻表の取得・名前解決はキャッシュされるが、
 * 「次の列車」の計算はリクエストごとに行うため、レスポンス自体はキャッシュしない。
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

  const ids = collectReferencedIds(timetables)
  const [stationTitles, railDirectionTitles, trainTypeTitles, railwayTitles] = await Promise.all([
    lookupTitles(event, 'odpt:Station', ids.stationIds),
    lookupTitles(event, 'odpt:RailDirection', ids.railDirectionIds),
    lookupTitles(event, 'odpt:TrainType', ids.trainTypeIds),
    lookupTitles(event, 'odpt:Railway', [station.railwayId]),
  ])

  const now = new Date()
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
  }
})
