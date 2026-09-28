import { afterEach, describe, expect, it, vi } from 'vitest'
import { H3Error } from 'h3'
import { API_KEY_HEADER } from '@departure/shared'
import { createFakeEvent } from './utils/fake-event'

const { useRuntimeConfig } = vi.hoisted(() => ({ useRuntimeConfig: vi.fn() }))
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig }))

const HEADER_NAME = API_KEY_HEADER.toLowerCase()

afterEach(() => {
  vi.resetAllMocks()
})

describe('2.auth middleware', () => {
  it('/api/ 以外のパスは認証をスキップする（runtimeConfig すら参照しない）', async () => {
    const { default: middleware } = await import('../server/middleware/2.auth')
    const { event } = createFakeEvent({ url: '/health' })

    expect(() => middleware(event)).not.toThrow()
    expect(useRuntimeConfig).not.toHaveBeenCalled()
  })

  it('OPTIONS メソッドは認証チェックより前にスキップする（apiKey 未設定でも throw しない）', async () => {
    useRuntimeConfig.mockReturnValue({ apiKey: '' })
    const { default: middleware } = await import('../server/middleware/2.auth')
    const { event } = createFakeEvent({ method: 'OPTIONS', url: '/api/departures' })

    expect(() => middleware(event)).not.toThrow()
  })

  it('サーバー側に apiKey が設定されていない場合、正しいキーが送られても 500 を返す（fail-fast）', async () => {
    useRuntimeConfig.mockReturnValue({ apiKey: '' })
    const { default: middleware } = await import('../server/middleware/2.auth')
    const { event } = createFakeEvent({
      url: '/api/departures',
      headers: { [HEADER_NAME]: 'anything' },
    })

    let caught: unknown
    try {
      await middleware(event)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(H3Error)
    expect((caught as H3Error).statusCode).toBe(500)
  })

  it('API Key ヘッダーが無い場合は 401', async () => {
    useRuntimeConfig.mockReturnValue({ apiKey: 'correct-key' })
    const { default: middleware } = await import('../server/middleware/2.auth')
    const { event } = createFakeEvent({ url: '/api/departures' })

    let caught: unknown
    try {
      await middleware(event)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(H3Error)
    expect((caught as H3Error).statusCode).toBe(401)
  })

  it('API Key が間違っている場合は 401', async () => {
    useRuntimeConfig.mockReturnValue({ apiKey: 'correct-key' })
    const { default: middleware } = await import('../server/middleware/2.auth')
    const { event } = createFakeEvent({
      url: '/api/departures',
      headers: { [HEADER_NAME]: 'wrong-key' },
    })

    let caught: unknown
    try {
      await middleware(event)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(H3Error)
    expect((caught as H3Error).statusCode).toBe(401)
  })

  it('正しい API Key の場合は通過する（何も throw しない）', async () => {
    useRuntimeConfig.mockReturnValue({ apiKey: 'correct-key' })
    const { default: middleware } = await import('../server/middleware/2.auth')
    const { event } = createFakeEvent({
      url: '/api/departures',
      headers: { [HEADER_NAME]: 'correct-key' },
    })

    expect(() => middleware(event)).not.toThrow()
  })
})
