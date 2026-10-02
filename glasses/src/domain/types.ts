import type { DeparturesResponse, NearbyStation, StationRailway } from '@departure/shared'

export type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }

/** 駅一覧画面の読み込みは「現在地の取得」→「最寄り駅の検索」の2段階 */
export type StationsLoad =
  | { status: 'loading'; step: 'locating' | 'searching' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: StationsData }

export interface StationsData {
  stations: NearbyStation[]
}

export interface StationsState {
  screen: 'stations'
  load: StationsLoad
  /** 選択中の駅の全体 index（ページをまたいだ通し番号）。load.status !== 'ready' の間は常に 0 */
  cursor: number
  /**
   * FOREGROUND_ENTER による再検索が進行中のとき、再検索前に選択していた駅名。
   * NEARBY_LOADED で新しい一覧にこの駅名があればそこにカーソルを合わせ、無ければ先頭（0）にする
   * （再検索後の定義された初期位置。フォールバックではない）。
   */
  restoreName?: string
}

/** 駅一覧に戻る際の復元情報。戻る操作で現在地の再取得・再検索を発生させない */
export interface StationsOrigin {
  data: StationsData
  cursor: number
}

export interface RailwaysState {
  screen: 'railways'
  origin: StationsOrigin
  station: NearbyStation
  cursor: number
}

export interface DeparturesState {
  screen: 'departures'
  origin: StationsOrigin
  station: NearbyStation
  railway: StationRailway
  /**
   * 路線選択画面で選んだ index。駅に路線が1つしかなく路線選択をスキップした場合は null
   * （DOUBLE_CLICK で戻る先が駅一覧になる）。
   */
  railwayCursor: number | null
  load: Load<DeparturesResponse>
  /**
   * 表示中の発車予定を裏で取り直している最中なら true（load.status === 'ready' のときだけ使う）。
   * 運行情報の有効期限が来たときの自動更新で使う。取り直しの間も発車予定は表示したまま、
   * 有効期限の切れた運行情報だけを「更新中」に差し替える（開発者ガイドライン 2.1.2）。
   */
  refreshing: boolean
}

export type AppState = StationsState | RailwaysState | DeparturesState

/**
 * SDK の生イベント・非同期処理の結果を main.ts が正規化した、ドメインレベルのイベント。
 * CLICK は選択位置を持たない（Text コンテナのイベントに選択位置は含まれない）。
 * 「何が選ばれているか」は state 側の cursor で管理する。
 */
export type AppEvent =
  | { type: 'CLICK' }
  | { type: 'DOUBLE_CLICK' }
  | { type: 'SCROLL_PREV' }
  | { type: 'SCROLL_NEXT' }
  | { type: 'FOREGROUND_ENTER' }
  | { type: 'LOCATED'; lat: number; lon: number }
  | { type: 'LOCATE_FAILED'; message: string }
  | { type: 'NEARBY_LOADED'; stations: NearbyStation[] }
  | { type: 'NEARBY_LOAD_FAILED'; message: string }
  | { type: 'DEPARTURES_LOADED'; stationId: string; data: DeparturesResponse }
  | { type: 'DEPARTURES_LOAD_FAILED'; stationId: string; message: string }
  /** 運行情報の有効期限（validUntil）が来た。SCHEDULE_INFO_EXPIRY で予約したタイマーから届く */
  | { type: 'INFO_EXPIRED'; stationId: string; validUntil: string }

/** reducer が要求する副作用。実行は main.ts 側の effect runner が担う */
export type Effect =
  | { type: 'LOCATE' }
  | { type: 'FETCH_NEARBY'; lat: number; lon: number }
  | { type: 'FETCH_DEPARTURES'; stationId: string }
  /** 運行情報の有効期限（validUntil）に INFO_EXPIRED を届けるタイマーを予約する（予約済みのものは置き換える） */
  | { type: 'SCHEDULE_INFO_EXPIRY'; stationId: string; validUntil: string }
  | { type: 'EXIT' }

export interface ReduceResult {
  state: AppState
  effects: Effect[]
}
