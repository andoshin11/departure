import type { AppEvent, AppState, DeparturesState, Effect, ReduceResult, RailwaysState, StationsOrigin, StationsState } from './types'
import type { NearbyStation } from '@departure/shared'

/** 起動直後の状態。main.ts は初回描画のあと initialEffects を実行する */
export function createInitialState(): StationsState {
  return { screen: 'stations', load: { status: 'loading', step: 'locating' }, cursor: 0 }
}

export const initialEffects: Effect[] = [{ type: 'LOCATE' }]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * state[key] を value に更新した新しい state を返す。ただし value が現在値と同じ（＝境界での
 * クランプ等で見た目上の変化が無い）場合は、新しいオブジェクトを作らず state をそのまま返す。
 * 呼び出し元（main.ts）は `nextState === state` の参照比較だけで無駄な再描画を省略できる。
 */
function withUnchanged<T, K extends keyof T>(state: T, key: K, value: T[K]): T {
  return state[key] === value ? state : { ...state, [key]: value }
}

const noEffects: Effect[] = []

function moveCursor<T extends { cursor: number }>(state: T, delta: number, count: number): T {
  if (count === 0) return state
  return withUnchanged(state, 'cursor', clamp(state.cursor + delta, 0, count - 1))
}

function relocate(restoreName?: string): ReduceResult {
  return {
    state: { screen: 'stations', load: { status: 'loading', step: 'locating' }, cursor: 0, restoreName },
    effects: [{ type: 'LOCATE' }],
  }
}

function openDepartures(origin: StationsOrigin, station: NearbyStation, railwayCursor: number | null): ReduceResult {
  const railway = station.railways[railwayCursor ?? 0]
  if (!railway) throw new Error(`openDepartures: ${station.name} に路線 index=${railwayCursor} がありません`)
  return {
    state: { screen: 'departures', origin, station, railway, railwayCursor, load: { status: 'loading' } },
    effects: [{ type: 'FETCH_DEPARTURES', stationId: railway.stationId }],
  }
}

function backToStations(origin: StationsOrigin): StationsState {
  return { screen: 'stations', load: { status: 'ready', data: origin.data }, cursor: origin.cursor }
}

/**
 * 純粋な状態遷移関数: 現在の状態 + ドメインイベント → 次の状態 + 実行すべき副作用。
 * SDK/API 呼び出しは一切行わない（呼び出しは main.ts の effect runner が担当）。
 */
export function reduce(state: AppState, event: AppEvent): ReduceResult {
  switch (state.screen) {
    case 'stations':
      return reduceStations(state, event)
    case 'railways':
      return reduceRailways(state, event)
    case 'departures':
      return reduceDepartures(state, event)
  }
}

function reduceStations(state: StationsState, event: AppEvent): ReduceResult {
  const { load } = state

  switch (event.type) {
    case 'LOCATED':
      if (load.status !== 'loading' || load.step !== 'locating') return { state, effects: noEffects }
      return {
        state: { ...state, load: { status: 'loading', step: 'searching' } },
        effects: [{ type: 'FETCH_NEARBY', lat: event.lat, lon: event.lon }],
      }

    case 'LOCATE_FAILED':
      if (load.status !== 'loading' || load.step !== 'locating') return { state, effects: noEffects }
      return { state: { ...state, load: { status: 'error', message: event.message } }, effects: noEffects }

    case 'NEARBY_LOADED': {
      if (load.status !== 'loading' || load.step !== 'searching') return { state, effects: noEffects }
      const restored = state.restoreName != null ? event.stations.findIndex((s) => s.name === state.restoreName) : -1
      return {
        state: { screen: 'stations', load: { status: 'ready', data: { stations: event.stations } }, cursor: Math.max(restored, 0) },
        effects: noEffects,
      }
    }

    case 'NEARBY_LOAD_FAILED':
      if (load.status !== 'loading' || load.step !== 'searching') return { state, effects: noEffects }
      return { state: { ...state, load: { status: 'error', message: event.message } }, effects: noEffects }

    case 'CLICK': {
      if (load.status === 'loading') return { state, effects: noEffects }
      // エラー画面・駅が0件の画面からの CLICK は、現在地の取得からやり直す明示的な再試行。
      if (load.status === 'error' || load.data.stations.length === 0) return relocate()

      const station = load.data.stations[state.cursor]
      if (!station) return { state, effects: noEffects }
      const origin: StationsOrigin = { data: load.data, cursor: state.cursor }
      // 路線が1つしかなければ路線選択をスキップする。
      if (station.railways.length === 1) return openDepartures(origin, station, null)
      return { state: { screen: 'railways', origin, station, cursor: 0 }, effects: noEffects }
    }

    case 'DOUBLE_CLICK':
      return { state, effects: [{ type: 'EXIT' }] }

    case 'FOREGROUND_ENTER':
      // 移動している可能性があるので、アプリに戻ってきたら現在地から探し直す。
      if (load.status === 'loading') return { state, effects: noEffects }
      return relocate(load.status === 'ready' ? load.data.stations[state.cursor]?.name : undefined)

    case 'SCROLL_PREV':
    case 'SCROLL_NEXT':
      if (load.status !== 'ready') return { state, effects: noEffects }
      return { state: moveCursor(state, event.type === 'SCROLL_PREV' ? -1 : 1, load.data.stations.length), effects: noEffects }

    default:
      return { state, effects: noEffects }
  }
}

function reduceRailways(state: RailwaysState, event: AppEvent): ReduceResult {
  switch (event.type) {
    case 'CLICK':
      return openDepartures(state.origin, state.station, state.cursor)
    case 'DOUBLE_CLICK':
      return { state: backToStations(state.origin), effects: noEffects }
    case 'SCROLL_PREV':
    case 'SCROLL_NEXT':
      return { state: moveCursor(state, event.type === 'SCROLL_PREV' ? -1 : 1, state.station.railways.length), effects: noEffects }
    default:
      return { state, effects: noEffects }
  }
}

function reduceDepartures(state: DeparturesState, event: AppEvent): ReduceResult {
  const refetch = (): ReduceResult => ({
    state: { ...state, load: { status: 'loading' } },
    effects: [{ type: 'FETCH_DEPARTURES', stationId: state.railway.stationId }],
  })

  switch (event.type) {
    case 'DEPARTURES_LOADED':
      if (event.stationId !== state.railway.stationId || state.load.status !== 'loading') return { state, effects: noEffects }
      return { state: { ...state, load: { status: 'ready', data: event.data } }, effects: noEffects }

    case 'DEPARTURES_LOAD_FAILED':
      if (event.stationId !== state.railway.stationId || state.load.status !== 'loading') return { state, effects: noEffects }
      return { state: { ...state, load: { status: 'error', message: event.message } }, effects: noEffects }

    // CLICK: 表示中なら最新の発車予定に更新、エラーなら再試行。読み込み中は無視する。
    case 'CLICK':
    case 'FOREGROUND_ENTER':
      if (state.load.status === 'loading') return { state, effects: noEffects }
      return refetch()

    case 'DOUBLE_CLICK':
      if (state.railwayCursor === null) return { state: backToStations(state.origin), effects: noEffects }
      return {
        state: { screen: 'railways', origin: state.origin, station: state.station, cursor: state.railwayCursor },
        effects: noEffects,
      }

    default:
      return { state, effects: noEffects }
  }
}
