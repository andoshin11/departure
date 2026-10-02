import { afterEach, describe, expect, it, vi } from 'vitest'
import { cached } from '../src/utils/kv-cache'
import { createFakeKv } from './utils/fake-kv'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cached', () => {
  const options = { name: 'test', key: 'k', maxAgeSeconds: 60 }

  it('初回は load の結果を保存して返し、期限内は load を呼ばずに保存した値を返す', async () => {
    const { kv, store } = createFakeKv()
    let now = 1_000_000
    const load = vi.fn(async () => ({ value: 1 }))

    expect(await cached(kv, { ...options, now: () => now }, load)).toEqual({ value: 1 })
    expect([...store.keys()]).toEqual(['v1:test:k'])

    now += 59_999
    expect(await cached(kv, { ...options, now: () => now }, load)).toEqual({ value: 1 })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('期限を過ぎた値は KV に残っていても使わず、load し直す（KV の結果整合で古い値が返る場合）', async () => {
    const { kv } = createFakeKv()
    let now = 1_000_000
    let n = 0
    const load = vi.fn(async () => ++n)

    await cached(kv, { ...options, now: () => now }, load)
    now += 60_000
    expect(await cached(kv, { ...options, now: () => now }, load)).toBe(2)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('書き込みに失敗しても結果は返し、ログに残す', async () => {
    const { kv, failPut } = createFakeKv()
    failPut(new Error('429 Too Many Requests'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await cached(kv, options, async () => 'value')).toBe('value')
    expect(error).toHaveBeenCalledWith('[cache] failed to write: key=v1:test:k', expect.any(Error))
  })

  it('load の失敗はキャッシュせずにそのまま投げる', async () => {
    const { kv, store } = createFakeKv()

    await expect(
      cached(kv, options, async () => {
        throw new Error('upstream')
      }),
    ).rejects.toThrow('upstream')
    expect(store.size).toBe(0)
  })

  it('想定外の形式のエントリは実装のバグとして投げる', async () => {
    const { kv, store } = createFakeKv()
    store.set('v1:test:k', JSON.stringify({ value: 1 }))

    await expect(cached(kv, options, async () => 2)).rejects.toThrow('[cache] unexpected entry format: key=v1:test:k')
  })
})
