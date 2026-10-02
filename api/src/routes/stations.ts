import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { MAX_NEARBY_RADIUS_METERS, type NearbyStationsResponse } from '@departure/shared'
import type { AppEnv } from '../env'
import { fetchNearbyStations, lookupTitles, odptContext } from '../utils/odpt-client'
import { groupStationsByName } from '../utils/nearby'
import { parseCoordinate, parseRadius } from '../utils/query'

export const stations = new Hono<AppEnv>()

/**
 * GET /api/stations/nearby?lat=<緯度>&lon=<経度>&radius=<m>
 *
 * 現在地から radius 以内の駅を、駅名でまとめて近い順に返す。
 * 座標ごとにリクエストが変わるためレスポンス自体はキャッシュしない（路線名・事業者名の解決はキャッシュされる）。
 */
stations.get('/nearby', async (c) => {
  const lat = parseCoordinate(c.req.query('lat'), -90, 90)
  const lon = parseCoordinate(c.req.query('lon'), -180, 180)
  const radius = parseRadius(c.req.query('radius'), MAX_NEARBY_RADIUS_METERS)
  if (lat === null || lon === null || radius === null) {
    throw new HTTPException(400, {
      message: `lat (-90..90), lon (-180..180), radius (1..${MAX_NEARBY_RADIUS_METERS}) are required numbers`,
    })
  }

  const odpt = odptContext(c.env)
  const nearby = await fetchNearbyStations(odpt, lat, lon, radius)
  const [railwayTitles, operatorTitles] = await Promise.all([
    lookupTitles(
      odpt,
      'odpt:Railway',
      nearby.map((s) => s.railwayId),
    ),
    lookupTitles(
      odpt,
      'odpt:Operator',
      nearby.map((s) => s.operatorId),
    ),
  ])

  return c.json<NearbyStationsResponse>({ stations: groupStationsByName({ stations: nearby, lat, lon, railwayTitles, operatorTitles }) })
})
