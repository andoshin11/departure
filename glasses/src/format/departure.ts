import { pxTruncate } from '@evenrealities/pretext'
import { utf8ByteLength } from './textByteLimit'
import type { Departure, DirectionDepartures, NearbyStation, StationRailway, TrainInformation } from '@departure/shared'

/** 発車予定の各行の字下げ（方面名の行と区別するため） */
const DEPARTURE_INDENT = '　'

/** 距離の表示: 1000m 未満は m、以上は 0.1km 単位 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

/** 駅一覧の1行ぶんのラベル（カーソル記号は label.ts の formatCursorRow が付ける） */
export function stationLabel(station: NearbyStation): string {
  return `${station.name}　${formatDistance(station.distanceMeters)}`
}

/** 路線一覧の1行ぶんのラベル */
export function railwayLabel(railway: StationRailway): string {
  return `${railway.railwayName}（${railway.operatorName}）`
}

/** ISO 8601 の時刻を JST の "HH:MM" にする。端末のタイムゾーン設定に依存させない */
export function formatJstTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) throw new Error(`formatJstTime: 不正な日時です: ${iso}`)
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
}

/** 発車予定1本ぶんの行（例: "　12:03 急行 中央林間 終電"、翌運行日なら "　翌05:12 各停 浅草"） */
export function departureLine(d: Departure): string {
  const parts = [`${d.nextServiceDay ? '翌' : ''}${d.time}`]
  if (d.trainType) parts.push(d.trainType)
  parts.push(d.destination)
  if (d.isLast) parts.push('終電')
  return DEPARTURE_INDENT + parts.join(' ')
}

/**
 * 発車予定画面の本文の行。方面名の行 + その方面の発車予定（最大3本）を方面ぶん並べる。
 * 各行は rowWidthPx に収まるよう pxTruncate する（折返しで行数が崩れないようにするため）。
 *
 * Text コンテナの content には UTF-8 のバイト数上限（maxBytes）がある。方面が多い・行き先名が
 * 長い路線では全方面を載せきれないことがあるため、上限に収まる方面までを載せ、載せきれなかった
 * 方面の数を最終行で明示する（方面の途中で切ることはしない）。
 */
export function departureRows(directions: DirectionDepartures[], rowWidthPx: number, maxBytes: number): string[] {
  const groups = directions.map((dir) => {
    const lines = dir.departures.length === 0 ? [`${DEPARTURE_INDENT}該当するダイヤがありません`] : dir.departures.map(departureLine)
    return [dir.directionName, ...lines].map((line) => pxTruncate(line, rowWidthPx))
  })

  const omittedNote = (count: number) => `（他${count}方面は表示しきれません）`
  const rows: string[] = []
  for (const [i, group] of groups.entries()) {
    const remaining = groups.length - i - 1
    const candidate = [...rows, ...group, ...(remaining > 0 ? [omittedNote(remaining)] : [])]
    if (utf8ByteLength(candidate.join('\n')) > maxBytes) {
      return [...rows, omittedNote(groups.length - i)]
    }
    rows.push(...group)
  }
  return rows
}

/**
 * 発車予定画面の1行目に出す運行情報。
 * - 状態（odpt:trainInformationStatus）がある場合（東京メトロの遅延時など）は「状態（原因）」を、
 *   無い場合は運行情報の文章をそのまま使う。データの言い回しは変えない（基本ライセンス 第4条2項(2)）。
 * - データの生成時刻（dc:date）を必ず添える（開発者ガイドライン 2.1.1）。
 * - 1行に収まらない部分は pxTruncate で切り詰める（グラスの1行に収めるため。全文は ODPT の運行情報を参照）。
 */
export function trainInformationLine(info: TrainInformation, refreshing: boolean, rowWidthPx: number): string {
  let line: string
  if (refreshing) {
    line = '運行情報を更新中…'
  } else if (info.kind === 'available') {
    const summary = info.status !== null ? `${info.status}${info.cause !== null ? `（${info.cause}）` : ''}` : info.text
    line = `運行情報 ${formatJstTime(info.date)} ${summary}`
  } else if (info.kind === 'unavailable') {
    line = '運行情報はありません'
  } else {
    line = '運行情報を取得できませんでした'
  }
  return pxTruncate(line, rowWidthPx)
}
