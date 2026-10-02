import { describe, expect, it } from 'vite-plus/test'
import { paginateCursorList } from '../../src/domain/listPaging'

// buildListPages（▲▼ ナビ行込みの List 専用ページング）は List コンテナ廃止に伴い削除した。
// 後継の paginateCursorList は「項目数 + 1ページの行数 + カーソル」からページ範囲を
// 機械的に求めるだけの単純な関数になったため、境界値の基本ケースのみ最小限に確認する。
// より網羅的なケースは Tester が追加する。
describe('paginateCursorList', () => {
  it('0件の場合は空ページ(page=0, totalPages=1)を返す', () => {
    expect(paginateCursorList(0, 8, 0)).toEqual({ start: 0, end: 0, page: 0, totalPages: 1 })
  })

  it('itemCount が maxRows ちょうどの場合は1ページに収まる', () => {
    expect(paginateCursorList(8, 8, 3)).toEqual({ start: 0, end: 8, page: 0, totalPages: 1 })
  })

  it('itemCount が maxRows を1件超える場合は2ページに分かれ、cursor の位置に応じて正しいページ範囲を返す', () => {
    expect(paginateCursorList(9, 8, 0)).toEqual({ start: 0, end: 8, page: 0, totalPages: 2 })
    expect(paginateCursorList(9, 8, 7)).toEqual({ start: 0, end: 8, page: 0, totalPages: 2 })
    // ページ境界: cursor がちょうど2ページ目の先頭に来る
    expect(paginateCursorList(9, 8, 8)).toEqual({ start: 8, end: 9, page: 1, totalPages: 2 })
  })

  it('maxRows が0以下の場合は例外を投げる（フォールバックせず fail-fast）', () => {
    expect(() => paginateCursorList(10, 0, 0)).toThrow()
    expect(() => paginateCursorList(10, -1, 0)).toThrow()
  })

  it('1件のみの場合は1ページ・全件表示になる', () => {
    expect(paginateCursorList(1, 8, 0)).toEqual({ start: 0, end: 1, page: 0, totalPages: 1 })
  })

  it('30件・8行/ページの場合、4ページに分かれ、cursor に応じたページ内 index が正しく求まる', () => {
    // ページ0: 0-7
    expect(paginateCursorList(30, 8, 0)).toEqual({ start: 0, end: 8, page: 0, totalPages: 4 })
    expect(paginateCursorList(30, 8, 7)).toEqual({ start: 0, end: 8, page: 0, totalPages: 4 })
    // ページ1: 8-15
    expect(paginateCursorList(30, 8, 8)).toEqual({ start: 8, end: 16, page: 1, totalPages: 4 })
    expect(paginateCursorList(30, 8, 15)).toEqual({ start: 8, end: 16, page: 1, totalPages: 4 })
    // ページ2: 16-23
    expect(paginateCursorList(30, 8, 16)).toEqual({ start: 16, end: 24, page: 2, totalPages: 4 })
    // ページ3(最終ページ): 24-29 の6件のみ（半端ページ）
    expect(paginateCursorList(30, 8, 24)).toEqual({ start: 24, end: 30, page: 3, totalPages: 4 })
    expect(paginateCursorList(30, 8, 29)).toEqual({ start: 24, end: 30, page: 3, totalPages: 4 })
  })

  it('cursor が itemCount 以上（範囲外）でも例外にせず最終ページにクランプする', () => {
    expect(paginateCursorList(9, 8, 8)).toEqual({ start: 8, end: 9, page: 1, totalPages: 2 })
    expect(paginateCursorList(9, 8, 100)).toEqual({ start: 8, end: 9, page: 1, totalPages: 2 })
    expect(paginateCursorList(5, 8, 999)).toEqual({ start: 0, end: 5, page: 0, totalPages: 1 })
  })
})
