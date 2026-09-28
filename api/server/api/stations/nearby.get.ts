import { createError, defineEventHandler, getQuery } from 'h3'
import { MAX_NEARBY_RADIUS_METERS, type NearbyStationsResponse } from '@departure/shared'
import { fetchNearbyStations, lookupTitles } from '#server/utils/odpt-client'
import { groupStationsByName } from '#server/utils/nearby'
import { parseCoordinate, parseRadius } from '#server/utils/query'

/**
 * GET /api/stations/nearby?lat=<緯度>&lon=<経度>&radius=<m>
 *
 * 現在地から radius 以内の駅を、駅名でまとめて近い順に返す。
 * 座標ごとにリクエストが変わるためレスポンス自体はキャッシュしない（路線名・事業者名の解決はキャッシュされる）。
 */
export default defineEventHandler<Promise<NearbyStationsResponse>>(async (event) => {
  const query = getQuery(event)
  const lat = parseCoordinate(query.lat, -90, 90)
  const lon = parseCoordinate(query.lon, -180, 180)
  const radius = parseRadius(query.radius, MAX_NEARBY_RADIUS_METERS)
  if (lat === null || lon === null || radius === null) {
    throw createError({
      statusCode: 400,
      statusMessage: `lat (-90..90), lon (-180..180), radius (1..${MAX_NEARBY_RADIUS_METERS}) are required numbers`,
    })
  }

  const stations = await fetchNearbyStations(event, lat, lon, radius)
  const [railwayTitles, operatorTitles] = await Promise.all([
    lookupTitles(
      event,
      'odpt:Railway',
      stations.map((s) => s.railwayId),
    ),
    lookupTitles(
      event,
      'odpt:Operator',
      stations.map((s) => s.operatorId),
    ),
  ])

  return { stations: groupStationsByName({ stations, lat, lon, railwayTitles, operatorTitles }) }
})
