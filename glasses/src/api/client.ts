import { API_KEY_HEADER, type DeparturesResponse, type NearbyStationsResponse } from '@departure/shared'
import { ApiError } from './errors'
import { validateDeparturesResponse, validateNearbyStationsResponse } from './validate'

export { ApiError }

export interface ApiClient {
  fetchNearbyStations(lat: number, lon: number, radiusMeters: number): Promise<NearbyStationsResponse>
  fetchDepartures(stationId: string): Promise<DeparturesResponse>
}

function commonStatusMessage(status: number): string | undefined {
  if (status === 401) return 'API Keyが不正です'
  return undefined
}

/**
 * `fetchImpl` は注入可能にしてある（Vitest でモックしてテストする前提）。
 * 自動リトライはしない — 失敗はそのまま呼び出し元 (main.ts) に伝え、
 * ユーザーの明示的な再試行 (CLICK) に委ねる。
 *
 * `apiKey` は全リクエストに shared の API_KEY_HEADER ヘッダーとして付与する。
 * レスポンスは shared の契約型に対して薄い実行時検証をかけ、不一致なら ApiError で fail-fast する。
 */
export function createApiClient(baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch): ApiClient {
  async function request<T>(path: string, validate: (data: unknown) => T, statusMessage: (status: number) => string | undefined): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${baseUrl}${path}`, { headers: { [API_KEY_HEADER]: apiKey } })
    } catch (err) {
      throw new ApiError(`通信に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!res.ok) {
      throw new ApiError(statusMessage(res.status) ?? `取得に失敗しました (HTTP ${res.status})`, res.status)
    }
    let data: unknown
    try {
      data = await res.json()
    } catch (err) {
      throw new ApiError(`API のレスポンスが JSON として解釈できません: ${err instanceof Error ? err.message : String(err)}`)
    }
    return validate(data)
  }

  return {
    fetchNearbyStations(lat, lon, radiusMeters) {
      const query = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radiusMeters) })
      return request(`/api/stations/nearby?${query.toString()}`, validateNearbyStationsResponse, commonStatusMessage)
    },
    fetchDepartures(stationId) {
      const query = new URLSearchParams({ station: stationId })
      return request(`/api/departures?${query.toString()}`, validateDeparturesResponse, (status) => {
        // api/ は ODPT に駅時刻表が無い路線を 404 で返す（空の結果と区別するため）。
        if (status === 404) return 'この路線の時刻表データがありません'
        return commonStatusMessage(status)
      })
    },
  }
}
