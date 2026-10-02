import { OsEventTypeList, waitForEvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { createApiClient } from './api/client'
import { NEARBY_RADIUS_METERS } from './constants'
import { createInitialState, initialEffects, reduce } from './domain/reducer'
import type { AppEvent, AppState, Effect } from './domain/types'
import { MissingEnvError, readEnvConfig } from './env'
import { locate, parseFixedLocation, type Coordinates } from './location/locate'
import { planScreen } from './render/plan'
import { ScreenRenderer } from './render/executor'
import { renderPlanOrShowError } from './render/renderGuard'

// 内部シグナル: shutDownPageContainer(1) の確認ダイアログ周りのイベント。
// reducer には渡さず、main.ts の中だけで処理する（ダイアログ表示/キャンセル時に
// foreground イベントの意味が反転する既知の挙動。even-hatena-reader と同じ扱い）。
type InternalSignal = { type: 'EXIT_DIALOG_FOREGROUND' } | { type: 'EXIT_DIALOG_CANCELLED' }

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  // CLICK_EVENT = 0 は protobuf のゼロ値省略により undefined で届く。
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

function normalizeEvent(event: EvenHubEvent, exitDialogPending: boolean): AppEvent | InternalSignal | null {
  // List コンテナは使わない（すべて Text の body+pager のみ）ため、listEvent は判定しない。
  const textType = eventTypeOf(event.textEvent)
  const sysType = eventTypeOf(event.sysEvent)

  if (exitDialogPending) {
    if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) return { type: 'EXIT_DIALOG_FOREGROUND' }
    if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) return { type: 'EXIT_DIALOG_CANCELLED' }
    if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT) return null // 本当に終了する。片付けることは無い
  }

  // 非0の明示的な type を持つイベントを先に判定する。CLICK は type が省略され得る値なので、必ず最後に判定すること。
  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    return { type: 'DOUBLE_CLICK' }
  }
  if (textType === OsEventTypeList.SCROLL_TOP_EVENT) return { type: 'SCROLL_PREV' }
  if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) return { type: 'SCROLL_NEXT' }
  if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) return { type: 'FOREGROUND_ENTER' }
  if (textType === OsEventTypeList.CLICK_EVENT || sysType === OsEventTypeList.CLICK_EVENT) return { type: 'CLICK' }
  return null
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function main() {
  const bridge = await waitForEvenAppBridge()
  const renderer = new ScreenRenderer(bridge)

  let env
  let fixedLocation: Coordinates | null
  try {
    env = readEnvConfig()
    fixedLocation = env.devFixedLocation ? parseFixedLocation(env.devFixedLocation) : null
  } catch (err) {
    console.error(err instanceof MissingEnvError ? err.message : err)
    // createStartUpPageContainer は1回だけ呼べるので、エラー画面もこの経路で描画する。
    await renderer.render({ kind: 'text', body: errorMessage(err) })
    return
  }
  if (fixedLocation) console.warn('[dev] VITE_DEV_FIXED_LOCATION が設定されているため、現在地を固定しています:', fixedLocation)

  const api = createApiClient(env.apiBaseUrl, env.apiKey)

  let state: AppState = createInitialState()
  let exitDialogPending = false
  // 運行情報の有効期限に INFO_EXPIRED を届けるタイマー。予約し直すときは前のものを取り消す
  // （取り消し漏れで古いタイマーが届いても、reducer が validUntil を照合して無視する）。
  let infoExpiryTimer: ReturnType<typeof setTimeout> | undefined

  function runEffects(effects: Effect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'LOCATE':
          ;(fixedLocation ? Promise.resolve(fixedLocation) : locate(bridge))
            .then((c) => dispatch({ type: 'LOCATED', lat: c.lat, lon: c.lon }))
            .catch((err) => {
              console.error('locate failed:', err)
              dispatch({ type: 'LOCATE_FAILED', message: errorMessage(err) })
            })
          break
        case 'FETCH_NEARBY':
          api
            .fetchNearbyStations(effect.lat, effect.lon, NEARBY_RADIUS_METERS)
            .then((res) => dispatch({ type: 'NEARBY_LOADED', stations: res.stations }))
            .catch((err) => {
              console.error('fetchNearbyStations failed:', err)
              dispatch({ type: 'NEARBY_LOAD_FAILED', message: errorMessage(err) })
            })
          break
        case 'FETCH_DEPARTURES':
          api
            .fetchDepartures(effect.stationId)
            .then((data) => dispatch({ type: 'DEPARTURES_LOADED', stationId: effect.stationId, data }))
            .catch((err) => {
              console.error(`fetchDepartures(${effect.stationId}) failed:`, err)
              dispatch({ type: 'DEPARTURES_LOAD_FAILED', stationId: effect.stationId, message: errorMessage(err) })
            })
          break
        case 'SCHEDULE_INFO_EXPIRY': {
          clearTimeout(infoExpiryTimer)
          // 期限ちょうどに取り直すと ODPT 側の更新前の情報が返ることがあるため、少しだけ遅らせる
          const delayMs = Math.max(Date.parse(effect.validUntil) - Date.now(), 0) + 1000
          infoExpiryTimer = setTimeout(
            () => dispatch({ type: 'INFO_EXPIRED', stationId: effect.stationId, validUntil: effect.validUntil }),
            delayMs,
          )
          break
        }
        case 'EXIT':
          exitDialogPending = true
          void bridge.shutDownPageContainer(1)
          break
      }
    }
  }

  // SDK 呼び出しはすべてこの Promise チェーンを通して直列化する。
  // 連打やイベントの重複発火があっても bridge への書き込みが競合しない。
  let chain: Promise<unknown> = Promise.resolve()
  function dispatch(event: AppEvent): void {
    chain = chain
      .then(async () => {
        // planScreen（fail-fast の測定チェックを含む）と renderer.render（bridge 呼び出し）の
        // 両方が成功して初めて state を更新する（state は常に「実際に描画できた画面」だけを指す）。
        const { state: nextState, effects } = reduce(state, event)

        if (nextState === state) {
          // カーソルが境界でクランプされた等、見た目上の変化が無いケース。再描画は省略する。
          runEffects(effects)
          return
        }

        const ok = await renderPlanOrShowError(
          () => planScreen(nextState),
          (plan) => renderer.render(plan),
          `dispatch(${event.type})`,
        )
        if (!ok) return

        state = nextState
        runEffects(effects)
      })
      .catch((err) => console.error('dispatch failed:', err))
  }

  const initialOk = await renderPlanOrShowError(
    () => planScreen(state),
    (plan) => renderer.render(plan),
    'initial render',
  )
  if (initialOk) runEffects(initialEffects)

  const unsubscribe = bridge.onEvenHubEvent((event) => {
    const signal = normalizeEvent(event, exitDialogPending)
    if (!signal) return

    if (signal.type === 'EXIT_DIALOG_FOREGROUND') {
      // ダイアログが表示された合図。ホスト側でページは一度クリアされているので、
      // 現在の画面をそのまま rebuild して復旧する（reducer には通さない）。
      chain = chain
        .then(() =>
          renderPlanOrShowError(
            () => planScreen(state),
            (plan) => renderer.redrawCurrent(plan),
            'redraw after exit dialog',
          ),
        )
        .catch((err) => console.error('redraw after exit dialog failed:', err))
      return
    }
    if (signal.type === 'EXIT_DIALOG_CANCELLED') {
      exitDialogPending = false
      return
    }
    dispatch(signal)
  })

  window.addEventListener('beforeunload', () => unsubscribe())
}

main().catch((err) => console.error('fatal error during startup:', err))
