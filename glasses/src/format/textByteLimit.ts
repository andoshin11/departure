import { MAX_TEXT_BYTES } from '../constants'

const encoder = new TextEncoder()

/**
 * 文字列の UTF-8 バイト長を返す。
 *
 * `string.length`（UTF-16 コード単位数）ではバイト数と一致しない（サロゲートペア・多くの
 * 日本語文字は1コード単位でも3バイト、絵文字は2コード単位で4バイト、等）。Text コンテナの
 * content 上限（constants.ts の MAX_TEXT_BYTES）はバイト数で決まるため、必ずこちらで判定する。
 */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).length
}

/**
 * 描画に使うテキスト（body/pager の content）が MAX_TEXT_BYTES バイトを超えていないか検証する。
 * 超えていれば例外を投げる（フォールバックせず fail-fast。呼び出し元は render/renderGuard.ts の
 * renderPlanOrShowError 経由で捕捉され、内部エラー画面の表示に切り替わる想定）。
 */
export function assertWithinTextByteLimit(text: string, label: string): void {
  const bytes = utf8ByteLength(text)
  if (bytes > MAX_TEXT_BYTES) {
    throw new Error(`${label}: UTF-8 バイト長(${bytes}バイト)が上限(${MAX_TEXT_BYTES}バイト)を超えています`)
  }
}
