import { describe, expect, it, vi } from 'vitest'
import { AppLocationAccuracy } from '@evenrealities/even_hub_sdk'
import { LocationError, locate, parseFixedLocation } from '../../src/location/locate'
import { LOCATION_TIMEOUT_MS } from '../../src/constants'

describe('locate', () => {
  it('高精度・タイムアウト付きで現在地を取得する', async () => {
    const getAppLocation = vi.fn().mockResolvedValue({ latitude: 35.1, longitude: 139.2 })
    await expect(locate({ getAppLocation })).resolves.toEqual({ lat: 35.1, lon: 139.2 })
    expect(getAppLocation).toHaveBeenCalledWith({ accuracy: AppLocationAccuracy.High, timeoutMs: LOCATION_TIMEOUT_MS })
  })

  it('null（取得できない）・例外はいずれも LocationError', async () => {
    await expect(locate({ getAppLocation: vi.fn().mockResolvedValue(null) })).rejects.toBeInstanceOf(LocationError)
    await expect(locate({ getAppLocation: vi.fn().mockRejectedValue(new Error('denied')) })).rejects.toThrow('denied')
  })
})

describe('parseFixedLocation', () => {
  it('"緯度,経度" を解釈する（空白は許容）', () => {
    expect(parseFixedLocation('35.658, 139.7016')).toEqual({ lat: 35.658, lon: 139.7016 })
  })

  it.each(['35.6', '35.6,abc', '1,2,3', '91,0', '0,181', ''])('不正な値 %j は例外', (value) => {
    expect(() => parseFixedLocation(value)).toThrow()
  })
})
