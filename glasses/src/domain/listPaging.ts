/** カーソル付きテキストリストの、あるページの表示範囲。 */
export interface CursorListPage {
  /** そのページに表示する項目の開始 index（全体での位置、0-based）。 */
  start: number
  /** そのページに表示する項目の終了 index（exclusive）。 */
  end: number
  /** 現在のページ番号（0-based）。 */
  page: number
  /** 全ページ数（最低 1）。 */
  totalPages: number
}

/**
 * 項目数とカーソル（全体での選択 index）から、そのカーソルが属するページの表示範囲を求める。
 *
 * List コンテナ時代の `buildListPages`（▲▼ ナビ行込みで最大20行/ページに分割）は廃止した。
 * カーソルはページをまたいで単純に ±1 されるだけの値（domain/reducer.ts 参照）なので、
 * ページは `Math.floor(cursor / maxRows)` から機械的に求まり、ナビ行という別種の行を
 * 挟む必要がない（ページ末尾で次へ進むと、そのまま次ページの先頭行に cursor が乗る）。
 *
 * itemCount が 0 の場合は 1 ページ（空ページ）を返す。
 */
export function paginateCursorList(itemCount: number, maxRows: number, cursor: number): CursorListPage {
  if (maxRows <= 0) throw new Error(`paginateCursorList: maxRows は正の数である必要があります (maxRows=${maxRows})`)

  const totalPages = Math.max(1, Math.ceil(itemCount / maxRows))
  const page = itemCount === 0 ? 0 : Math.min(Math.floor(cursor / maxRows), totalPages - 1)
  const start = page * maxRows
  const end = Math.min(start + maxRows, itemCount)
  return { start, end, page, totalPages }
}
