import { AppLocationAccuracy, type AppLocation, type AppLocationOptions } from '@evenrealities/even_hub_sdk'
import { LOCATION_TIMEOUT_MS } from '../constants'

export interface Coordinates {
  lat: number
  lon: number
}

export class LocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocationError'
  }
}

/** bridge のうち位置情報取得に使う部分だけ（テストでモックしやすくするため） */
export interface LocationSource {
  getAppLocation(options?: AppLocationOptions): Promise<AppLocation | null>
}

/**
 * スマートフォン（Even App）の現在地を1回だけ取得する。取得できなければ LocationError を投げる
 * （自動リトライはしない。ユーザーの CLICK による再試行に委ねる）。
 * app.json の permissions に "location" が必要。
 */
export async function locate(source: LocationSource): Promise<Coordinates> {
  let location: AppLocation | null
  try {
    location = await source.getAppLocation({ accuracy: AppLocationAccuracy.High, timeoutMs: LOCATION_TIMEOUT_MS })
  } catch (err) {
    throw new LocationError(`現在地を取得できませんでした: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!location) {
    throw new LocationError('現在地を取得できませんでした（位置情報の許可を確認してください）')
  }
  return { lat: location.latitude, lon: location.longitude }
}

/**
 * VITE_DEV_FIXED_LOCATION（"緯度,経度"）を解釈する。シミュレーターは Even App の位置情報 API を
 * 持たないため、開発時だけ現在地を明示的に固定できるようにする。形式が不正なら例外（fail-fast）。
 */
export function parseFixedLocation(value: string): Coordinates {
  const parts = value.split(',').map((p) => Number(p.trim()))
  const [lat, lon] = parts
  if (parts.length !== 2 || lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`VITE_DEV_FIXED_LOCATION は "緯度,経度" の形式で指定してください: ${value}`)
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`VITE_DEV_FIXED_LOCATION の緯度経度が範囲外です: ${value}`)
  }
  return { lat, lon }
}
