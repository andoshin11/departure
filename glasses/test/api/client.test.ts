import { describe, expect, it, vi } from 'vitest'
import { API_KEY_HEADER } from '@departure/shared'
import { ApiError, createApiClient } from '../../src/api/client'
import { makeDepartures, makeStation } from '../fixtures/data'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createApiClient', () => {
  it('最寄り駅: クエリと API Key ヘッダーを付けて取得し、検証済みの値を返す', async () => {
    const body = { stations: [makeStation('渋谷', 2)] }
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body))
    const client = createApiClient('https://api.example.com', 'key', fetchImpl)

    await expect(client.fetchNearbyStations(35.6, 139.7, 1000)).resolves.toEqual(body)
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/stations/nearby?lat=35.6&lon=139.7&radius=1000', {
      headers: { [API_KEY_HEADER]: 'key' },
    })
  })

  it('発車予定: station を URL エンコードして取得する', async () => {
    const id = 'odpt.Station:TokyoMetro.Ginza.Shibuya'
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(makeDepartures(id)))
    const client = createApiClient('https://api.example.com', 'key', fetchImpl)
    await expect(client.fetchDepartures(id)).resolves.toEqual(makeDepartures(id))
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.example.com/api/departures?station=odpt.Station%3ATokyoMetro.Ginza.Shibuya')
  })

  it('発車予定の 404 は「時刻表データがありません」、401 は API Key エラー', async () => {
    const c404 = createApiClient('https://x', 'k', vi.fn().mockResolvedValue(jsonResponse({}, 404)))
    await expect(c404.fetchDepartures('odpt.Station:A.B.C')).rejects.toThrow('この路線の時刻表データがありません')
    const c401 = createApiClient('https://x', 'k', vi.fn().mockResolvedValue(jsonResponse({}, 401)))
    await expect(c401.fetchNearbyStations(0, 0, 1)).rejects.toThrow('API Keyが不正です')
  })

  it('その他の非2xxは HTTP ステータス付きの ApiError', async () => {
    const client = createApiClient('https://x', 'k', vi.fn().mockResolvedValue(jsonResponse({}, 502)))
    const err = await client.fetchNearbyStations(0, 0, 1).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(502)
    expect((err as ApiError).message).toContain('HTTP 502')
  })

  it('ネットワークエラー・JSON でないレスポンスは ApiError', async () => {
    const c1 = createApiClient('https://x', 'k', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(c1.fetchNearbyStations(0, 0, 1)).rejects.toThrow('通信に失敗しました: offline')
    const c2 = createApiClient('https://x', 'k', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })))
    await expect(c2.fetchNearbyStations(0, 0, 1)).rejects.toThrow('JSON として解釈できません')
  })
})
