import { describe, expect, it } from 'vitest'
import { createInitialState, initialEffects, reduce } from '../../src/domain/reducer'
import type { AppState, DeparturesState, RailwaysState, StationsState } from '../../src/domain/types'
import { makeDepartures, makeStation } from '../fixtures/data'

const shibuya = makeStation('渋谷', 3, 120)
const ebisu = makeStation('恵比寿', 1, 800)
const stations = [shibuya, ebisu]

function readyStations(cursor = 0): StationsState {
  return { screen: 'stations', load: { status: 'ready', data: { stations } }, cursor }
}

function departuresState(overrides: Partial<DeparturesState> = {}): DeparturesState {
  return {
    screen: 'departures',
    origin: { data: { stations }, cursor: 0 },
    station: shibuya,
    railway: shibuya.railways[1]!,
    railwayCursor: 1,
    load: { status: 'loading' },
    ...overrides,
  }
}

describe('起動', () => {
  it('現在地の取得から始まる', () => {
    expect(createInitialState()).toEqual({ screen: 'stations', load: { status: 'loading', step: 'locating' }, cursor: 0 })
    expect(initialEffects).toEqual([{ type: 'LOCATE' }])
  })
})

describe('stations 画面', () => {
  it('LOCATED で最寄り駅の検索に進み、FETCH_NEARBY を発行する', () => {
    const r = reduce(createInitialState(), { type: 'LOCATED', lat: 35.6, lon: 139.7 })
    expect(r.state).toMatchObject({ screen: 'stations', load: { status: 'loading', step: 'searching' } })
    expect(r.effects).toEqual([{ type: 'FETCH_NEARBY', lat: 35.6, lon: 139.7 }])
  })

  it('LOCATE_FAILED / NEARBY_LOAD_FAILED はエラー表示になる', () => {
    expect(reduce(createInitialState(), { type: 'LOCATE_FAILED', message: 'x' }).state).toMatchObject({ load: { status: 'error', message: 'x' } })
    const searching: StationsState = { screen: 'stations', load: { status: 'loading', step: 'searching' }, cursor: 0 }
    expect(reduce(searching, { type: 'NEARBY_LOAD_FAILED', message: 'y' }).state).toMatchObject({ load: { status: 'error', message: 'y' } })
  })

  it('段階が合わない結果イベント（検索中の LOCATED、取得中の NEARBY_LOADED）は無視する', () => {
    const searching: StationsState = { screen: 'stations', load: { status: 'loading', step: 'searching' }, cursor: 0 }
    expect(reduce(searching, { type: 'LOCATED', lat: 0, lon: 0 }).state).toBe(searching)
    const locating = createInitialState()
    expect(reduce(locating, { type: 'NEARBY_LOADED', stations }).state).toBe(locating)
  })

  it('NEARBY_LOADED で一覧を表示し、カーソルは先頭', () => {
    const searching: StationsState = { screen: 'stations', load: { status: 'loading', step: 'searching' }, cursor: 0 }
    expect(reduce(searching, { type: 'NEARBY_LOADED', stations }).state).toEqual(readyStations(0))
  })

  it('SCROLL で cursor が [0, 件数-1] にクランプ移動し、変化が無ければ同じ state を返す', () => {
    const s0 = readyStations(0)
    expect(reduce(s0, { type: 'SCROLL_PREV' }).state).toBe(s0)
    const s1 = reduce(s0, { type: 'SCROLL_NEXT' }).state as StationsState
    expect(s1.cursor).toBe(1)
    expect(reduce(s1, { type: 'SCROLL_NEXT' }).state).toBe(s1)
  })

  it('複数路線の駅を CLICK すると路線選択画面へ（API 呼び出しなし）', () => {
    const r = reduce(readyStations(0), { type: 'CLICK' })
    expect(r.state).toEqual({ screen: 'railways', origin: { data: { stations }, cursor: 0 }, station: shibuya, cursor: 0 })
    expect(r.effects).toEqual([])
  })

  it('路線が1つの駅を CLICK すると路線選択をスキップして発車予定を取得する', () => {
    const r = reduce(readyStations(1), { type: 'CLICK' })
    expect(r.state).toMatchObject({ screen: 'departures', station: ebisu, railway: ebisu.railways[0], railwayCursor: null, load: { status: 'loading' } })
    expect(r.effects).toEqual([{ type: 'FETCH_DEPARTURES', stationId: ebisu.railways[0]!.stationId }])
  })

  it('エラー画面・0件の画面での CLICK は現在地の取得からやり直す', () => {
    const error: StationsState = { screen: 'stations', load: { status: 'error', message: 'x' }, cursor: 0 }
    expect(reduce(error, { type: 'CLICK' })).toEqual({ state: createInitialState(), effects: [{ type: 'LOCATE' }] })
    const empty: StationsState = { screen: 'stations', load: { status: 'ready', data: { stations: [] } }, cursor: 0 }
    expect(reduce(empty, { type: 'CLICK' }).effects).toEqual([{ type: 'LOCATE' }])
  })

  it('読み込み中の CLICK は無視する', () => {
    const s = createInitialState()
    expect(reduce(s, { type: 'CLICK' })).toEqual({ state: s, effects: [] })
  })

  it('DOUBLE_CLICK で終了する', () => {
    expect(reduce(readyStations(), { type: 'DOUBLE_CLICK' }).effects).toEqual([{ type: 'EXIT' }])
  })

  it('FOREGROUND_ENTER で現在地から探し直し、選択中の駅名が新しい一覧にあればカーソルを合わせる', () => {
    const r = reduce(readyStations(1), { type: 'FOREGROUND_ENTER' })
    expect(r.state).toMatchObject({ load: { status: 'loading', step: 'locating' }, restoreName: '恵比寿' })
    expect(r.effects).toEqual([{ type: 'LOCATE' }])

    const located = reduce(r.state, { type: 'LOCATED', lat: 0, lon: 0 }).state
    const reordered = [makeStation('代官山'), makeStation('中目黒'), ebisu]
    expect(reduce(located, { type: 'NEARBY_LOADED', stations: reordered }).state).toMatchObject({ cursor: 2 })
  })

  it('FOREGROUND_ENTER 後の新しい一覧に元の駅が無ければカーソルは先頭', () => {
    const r = reduce(readyStations(1), { type: 'FOREGROUND_ENTER' })
    const located = reduce(r.state, { type: 'LOCATED', lat: 0, lon: 0 }).state
    const next = reduce(located, { type: 'NEARBY_LOADED', stations: [makeStation('代官山')] }).state as StationsState
    expect(next.cursor).toBe(0)
    expect(next.restoreName).toBeUndefined()
  })

  it('読み込み中の FOREGROUND_ENTER は無視する（二重に現在地を取得しない）', () => {
    const s = createInitialState()
    expect(reduce(s, { type: 'FOREGROUND_ENTER' }).state).toBe(s)
  })
})

describe('railways 画面', () => {
  const railways: RailwaysState = { screen: 'railways', origin: { data: { stations }, cursor: 0 }, station: shibuya, cursor: 0 }

  it('SCROLL で路線を選び、CLICK で発車予定を取得する', () => {
    const moved = reduce(reduce(railways, { type: 'SCROLL_NEXT' }).state, { type: 'SCROLL_NEXT' }).state as RailwaysState
    expect(moved.cursor).toBe(2)
    expect(reduce(moved, { type: 'SCROLL_NEXT' }).state).toBe(moved)

    const r = reduce(moved, { type: 'CLICK' })
    expect(r.state).toMatchObject({ screen: 'departures', railway: shibuya.railways[2], railwayCursor: 2 })
    expect(r.effects).toEqual([{ type: 'FETCH_DEPARTURES', stationId: shibuya.railways[2]!.stationId }])
  })

  it('DOUBLE_CLICK で駅一覧に戻り、元のカーソル位置を復元する（再取得しない）', () => {
    const r = reduce({ ...railways, origin: { data: { stations }, cursor: 1 } }, { type: 'DOUBLE_CLICK' })
    expect(r).toEqual({ state: readyStations(1), effects: [] })
  })
})

describe('departures 画面', () => {
  const stationId = shibuya.railways[1]!.stationId

  it('DEPARTURES_LOADED で表示する。stationId が違う・読み込み中でない場合は無視する', () => {
    const data = makeDepartures(stationId)
    expect(reduce(departuresState(), { type: 'DEPARTURES_LOADED', stationId, data }).state).toMatchObject({ load: { status: 'ready', data } })

    const s = departuresState()
    expect(reduce(s, { type: 'DEPARTURES_LOADED', stationId: 'other', data }).state).toBe(s)
    const ready = departuresState({ load: { status: 'ready', data } })
    expect(reduce(ready, { type: 'DEPARTURES_LOADED', stationId, data: makeDepartures(stationId) }).state).toBe(ready)
  })

  it('DEPARTURES_LOAD_FAILED でエラー表示、CLICK で再試行する', () => {
    const error = reduce(departuresState(), { type: 'DEPARTURES_LOAD_FAILED', stationId, message: 'NG' }).state
    expect(error).toMatchObject({ load: { status: 'error', message: 'NG' } })
    expect(reduce(error, { type: 'CLICK' })).toEqual({ state: departuresState(), effects: [{ type: 'FETCH_DEPARTURES', stationId }] })
  })

  it('表示中の CLICK / FOREGROUND_ENTER で最新の発車予定に更新する。読み込み中は無視する', () => {
    const ready = departuresState({ load: { status: 'ready', data: makeDepartures(stationId) } })
    expect(reduce(ready, { type: 'CLICK' }).effects).toEqual([{ type: 'FETCH_DEPARTURES', stationId }])
    expect(reduce(ready, { type: 'FOREGROUND_ENTER' }).effects).toEqual([{ type: 'FETCH_DEPARTURES', stationId }])
    const loading = departuresState()
    expect(reduce(loading, { type: 'CLICK' }).state).toBe(loading)
  })

  it('DOUBLE_CLICK で路線選択画面に戻る（選んだ路線にカーソル）', () => {
    const r = reduce(departuresState(), { type: 'DOUBLE_CLICK' })
    expect(r.state).toEqual({ screen: 'railways', origin: { data: { stations }, cursor: 0 }, station: shibuya, cursor: 1 })
  })

  it('路線選択をスキップしてきた場合、DOUBLE_CLICK で駅一覧に戻る', () => {
    const s: AppState = departuresState({ station: ebisu, railway: ebisu.railways[0]!, railwayCursor: null, origin: { data: { stations }, cursor: 1 } })
    expect(reduce(s, { type: 'DOUBLE_CLICK' }).state).toEqual(readyStations(1))
  })

  it('SCROLL は何もしない（はみ出した内容はファームウェアのネイティブスクロールに任せる）', () => {
    const s = departuresState({ load: { status: 'ready', data: makeDepartures(stationId) } })
    expect(reduce(s, { type: 'SCROLL_NEXT' }).state).toBe(s)
  })
})
