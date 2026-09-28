import { getTextWidth, pxTruncate } from '@evenrealities/pretext'
import { CURSOR_BLANK, CURSOR_MARK } from '../constants'

const CURSOR_MARK_WIDTH = getTextWidth(CURSOR_MARK)

/**
 * 一覧・ルートのカーソル付きテキスト行を1行分作る。
 *
 * タイトルは「行の利用可能幅 - カーソル記号の幅」で pxTruncate する。選択/非選択どちらの行も
 * 同じ予算で切り詰めることで、カーソルの移動によって折返し（＝行数）が変わらないようにする。
 * List コンテナ時代の 63 バイト上限（simulator 実測の List 専用制約）は Text には適用されないため撤廃した。
 *
 * タイトルに改行が含まれていても1行の表示行という前提を壊さないよう、改行は空白に正規化する。
 *
 * pxTruncate はタイトル単体を budget（rowWidthPx - カーソル記号の幅）に収めるが、これは
 * 前置（カーソル記号 or 同じ文字数の空白）と本文の間のカーニングを考慮していない見積りのため、
 * 連結後の実測幅が rowWidthPx をわずかに超えることがある（例: 'W' の連続のように幅の広い文字が
 * 続くタイトルで、前置との連結部分のカーニングにより数px超過するケースが実際に見つかっている）。
 * そのため連結後に実測し、超えていれば本文側だけを書記素単位で1文字ずつ削って再測定する
 * （前置は一切削らない。選択/非選択で本文の切り詰め位置が結果的に変わることはあるが、
 * どちらも連結後の実測幅が必ず rowWidthPx 以下になることを保証する）。
 */
export function formatCursorRow(title: string, selected: boolean, rowWidthPx: number): string {
  const sanitizedTitle = title.replace(/\s*\n+\s*/g, ' ')
  const prefix = selected ? CURSOR_MARK : CURSOR_BLANK
  const budget = rowWidthPx - CURSOR_MARK_WIDTH
  let body = pxTruncate(sanitizedTitle, budget)

  while (body.length > 0 && getTextWidth(prefix + body) > rowWidthPx) {
    body = Array.from(body).slice(0, -1).join('')
  }

  return prefix + body
}
