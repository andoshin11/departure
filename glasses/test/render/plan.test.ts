import { describe, expect, it } from 'vite-plus/test'
import { planScreen } from '../../src/render/plan'
import { createInitialState } from '../../src/domain/reducer'
import type { AppState, DeparturesState } from '../../src/domain/types'
import { LIST_ROWS_PER_PAGE, CURSOR_MARK } from '../../src/constants'
import { makeDepartures, makeStation } from '../fixtures/data'

describe('planScreen: stations', () => {
  it('読み込み中は段階に応じた文言', () => {
    expect(planScreen(createInitialState()).body).toBe('現在地を取得中…')
    expect(planScreen({ screen: 'stations', load: { status: 'loading', step: 'searching' }, cursor: 0 }).body).toBe('最寄り駅を検索中…')
  })

  it('エラー時は理由と再試行の操作を表示する', () => {
    const plan = planScreen({ screen: 'stations', load: { status: 'error', message: '現在地を取得できませんでした' }, cursor: 0 })
    expect(plan.body).toContain('現在地を取得できませんでした')
    expect(plan.body).toContain('CLICK で再試行')
  })

  it('0件なら「見つかりません」と再検索の操作を表示する', () => {
    const plan = planScreen({ screen: 'stations', load: { status: 'ready', data: { stations: [] } }, cursor: 0 })
    expect(plan.body).toContain('駅が見つかりません')
    expect(plan.body).toContain('CLICK で再検索')
  })

  it('カーソル位置の行に ▶ が付き、1ページに収まる件数ならページ番号を出さない', () => {
    const stations = [makeStation('渋谷', 1, 100), makeStation('恵比寿', 1, 900)]
    const plan = planScreen({ screen: 'stations', load: { status: 'ready', data: { stations } }, cursor: 1 })
    expect(plan.body.split('\n')).toEqual(['  渋谷　100m', `${CURSOR_MARK}恵比寿　900m`])
    expect(plan.footer).not.toMatch(/\d+\/\d+/)
  })

  it('複数ページにまたがる場合、カーソルのあるページだけを表示しページ番号を出す', () => {
    const stations = Array.from({ length: LIST_ROWS_PER_PAGE + 1 }, (_, i) => makeStation(`駅${i}`))
    const plan = planScreen({ screen: 'stations', load: { status: 'ready', data: { stations } }, cursor: LIST_ROWS_PER_PAGE })
    expect(plan.body).toBe(`${CURSOR_MARK}駅${LIST_ROWS_PER_PAGE}　100m`)
    expect(plan.footer).toContain('2/2')
  })
})

describe('planScreen: railways', () => {
  it('路線名（事業者名）を並べ、footer に駅名を出す', () => {
    const station = makeStation('渋谷', 2)
    const plan = planScreen({ screen: 'railways', origin: { data: { stations: [station] }, cursor: 0 }, station, cursor: 0 })
    expect(plan.body.split('\n')).toEqual([`${CURSOR_MARK}0号線（テスト鉄道）`, '  1号線（テスト鉄道）'])
    expect(plan.footer).toContain('渋谷')
  })
})

describe('planScreen: departures', () => {
  const station = makeStation('渋谷', 1)
  const base: DeparturesState = {
    screen: 'departures',
    origin: { data: { stations: [station] }, cursor: 0 },
    station,
    railway: { ...station.railways[0]!, railwayName: '銀座線' },
    railwayCursor: null,
    load: { status: 'loading' },
  }

  it('読み込み中・エラーでも footer に駅名と路線名を出す', () => {
    expect(planScreen(base)).toEqual({ kind: 'text', body: '読み込み中…', footer: '渋谷 銀座線' })
    const error = planScreen({ ...base, load: { status: 'error', message: 'この路線の時刻表データがありません' } })
    expect(error.body).toContain('この路線の時刻表データがありません')
    expect(error.body).toContain('DOUBLE_CLICK で戻る')
  })

  it('方面ごとに発車予定を並べ、footer に取得時刻（JST）を出す', () => {
    const state: AppState = { ...base, load: { status: 'ready', data: makeDepartures(base.railway.stationId) } }
    const plan = planScreen(state)
    expect(plan.body.split('\n')).toEqual([
      '浅草方面',
      '　12:03 各停 浅草',
      '　12:06 各停 浅草',
      '　12:09 各停 浅草',
      '渋谷方面',
      '　12:04 各停 渋谷',
      '　12:07 各停 渋谷',
    ])
    expect(plan.footer).toContain('12:00時点')
  })
})
