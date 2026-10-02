import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_KEY_HEADER, type DeparturesResponse, type NearbyStationsResponse } from '@departure/shared'
import app from '../src/index'
import type { Bindings } from '../src/env'
import { odptStation, odptTimetable } from './fixtures/odpt'
import { createFakeKv } from './utils/fake-kv'

// app.request() で HTTP のまま（ミドルウェア・ルート・エラー処理を通して）確かめる。
// ODPT への fetch はパスごとに用意した JSON を返すスタブに差し替える。

const API_KEY = 'test-api-key'
const ODPT_BASE_URL = 'https://odpt.example.test/api/v4'
const SHIBUYA = 'odpt.Station:TokyoMetro.Ginza.Shibuya'

type OdptRoutes = Record<string, unknown[] | ((url: URL) => Response)>

let odptRoutes: OdptRoutes
let odptRequests: URL[]

beforeEach(() => {
  odptRoutes = {}
  odptRequests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      odptRequests.push(url)
      const path = decodeURIComponent(url.pathname.replace('/api/v4/', ''))
      const route = odptRoutes[path]
      if (route === undefined) return new Response(`no stub for ${path}`, { status: 500 })
      return typeof route === 'function' ? route(url) : Response.json(route)
    }),
  )
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function env(overrides: Partial<Bindings> = {}): Bindings {
  return { API_KEY, ODPT_CONSUMER_KEY: 'test-consumer-key', ODPT_BASE_URL, CACHE: createFakeKv().kv, ...overrides }
}

function get(path: string, bindings: Bindings = env(), headers: Record<string, string> = { [API_KEY_HEADER]: API_KEY }) {
  return app.request(path, { headers }, bindings)
}

describe('CORS', () => {
  it('OPTIONS (preflight) は API Key が無くても 204 で完結させる', async () => {
    const res = await app.request('/api/departures', { method: 'OPTIONS', headers: { Origin: 'https://example.test' } }, env())

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET,OPTIONS')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe(`Content-Type,${API_KEY_HEADER}`)
  })

  it('通常のレスポンス（エラーを含む）にも Access-Control-Allow-Origin を付ける', async () => {
    const res = await get('/api/departures', env(), {})

    expect(res.status).toBe(401)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

describe('API Key 認証', () => {
  it('ヘッダーが無い・値が違う場合は 401', async () => {
    expect((await get('/api/departures', env(), {})).status).toBe(401)
    expect((await get('/api/departures', env(), { [API_KEY_HEADER]: 'wrong' })).status).toBe(401)
  })

  it('サーバー側に API_KEY が無い場合は、正しいキーが送られても 500（fail-fast）', async () => {
    const res = await get('/api/departures', env({ API_KEY: undefined }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ statusCode: 500, message: 'Server misconfiguration: API_KEY is not set' })
  })
})

describe('GET /api/stations/nearby', () => {
  it('不正なパラメータは ODPT に問い合わせずに 400', async () => {
    const res = await get('/api/stations/nearby?lat=35.6&lon=139.7&radius=5000')

    expect(res.status).toBe(400)
    expect(odptRequests).toHaveLength(0)
  })

  it('ODPT_CONSUMER_KEY が無い場合は 500（fail-fast）', async () => {
    const res = await get('/api/stations/nearby?lat=35.658&lon=139.701&radius=1000', env({ ODPT_CONSUMER_KEY: '' }))

    expect(res.status).toBe(500)
    expect(odptRequests).toHaveLength(0)
  })

  it('駅を駅名でまとめ、路線名・事業者名を解決して返す', async () => {
    odptRoutes['places/odpt:Station'] = [
      odptStation('TokyoMetro.Ginza.Shibuya', '渋谷', 35.659, 139.701),
      odptStation('TokyoMetro.Hanzomon.Shibuya', '渋谷', 35.6585, 139.7016),
    ]
    odptRoutes['odpt:Railway'] = [
      { 'owl:sameAs': 'odpt.Railway:TokyoMetro.Ginza', 'odpt:railwayTitle': { ja: '銀座線' } },
      { 'owl:sameAs': 'odpt.Railway:TokyoMetro.Hanzomon', 'odpt:railwayTitle': { ja: '半蔵門線' } },
    ]
    odptRoutes['odpt:Operator'] = [{ 'owl:sameAs': 'odpt.Operator:TokyoMetro', 'odpt:operatorTitle': { ja: '東京メトロ' } }]

    const res = await get('/api/stations/nearby?lat=35.658&lon=139.701&radius=1000')

    expect(res.status).toBe(200)
    const body = (await res.json()) as NearbyStationsResponse
    expect(body.stations).toHaveLength(1)
    expect(body.stations[0]?.name).toBe('渋谷')
    // 路線は現在地から近い順
    expect(body.stations[0]?.railways.map((r) => `${r.operatorName} ${r.railwayName}`)).toEqual([
      '東京メトロ 半蔵門線',
      '東京メトロ 銀座線',
    ])

    // アクセストークンは ODPT へのリクエストにだけ付ける
    const places = odptRequests.find((u) => u.pathname.endsWith('places/odpt:Station'))
    expect(places?.searchParams.get('acl:consumerKey')).toBe('test-consumer-key')
    expect(places?.searchParams.get('radius')).toBe('1000')
  })

  it('ODPT が非2xx を返したら 502', async () => {
    odptRoutes['places/odpt:Station'] = () => new Response('Service Unavailable', { status: 503 })

    const res = await get('/api/stations/nearby?lat=35.658&lon=139.701&radius=1000')

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ statusCode: 502, message: 'ODPT API returned 503 (places/odpt:Station)' })
  })
})

describe('GET /api/departures', () => {
  // 2026-09-28（月）12:00 JST
  const NOW = new Date('2026-09-28T03:00:00Z')
  const trainInformation = {
    '@type': 'odpt:TrainInformation',
    'dc:date': '2026-09-28T11:58:00+09:00',
    'dct:valid': '2026-09-28T12:03:00+09:00',
    'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza',
    'odpt:operator': 'odpt.Operator:TokyoMetro',
    'odpt:trainInformationText': { ja: '平常どおり運転しています。' },
    'odpt:trainInformationStatus': { ja: '平常運転' },
  }

  function stubShibuya() {
    odptRoutes['odpt:Station'] = (url: URL) =>
      Response.json(
        url.searchParams.get('owl:sameAs') === SHIBUYA ? [odptStation('TokyoMetro.Ginza.Shibuya', '渋谷', 35.659, 139.701)] : [],
      )
    odptRoutes['odpt:StationTimetable'] = [
      odptTimetable('TokyoMetro.Asakusa', 'Weekday', [
        { 'odpt:departureTime': '11:59', 'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Asakusa'] },
        { 'odpt:departureTime': '12:00', 'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Asakusa'] },
        { 'odpt:departureTime': '12:05', 'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Asakusa'] },
      ]),
    ]
    odptRoutes['odpt:RailDirection'] = [
      { 'owl:sameAs': 'odpt.RailDirection:TokyoMetro.Asakusa', 'odpt:railDirectionTitle': { ja: '浅草' } },
    ]
    odptRoutes['odpt:Railway'] = [{ 'owl:sameAs': 'odpt.Railway:TokyoMetro.Ginza', 'odpt:railwayTitle': { ja: '銀座線' } }]
    odptRoutes['odpt:TrainInformation'] = [trainInformation]
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  })

  it('station が odpt:Station の ID でなければ 400', async () => {
    expect((await get('/api/departures?station=Shibuya')).status).toBe(400)
    expect(odptRequests).toHaveLength(0)
  })

  it('方面ごとの発車予定と運行情報を返す（行き先が ODPT に無い場合は ID 末尾で表示する）', async () => {
    stubShibuya()

    const res = await get(`/api/departures?station=${SHIBUYA}`)

    expect(res.status).toBe(200)
    expect((await res.json()) as DeparturesResponse).toEqual({
      stationId: SHIBUYA,
      stationName: '渋谷',
      railwayName: '銀座線',
      generatedAt: NOW.toISOString(),
      directions: [
        {
          directionName: '浅草',
          departures: [
            { time: '12:00', destination: 'Asakusa', trainType: null, nextServiceDay: false, isLast: false },
            { time: '12:05', destination: 'Asakusa', trainType: null, nextServiceDay: false, isLast: false },
            // 当日の残りが3本に満たないので翌運行日の始発から補う
            { time: '11:59', destination: 'Asakusa', trainType: null, nextServiceDay: true, isLast: false },
          ],
        },
      ],
      trainInformation: {
        kind: 'available',
        text: '平常どおり運転しています。',
        status: '平常運転',
        cause: null,
        date: '2026-09-28T11:58:00+09:00',
        validUntil: '2026-09-28T12:03:00+09:00',
      },
    })
  })

  it('時刻表・名称・運行情報は KV にキャッシュし、2回目は ODPT に問い合わせない（駅は毎回問い合わせる）', async () => {
    stubShibuya()
    const bindings = env()

    expect((await get(`/api/departures?station=${SHIBUYA}`, bindings)).status).toBe(200)
    const first = odptRequests.length
    expect((await get(`/api/departures?station=${SHIBUYA}`, bindings)).status).toBe(200)

    expect(odptRequests.slice(first).map((u) => decodeURIComponent(u.pathname))).toEqual(['/api/v4/odpt:Station'])
  })

  it('運行情報の取得に失敗しても発車予定は返し、trainInformation を error にする', async () => {
    stubShibuya()
    odptRoutes['odpt:TrainInformation'] = () => new Response('error', { status: 500 })

    const res = await get(`/api/departures?station=${SHIBUYA}`)

    expect(res.status).toBe(200)
    const body = (await res.json()) as DeparturesResponse
    expect(body.directions[0]?.departures).toHaveLength(3)
    expect(body.trainInformation).toEqual({ kind: 'error' })
  })

  it('駅が無い場合・時刻表が無い場合は 404', async () => {
    stubShibuya()
    expect((await get('/api/departures?station=odpt.Station:TokyoMetro.Ginza.Unknown')).status).toBe(404)

    odptRoutes['odpt:StationTimetable'] = []
    const res = await get(`/api/departures?station=${SHIBUYA}`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ statusCode: 404, message: `No station timetable in ODPT for ${SHIBUYA}` })
  })
})
