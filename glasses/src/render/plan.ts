import { measureTextWrap, pxTruncate } from '@evenrealities/pretext'
import type { AppState } from '../domain/types'
import { paginateCursorList } from '../domain/listPaging'
import { formatCursorRow } from '../format/label'
import { departureRows, formatJstTime, railwayLabel, stationLabel } from '../format/departure'
import { LIST_ROWS_PER_PAGE, MAX_TEXT_BYTES, NEARBY_RADIUS_METERS, TEXT_INNER_WIDTH } from '../constants'

export type ScreenPlan = { kind: 'text'; body: string; footer?: string }

const LOCATING_TEXT = '現在地を取得中…'
const SEARCHING_TEXT = '最寄り駅を検索中…'
const LOADING_TEXT = '読み込み中…'

const STATIONS_HINT = 'CLICK で選択 / DOUBLE_CLICK で終了'
const RAILWAYS_HINT = 'CLICK で選択 / DOUBLE_CLICK で戻る'
const DEPARTURES_HINT = 'CLICK で更新'
const ERROR_HINT_STATIONS = '\n\nCLICK で再試行 / DOUBLE_CLICK で終了'
const ERROR_HINT_BACK = '\n\nCLICK で再試行 / DOUBLE_CLICK で戻る'

/** pager は1行しか表示できないため、はみ出す分は切り詰める */
function fitFooter(text: string): string {
  return pxTruncate(text, TEXT_INNER_WIDTH)
}

/**
 * 1行ずつ幅に収めたはずの行を連結し、想定外の折返しが発生していないかを measureTextWrap で
 * 最終確認する。折返しが起きた場合は pxTruncate の見積りが実際のフォント幅とズレているバグなので、
 * 崩れたレイアウトを表示せず例外で fail-fast する。
 */
function joinRowsWithoutWrap(rows: string[]): string {
  const body = rows.join('\n')
  if (rows.length === 0) return body
  const measured = measureTextWrap(body, TEXT_INNER_WIDTH)
  if (measured.lineCount > rows.length) {
    throw new Error(
      `行がコンテナ幅に収まらず折り返しが発生しました（想定行数=${rows.length}, 実測行数=${measured.lineCount}）。` +
        'pxTruncate の切り詰め幅を見直してください。',
    )
  }
  return body
}

/** カーソル付きリスト（駅一覧・路線一覧）の1ページぶんの本文と、ページ番号付きの footer を組み立てる */
function planCursorList(labels: string[], cursor: number, hint: string, heading?: string): ScreenPlan {
  const { start, end, page, totalPages } = paginateCursorList(labels.length, LIST_ROWS_PER_PAGE, cursor)
  const rows = labels.slice(start, end).map((label, i) => formatCursorRow(label, start + i === cursor, TEXT_INNER_WIDTH))
  const pageInfo = totalPages > 1 ? `${page + 1}/${totalPages}　` : ''
  const footer = fitFooter(`${heading ? `${heading}　` : ''}${pageInfo}${hint}`)
  return { kind: 'text', body: joinRowsWithoutWrap(rows), footer }
}

/**
 * AppState から「何を描画すべきか」を計算する純粋関数。SDK 呼び出しは一切行わない。
 * 実際の bridge 呼び出しは render/executor.ts が担当する。
 * すべての画面が body(isEventCapture=1) + pager の Text コンテナ2つで表現される。
 */
export function planScreen(state: AppState): ScreenPlan {
  switch (state.screen) {
    case 'stations': {
      const { load } = state
      if (load.status === 'loading') return { kind: 'text', body: load.step === 'locating' ? LOCATING_TEXT : SEARCHING_TEXT }
      if (load.status === 'error') return { kind: 'text', body: `${load.message}${ERROR_HINT_STATIONS}` }
      const { stations } = load.data
      if (stations.length === 0) {
        return {
          kind: 'text',
          body: `半径${NEARBY_RADIUS_METERS}m以内に駅が見つかりません${ERROR_HINT_STATIONS.replace('再試行', '再検索')}`,
        }
      }
      return planCursorList(stations.map(stationLabel), state.cursor, STATIONS_HINT)
    }

    case 'railways':
      return planCursorList(state.station.railways.map(railwayLabel), state.cursor, RAILWAYS_HINT, state.station.name)

    case 'departures': {
      const heading = `${state.station.name} ${state.railway.railwayName}`
      const { load } = state
      if (load.status === 'loading') return { kind: 'text', body: LOADING_TEXT, footer: fitFooter(heading) }
      if (load.status === 'error') return { kind: 'text', body: `${load.message}${ERROR_HINT_BACK}`, footer: fitFooter(heading) }
      const footer = fitFooter(`${heading}　${formatJstTime(load.data.generatedAt)}時点　${DEPARTURES_HINT}`)
      return { kind: 'text', body: joinRowsWithoutWrap(departureRows(load.data.directions, TEXT_INNER_WIDTH, MAX_TEXT_BYTES)), footer }
    }
  }
}
