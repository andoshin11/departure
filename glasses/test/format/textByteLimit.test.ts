import { describe, expect, it } from 'vitest'
import { assertWithinTextByteLimit, utf8ByteLength } from '../../src/format/textByteLimit'
import { MAX_TEXT_BYTES } from '../../src/constants'

describe('utf8ByteLength', () => {
  it('ASCII文字は .length と一致する（1文字1バイト）', () => {
    expect(utf8ByteLength('abc')).toBe(3)
    expect('abc'.length).toBe(3)
  })

  it('日本語文字は .length（UTF-16コード単位数）よりバイト数の方が大きい（1文字3バイト）', () => {
    const text = 'あいう'
    expect(text.length).toBe(3)
    expect(utf8ByteLength(text)).toBe(9)
  })

  it('絵文字（サロゲートペア）は .length が2（UTF-16コード単位2つ）だがバイト数は4', () => {
    const emoji = '😀'
    expect(emoji.length).toBe(2)
    expect(utf8ByteLength(emoji)).toBe(4)
  })

  it('空文字は0バイト', () => {
    expect(utf8ByteLength('')).toBe(0)
  })

  it('ASCII・日本語・絵文字混在でも正しい合計バイト数になる', () => {
    // "a"(1) + "あ"(3) + "😀"(4) = 8
    expect(utf8ByteLength('aあ😀')).toBe(8)
  })
})

describe('assertWithinTextByteLimit', () => {
  it('MAX_TEXT_BYTES ちょうどは例外を投げない', () => {
    const text = 'a'.repeat(MAX_TEXT_BYTES) // ASCII なので 1文字1バイト = ちょうど MAX_TEXT_BYTES バイト
    expect(utf8ByteLength(text)).toBe(MAX_TEXT_BYTES)
    expect(() => assertWithinTextByteLimit(text, 'body')).not.toThrow()
  })

  it('MAX_TEXT_BYTES を1バイトでも超えると例外を投げる', () => {
    const text = 'a'.repeat(MAX_TEXT_BYTES + 1)
    expect(utf8ByteLength(text)).toBe(MAX_TEXT_BYTES + 1)
    expect(() => assertWithinTextByteLimit(text, 'body')).toThrow()
  })

  it('例外メッセージに label・実際のバイト数・上限バイト数が含まれる', () => {
    const text = 'a'.repeat(MAX_TEXT_BYTES + 1)
    expect(() => assertWithinTextByteLimit(text, 'pager')).toThrowError(
      new RegExp(`pager.*${MAX_TEXT_BYTES + 1}.*${MAX_TEXT_BYTES}`, 's'),
    )
  })

  it('日本語で MAX_TEXT_BYTES を超える境界（文字数ベースでは短く見えても実バイト数で判定される）', () => {
    // 330文字 * 3バイト = 990バイト（MAX_TEXT_BYTES=999以内）
    const within = 'あ'.repeat(330)
    expect(() => assertWithinTextByteLimit(within, 'body')).not.toThrow()

    // 334文字 * 3バイト = 1002バイト（MAX_TEXT_BYTES超過）。文字数(334)だけ見ると
    // 短く見えるが、.length ではなく実バイト数で判定されるため例外になる。
    const over = 'あ'.repeat(334)
    expect(over.length).toBeLessThan(MAX_TEXT_BYTES)
    expect(() => assertWithinTextByteLimit(over, 'body')).toThrow()
  })

  it('空文字は例外を投げない', () => {
    expect(() => assertWithinTextByteLimit('', 'body')).not.toThrow()
  })
})
