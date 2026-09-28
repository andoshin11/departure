import { describe, expect, it, vi } from 'vitest'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { ScreenRenderer, buildTextContainers } from '../../src/render/executor'
import { buildInternalErrorPlan } from '../../src/render/renderGuard'
import { planScreen, type ScreenPlan } from '../../src/render/plan'
import { LIST_ROWS_PER_PAGE, MAX_TEXT_BYTES } from '../../src/constants'
import { utf8ByteLength } from '../../src/format/textByteLimit'
import type { AppState } from '../../src/domain/types'
import { makeDeparture, makeDepartures, makeRailway, makeStation } from '../fixtures/data'

describe('buildTextContainers: MAX_TEXT_BYTES の fail-fast ガード', () => {
  it('body/pager がともに MAX_TEXT_BYTES 以内なら例外を投げず、content にそのまま渡した文字列が入る', () => {
    const body = 'a'.repeat(MAX_TEXT_BYTES)
    const [bodyContainer, pagerContainer] = buildTextContainers(body, 'footer')
    expect(bodyContainer.content).toBe(body)
    expect(pagerContainer.content).toBe('footer')
  })

  it('body が MAX_TEXT_BYTES を1バイトでも超えると例外を投げる', () => {
    expect(() => buildTextContainers('a'.repeat(MAX_TEXT_BYTES + 1), 'footer')).toThrow()
  })

  it('pager（footer）が MAX_TEXT_BYTES を超えると例外を投げる', () => {
    expect(() => buildTextContainers('本文', 'a'.repeat(MAX_TEXT_BYTES + 1))).toThrow()
  })

  it('日本語は .length ではなくバイト数で判定する', () => {
    const body = 'あ'.repeat(334) // 1002バイト
    expect(body.length).toBeLessThan(MAX_TEXT_BYTES)
    expect(() => buildTextContainers(body, '')).toThrow()
  })

  it('駅一覧の1ページ（長い駅名で幅いっぱい）を planScreen で組み立てた body が MAX_TEXT_BYTES に収まる', () => {
    const stations = Array.from({ length: LIST_ROWS_PER_PAGE }, (_, i) => makeStation('長'.repeat(100) + i, 2, 3999))
    const state: AppState = { screen: 'stations', load: { status: 'ready', data: { stations } }, cursor: 0 }
    const plan = planScreen(state)
    expect(plan.body.split('\n')).toHaveLength(LIST_ROWS_PER_PAGE)
    expect(() => buildTextContainers(plan.body, plan.footer ?? '')).not.toThrow()
  })

  it('発車予定画面（多方面×3本、長い行き先名）の body は、載せきれない方面を省いて MAX_TEXT_BYTES に収まる', () => {
    const station = makeStation('渋谷', 1)
    const departures = [0, 1, 2].map((i) =>
      makeDeparture(`12:0${i}`, { destination: '行き先'.repeat(30), trainType: '通勤特別快速', isLast: true, nextServiceDay: true }),
    )
    const data = makeDepartures(station.railways[0]!.stationId, {
      directions: Array.from({ length: 6 }, (_, i) => ({ directionName: `${'方面'.repeat(40)}${i}`, departures })),
    })
    const state: AppState = {
      screen: 'departures',
      origin: { data: { stations: [station] }, cursor: 0 },
      station,
      railway: station.railways[0]!,
      railwayCursor: null,
      load: { status: 'ready', data },
    }
    const plan = planScreen(state)
    expect(utf8ByteLength(plan.body)).toBeLessThanOrEqual(MAX_TEXT_BYTES)
    expect(plan.body).toMatch(/（他\d方面は表示しきれません）$/)
    expect(() => buildTextContainers(plan.body, plan.footer ?? '')).not.toThrow()
  })

  it('路線一覧・内部エラー画面も MAX_TEXT_BYTES に収まる', () => {
    const station = makeStation('渋谷', 0)
    station.railways = Array.from({ length: 10 }, (_, i) => makeRailway(i, { railwayName: '路線'.repeat(50) }))
    const railways: AppState = { screen: 'railways', origin: { data: { stations: [station] }, cursor: 0 }, station, cursor: 9 }
    const plan = planScreen(railways)
    expect(() => buildTextContainers(plan.body, plan.footer ?? '')).not.toThrow()

    const errorPlan = buildInternalErrorPlan(new TypeError('boom'))
    expect(() => buildTextContainers(errorPlan.body, errorPlan.footer ?? '')).not.toThrow()
  })
})

const NORMAL_PLAN: ScreenPlan = { kind: 'text', body: '通常の本文', footer: '通常のフッター' }

/**
 * EvenAppBridge はシングルトン（private constructor）で実インスタンス化できないため、
 * ScreenRenderer が実際に呼ぶ3メソッド（createStartUpPageContainer/rebuildPageContainer/
 * textContainerUpgrade）だけを持つモックを EvenAppBridge にキャストして渡す。
 */
function makeMockBridge(overrides: {
  createStartUpPageContainer?: ReturnType<typeof vi.fn>
  rebuildPageContainer?: ReturnType<typeof vi.fn>
  textContainerUpgrade?: ReturnType<typeof vi.fn>
} = {}): EvenAppBridge {
  return {
    createStartUpPageContainer: overrides.createStartUpPageContainer ?? vi.fn().mockResolvedValue(0),
    rebuildPageContainer: overrides.rebuildPageContainer ?? vi.fn().mockResolvedValue(true),
    textContainerUpgrade: overrides.textContainerUpgrade ?? vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge
}

describe('ScreenRenderer: bridge 呼び出しの失敗が例外化されること', () => {
  it('初回 render()（createStartUpPageContainer）が success(0) 以外を返すと例外を投げる', async () => {
    const bridge = makeMockBridge({ createStartUpPageContainer: vi.fn().mockResolvedValue(2) /* oversize */ })
    const renderer = new ScreenRenderer(bridge)
    await expect(renderer.render(NORMAL_PLAN)).rejects.toThrow()
  })

  it('初回 render() が成功すれば、2回目以降は textContainerUpgrade（upgradeText）経路が使われる', async () => {
    const textContainerUpgrade = vi.fn().mockResolvedValue(true)
    const bridge = makeMockBridge({ textContainerUpgrade })
    const renderer = new ScreenRenderer(bridge)

    await renderer.render(NORMAL_PLAN) // 初回: createStartUpPageContainer
    expect(textContainerUpgrade).not.toHaveBeenCalled()

    await renderer.render({ kind: 'text', body: '2回目の本文', footer: '2回目のフッター' })
    expect(textContainerUpgrade).toHaveBeenCalledTimes(2) // body用・pager用の2回
  })

  it('2回目以降の render()（upgradeText 経路）で body が MAX_TEXT_BYTES 超だと、bridge を呼ぶ前に例外を投げる', async () => {
    const textContainerUpgrade = vi.fn().mockResolvedValue(true)
    const bridge = makeMockBridge({ textContainerUpgrade })
    const renderer = new ScreenRenderer(bridge)

    await renderer.render(NORMAL_PLAN) // 初回で startedUp=true にする

    const oversizedPlan: ScreenPlan = { kind: 'text', body: 'a'.repeat(MAX_TEXT_BYTES + 1), footer: 'footer' }
    await expect(renderer.render(oversizedPlan)).rejects.toThrow()
    // fail-fast ガードが bridge 呼び出しより先に例外を投げるため、textContainerUpgrade は呼ばれない
    expect(textContainerUpgrade).not.toHaveBeenCalled()
  })

  it('2回目以降の render()（upgradeText 経路）で pager（footer）が MAX_TEXT_BYTES 超だと例外を投げる', async () => {
    const textContainerUpgrade = vi.fn().mockResolvedValue(true)
    const bridge = makeMockBridge({ textContainerUpgrade })
    const renderer = new ScreenRenderer(bridge)

    await renderer.render(NORMAL_PLAN)

    const oversizedPlan: ScreenPlan = { kind: 'text', body: '本文', footer: 'a'.repeat(MAX_TEXT_BYTES + 1) }
    await expect(renderer.render(oversizedPlan)).rejects.toThrow()
    expect(textContainerUpgrade).not.toHaveBeenCalled()
  })

  it('upgradeText 経路で textContainerUpgrade（body側）が false を返すと例外を投げる', async () => {
    const textContainerUpgrade = vi.fn().mockResolvedValueOnce(false) // body 呼び出しで失敗
    const bridge = makeMockBridge({ textContainerUpgrade })
    const renderer = new ScreenRenderer(bridge)

    await renderer.render(NORMAL_PLAN)
    await expect(renderer.render({ kind: 'text', body: '本文2', footer: 'フッター2' })).rejects.toThrow()
  })

  it('upgradeText 経路で textContainerUpgrade（pager側）が false を返すと例外を投げる', async () => {
    const textContainerUpgrade = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) // pager 呼び出しで失敗
    const bridge = makeMockBridge({ textContainerUpgrade })
    const renderer = new ScreenRenderer(bridge)

    await renderer.render(NORMAL_PLAN)
    await expect(renderer.render({ kind: 'text', body: '本文2', footer: 'フッター2' })).rejects.toThrow()
  })

  it('redrawCurrent()（rebuildPageContainer 経路）が false を返すと例外を投げる', async () => {
    const rebuildPageContainer = vi.fn().mockResolvedValue(false)
    const bridge = makeMockBridge({ rebuildPageContainer })
    const renderer = new ScreenRenderer(bridge)

    await renderer.render(NORMAL_PLAN) // 初回で startedUp=true にする（redrawCurrent は rebuild 経路を使うため）
    await expect(renderer.redrawCurrent(NORMAL_PLAN)).rejects.toThrow()
    expect(rebuildPageContainer).toHaveBeenCalledTimes(1)
  })

  it('redrawCurrent() が成功すれば例外を投げない', async () => {
    const bridge = makeMockBridge()
    const renderer = new ScreenRenderer(bridge)
    await renderer.render(NORMAL_PLAN)
    await expect(renderer.redrawCurrent(NORMAL_PLAN)).resolves.toBeUndefined()
  })
})
