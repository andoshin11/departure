import { describe, expect, it } from 'vitest'
import { timingSafeEqualString } from '../src/utils/timing-safe-equal'

describe('timingSafeEqualString', () => {
  it('同じ文字列同士は true', () => {
    expect(timingSafeEqualString('dummy-secret-key', 'dummy-secret-key')).toBe(true)
  })

  it('異なる文字列同士は false', () => {
    expect(timingSafeEqualString('dummy-secret-key', 'dummy-secret-kex')).toBe(false)
  })

  it('長さが異なる文字列同士は false', () => {
    expect(timingSafeEqualString('short', 'much-longer-string')).toBe(false)
  })

  it('一方が空文字列の場合は false', () => {
    expect(timingSafeEqualString('', 'non-empty')).toBe(false)
    expect(timingSafeEqualString('non-empty', '')).toBe(false)
  })

  it('両方とも空文字列の場合は true', () => {
    expect(timingSafeEqualString('', '')).toBe(true)
  })

  it('マルチバイト文字（日本語）でも正しく比較できる', () => {
    expect(timingSafeEqualString('ダミーキー', 'ダミーキー')).toBe(true)
    expect(timingSafeEqualString('ダミーキー', 'ダミーキイ')).toBe(false)
  })
})
