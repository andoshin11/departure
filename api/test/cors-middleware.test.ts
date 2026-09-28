import { describe, expect, it } from 'vitest'
import { API_KEY_HEADER } from '@departure/shared'
import corsMiddleware from '../server/middleware/1.cors'
import { createFakeEvent } from './utils/fake-event'

describe('1.cors middleware', () => {
  it('/api/ 以外のパスには何もしない', async () => {
    const { event, res } = createFakeEvent({ url: '/health' })

    await corsMiddleware(event)

    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(res.writableEnded).toBe(false)
  })

  it('/api/ への通常リクエストには Access-Control-Allow-Origin を付与し、レスポンスは完結させない', async () => {
    const { event, res } = createFakeEvent({ url: '/api/departures' })

    await corsMiddleware(event)

    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
    expect(res.writableEnded).toBe(false)
  })

  it('OPTIONS (preflight) は認証を待たずに 204 で即座に完結させる', async () => {
    const { event, res } = createFakeEvent({ method: 'OPTIONS', url: '/api/departures' })

    await corsMiddleware(event)

    expect(res.statusCode).toBe(204)
    expect(res.writableEnded).toBe(true)
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS')
    expect(res.headers['Access-Control-Allow-Headers']).toBe(`Content-Type, ${API_KEY_HEADER}`)
  })
})
