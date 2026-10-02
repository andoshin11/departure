// API (api/) と G2 アプリ (glasses/) の間の契約。
// 変更する場合は両側を同時に更新すること。

/** API Key を載せるリクエストヘッダー名。すべての /api/** で必須 */
export const API_KEY_HEADER = 'X-API-Key'

/** GET /api/stations/nearby の radius（m）の上限。ODPT Places API の上限 4000m に合わせる */
export const MAX_NEARBY_RADIUS_METERS = 4000

/** 1方面あたりに返す発車予定の最大本数 */
export const MAX_DEPARTURES_PER_DIRECTION = 3

/** ある駅（駅名）に乗り入れている1路線。ODPT の odpt:Station 1件に対応する */
export interface StationRailway {
  /** odpt:Station の owl:sameAs（例: odpt.Station:TokyoMetro.Ginza.Shibuya）。発車予定取得のキー */
  stationId: string
  /** odpt:Railway の owl:sameAs */
  railwayId: string
  /** 路線名（例: 銀座線）。odpt:railwayTitle.ja → dc:title の順で採用する */
  railwayName: string
  /** 事業者名（例: 東京メトロ）。odpt:operatorTitle.ja → dc:title の順で採用する */
  operatorName: string
}

/**
 * 最寄り駅。ODPT の odpt:Station は「路線ごと」の駅なので、同じ駅名のものを1つにまとめている。
 */
export interface NearbyStation {
  /** 駅名（例: 渋谷） */
  name: string
  /** 現在地からの直線距離（m, 整数）。駅名グループ内で最も近い odpt:Station の距離 */
  distanceMeters: number
  /** 路線名の昇順ではなく、現在地から近い順 */
  railways: StationRailway[]
}

/** GET /api/stations/nearby?lat=<緯度>&lon=<経度>&radius=<m> */
export interface NearbyStationsResponse {
  /** 近い順 */
  stations: NearbyStation[]
}

export interface Departure {
  /** 発車時刻 "HH:MM"（ODPT の odpt:departureTime そのまま。深夜帯は "00:15" 等） */
  time: string
  /** 行き先の駅名。複数ある場合（分割併合等）は "・" で連結済み */
  destination: string
  /** 列車種別（例: 各停, 急行）。データに無ければ null */
  trainType: string | null
  /** 翌運行日のダイヤ（終電後に表示する始発以降の列車）なら true */
  nextServiceDay: boolean
  /** 終電なら true */
  isLast: boolean
}

export interface DirectionDepartures {
  /** 方面名（例: 浅草方面）。odpt:railDirectionTitle.ja → dc:title の順で採用する */
  directionName: string
  /** 発車時刻順、最大 MAX_DEPARTURES_PER_DIRECTION 件 */
  departures: Departure[]
}

/**
 * 路線の運行情報（ODPT の odpt:TrainInformation）。
 * - available: 有効期限内の運行情報がある
 * - unavailable: ODPT にその路線の運行情報が無い、または有効期限（dct:valid）切れ
 * - error: 取得に失敗した（発車予定は時刻表どおりに返す）
 */
export type TrainInformation =
  | {
      kind: 'available'
      /** odpt:trainInformationText.ja（そのまま） */
      text: string
      /** odpt:trainInformationStatus.ja（例: 遅延、ダイヤ乱れ）。東京メトロの平常時や都営には無い */
      status: string | null
      /** odpt:trainInformationCause.ja（例: 荷物挟まり）。無ければ null */
      cause: string | null
      /** データ生成時刻 dc:date（ISO 8601）。画面に表示する（開発者ガイドライン 2.1.1） */
      date: string
      /** 有効期限 dct:valid（ISO 8601）。これを過ぎた情報は表示しない（開発者ガイドライン 2.1.2） */
      validUntil: string
    }
  | { kind: 'unavailable' }
  | { kind: 'error' }

/** GET /api/departures?station=<StationRailway.stationId> */
export interface DeparturesResponse {
  stationId: string
  stationName: string
  railwayName: string
  /** 計算に使った現在時刻（ISO 8601） */
  generatedAt: string
  directions: DirectionDepartures[]
  /** その路線の運行情報。発車予定は時刻表どおりの予定なので、遅延等はここで伝える */
  trainInformation: TrainInformation
}
