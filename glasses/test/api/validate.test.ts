import { describe, expect, it } from 'vite-plus/test'
import { validateDeparturesResponse, validateNearbyStationsResponse } from '../../src/api/validate'
import { ApiError } from '../../src/api/errors'
import { makeDepartures, makeStation } from '../fixtures/data'

describe('validateNearbyStationsResponse', () => {
  it('正常系はそのまま返す', () => {
    const body = { stations: [makeStation('渋谷', 2)] }
    expect(validateNearbyStationsResponse(body)).toEqual(body)
  })

  it.each([
    ['stations が配列でない', { stations: {} }, 'stations'],
    ['駅名が無い', { stations: [{ ...makeStation('渋谷'), name: undefined }] }, 'stations[0].name'],
    ['路線が0件', { stations: [{ ...makeStation('渋谷'), railways: [] }] }, 'stations[0].railways (empty)'],
    [
      '路線の stationId が数値',
      { stations: [{ ...makeStation('渋谷'), railways: [{ ...makeStation('渋谷').railways[0], stationId: 1 }] }] },
      'stations[0].railways[0].stationId',
    ],
    ['距離が文字列', { stations: [{ ...makeStation('渋谷'), distanceMeters: '1' }] }, 'stations[0].distanceMeters'],
  ])('%s → どのフィールドかを含む ApiError', (_label, body, field) => {
    expect(() => validateNearbyStationsResponse(body)).toThrow(ApiError)
    expect(() => validateNearbyStationsResponse(body)).toThrow(field)
  })
})

describe('validateDeparturesResponse', () => {
  const id = 'odpt.Station:A.B.C'

  it('正常系はそのまま返す（trainType: null を含む）', () => {
    const body = makeDepartures(id)
    body.directions[0]!.departures[0]!.trainType = null
    expect(validateDeparturesResponse(body)).toEqual(body)
  })

  it.each([
    ['directions が無い', { ...makeDepartures(id), directions: undefined }, 'directions'],
    [
      'trainType が数値',
      {
        ...makeDepartures(id),
        directions: [
          { directionName: 'x', departures: [{ time: '12:00', destination: 'a', trainType: 1, nextServiceDay: false, isLast: false }] },
        ],
      },
      'directions[0].departures[0].trainType',
    ],
    [
      'isLast が無い',
      {
        ...makeDepartures(id),
        directions: [{ directionName: 'x', departures: [{ time: '12:00', destination: 'a', trainType: null, nextServiceDay: false }] }],
      },
      'directions[0].departures[0].isLast',
    ],
    ['generatedAt が無い', { ...makeDepartures(id), generatedAt: undefined }, 'response.generatedAt'],
  ])('%s → ApiError', (_label, body, field) => {
    expect(() => validateDeparturesResponse(body)).toThrow(field)
  })
})
