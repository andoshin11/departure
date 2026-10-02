import { describe, expect, it, vi } from 'vitest'
import { parseTrainInformation, type OdptTrainInformation } from '../src/utils/odpt-parser'
import { selectTrainInformation } from '../src/utils/departures'

// ODPT の実レスポンスの形（2026-10-03 に確認）を模したデータ
const tokyoMetroDelayed = {
  '@type': 'odpt:TrainInformation',
  'dc:date': '2026-10-03T00:24:00+09:00',
  'dct:valid': '2026-10-03T00:29:00+09:00',
  'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza',
  'odpt:operator': 'odpt.Operator:TokyoMetro',
  'odpt:trainInformationText': { ja: '21時54分頃、表参道駅で荷物挟まりのため、ダイヤが乱れています。' },
  'odpt:trainInformationCause': { ja: '荷物挟まり' },
  'odpt:trainInformationStatus': { ja: 'ダイヤ乱れ', en: 'Train schedule altered' },
}
const toeiNormal = {
  '@type': 'odpt:TrainInformation',
  'dc:date': '2026-10-03T00:24:00+09:00',
  'dct:valid': '2026-10-03T00:29:00+09:00',
  'odpt:railway': 'odpt.Railway:Toei.Asakusa',
  'odpt:operator': 'odpt.Operator:Toei',
  'odpt:timeOfOrigin': '2026-10-02T22:02:00+09:00',
  'odpt:trainInformationText': { ja: '現在、１５分以上の遅延はありません。' },
}

describe('parseTrainInformation', () => {
  it('東京メトロ（状態・原因あり）と都営（文章のみ）を読み取る', () => {
    expect(parseTrainInformation([tokyoMetroDelayed, toeiNormal])).toEqual([
      {
        railwayId: 'odpt.Railway:TokyoMetro.Ginza',
        text: '21時54分頃、表参道駅で荷物挟まりのため、ダイヤが乱れています。',
        status: 'ダイヤ乱れ',
        cause: '荷物挟まり',
        date: '2026-10-03T00:24:00+09:00',
        validUntil: '2026-10-03T00:29:00+09:00',
      },
      {
        railwayId: 'odpt.Railway:Toei.Asakusa',
        text: '現在、１５分以上の遅延はありません。',
        status: null,
        cause: null,
        date: '2026-10-03T00:24:00+09:00',
        validUntil: '2026-10-03T00:29:00+09:00',
      },
    ])
  })

  it('有効期限が無ければ validUntil: null', () => {
    expect(parseTrainInformation([{ ...toeiNormal, 'dct:valid': undefined }])[0]!.validUntil).toBeNull()
  })

  it.each([
    ['文章が無い', { ...toeiNormal, 'odpt:trainInformationText': undefined }],
    ['生成時刻が無い', { ...toeiNormal, 'dc:date': undefined }],
    ['生成時刻が日時でない', { ...toeiNormal, 'dc:date': 'yesterday' }],
    ['有効期限が日時でない', { ...toeiNormal, 'dct:valid': 'soon' }],
  ])('%s → 例外', (_label, record) => {
    expect(() => parseTrainInformation([record])).toThrow()
  })
})

describe('selectTrainInformation', () => {
  const railway = 'odpt.Railway:TokyoMetro.Ginza'
  const record = (overrides: Partial<OdptTrainInformation> = {}): OdptTrainInformation => ({
    railwayId: railway,
    text: '現在、平常どおり運転しています。',
    status: null,
    cause: null,
    date: '2026-10-03T00:24:00+09:00',
    validUntil: '2026-10-03T00:29:00+09:00',
    ...overrides,
  })
  const before = new Date('2026-10-03T00:25:00+09:00')

  it('有効期限内なら available', () => {
    expect(selectTrainInformation([record()], railway, before)).toEqual({
      kind: 'available',
      text: '現在、平常どおり運転しています。',
      status: null,
      cause: null,
      date: '2026-10-03T00:24:00+09:00',
      validUntil: '2026-10-03T00:29:00+09:00',
    })
  })

  it('有効期限を過ぎた（ちょうどを含む）情報は使わず unavailable、理由を通知する', () => {
    const onDiscard = vi.fn()
    expect(selectTrainInformation([record()], railway, new Date('2026-10-03T00:29:00+09:00'), onDiscard)).toEqual({ kind: 'unavailable' })
    expect(onDiscard).toHaveBeenCalledWith(expect.stringContaining('expired'))
  })

  it('有効期限が無い情報は使わない', () => {
    const onDiscard = vi.fn()
    expect(selectTrainInformation([record({ validUntil: null })], railway, before, onDiscard)).toEqual({ kind: 'unavailable' })
    expect(onDiscard).toHaveBeenCalledWith(expect.stringContaining('no dct:valid'))
  })

  it('別の路線・事業者全体の情報は使わず、該当が無ければ unavailable', () => {
    expect(
      selectTrainInformation([record({ railwayId: 'odpt.Railway:TokyoMetro.Hibiya' }), record({ railwayId: null })], railway, before),
    ).toEqual({
      kind: 'unavailable',
    })
    expect(selectTrainInformation([], railway, before)).toEqual({ kind: 'unavailable' })
  })

  it('同じ路線が複数あれば生成時刻が最も新しいものを使う', () => {
    const result = selectTrainInformation(
      [record({ text: '古い', date: '2026-10-03T00:20:00+09:00' }), record({ text: '新しい', date: '2026-10-03T00:24:00+09:00' })],
      railway,
      before,
    )
    expect(result).toMatchObject({ kind: 'available', text: '新しい' })
  })
})
