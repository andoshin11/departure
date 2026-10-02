import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildInternalErrorPlan, renderPlanOrShowError } from '../../src/render/renderGuard'
import type { ScreenPlan } from '../../src/render/plan'

const NORMAL_PLAN: ScreenPlan = { kind: 'text', body: '通常の画面' }

describe('buildInternalErrorPlan', () => {
  it('Error インスタンスなら name を含み、DOUBLE_CLICK での戻り方を案内する内部エラー画面になる', () => {
    const plan = buildInternalErrorPlan(new TypeError('boom'))
    expect(plan.kind).toBe('text')
    expect(plan.body).toContain('表示エラーが発生しました（内部エラー）')
    expect(plan.body).toContain('TypeError')
    expect(plan.body).toContain('DOUBLE_CLICK で戻る')
  })

  it('Error でない値（文字列等）を投げた場合も String化した内容を含む', () => {
    const plan = buildInternalErrorPlan('boom-string')
    expect(plan.body).toContain('boom-string')
    expect(plan.body).toContain('DOUBLE_CLICK で戻る')
  })
})

describe('renderPlanOrShowError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('producePlan/renderFn がともに成功: renderFn は通常 plan で1回だけ呼ばれ、true を返す', async () => {
    const producePlan = vi.fn(() => NORMAL_PLAN)
    const renderFn = vi.fn<(plan: ScreenPlan) => Promise<void>>().mockResolvedValue(undefined)

    const ok = await renderPlanOrShowError(producePlan, renderFn, 'label')

    expect(ok).toBe(true)
    expect(producePlan).toHaveBeenCalledTimes(1)
    expect(renderFn).toHaveBeenCalledTimes(1)
    expect(renderFn).toHaveBeenNthCalledWith(1, NORMAL_PLAN)
  })

  it('producePlan が throw: renderFn は内部エラー画面で1回だけ呼ばれ、false を返す（通常 plan は一度も描画されない）', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new RangeError('plan boom')
    const producePlan = vi.fn(() => {
      throw err
    })
    const renderFn = vi.fn<(plan: ScreenPlan) => Promise<void>>().mockResolvedValue(undefined)

    const ok = await renderPlanOrShowError(producePlan, renderFn, 'my-label')

    expect(ok).toBe(false)
    expect(renderFn).toHaveBeenCalledTimes(1)
    const [calledWith] = renderFn.mock.calls[0]
    expect(calledWith.body).toContain('RangeError')
    expect(calledWith.body).toContain('DOUBLE_CLICK で戻る')
    expect(calledWith).not.toBe(NORMAL_PLAN)
    expect(consoleError).toHaveBeenCalled()
    expect(
      consoleError.mock.calls.some((args) => String(args[0]).includes('my-label') && String(args[0]).includes('planScreen failed')),
    ).toBe(true)
  })

  it('producePlan は成功・renderFn が reject: (通常 plan → 内部エラー plan) の順に2回呼ばれ、false を返す', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderErr = new Error('render boom')
    const producePlan = vi.fn(() => NORMAL_PLAN)
    const renderFn = vi.fn<(plan: ScreenPlan) => Promise<void>>().mockRejectedValueOnce(renderErr).mockResolvedValueOnce(undefined)

    const ok = await renderPlanOrShowError(producePlan, renderFn, 'label')

    expect(ok).toBe(false)
    expect(renderFn).toHaveBeenCalledTimes(2)
    expect(renderFn).toHaveBeenNthCalledWith(1, NORMAL_PLAN)
    const [secondCallPlan] = renderFn.mock.calls[1]
    expect(secondCallPlan.body).toContain('Error')
    expect(secondCallPlan.body).toContain('DOUBLE_CLICK で戻る')
    expect(consoleError).toHaveBeenCalled()
    expect(consoleError.mock.calls.some((args) => String(args[0]).includes('render failed'))).toBe(true)
  })

  it('内部エラー画面の描画も失敗する（renderFn が常に reject）: 諦めて false を返し、両方のエラーをログする', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const planErr = new Error('plan boom')
    const renderErr = new Error('render boom (even for error screen)')
    const producePlan = vi.fn(() => {
      throw planErr
    })
    const renderFn = vi.fn<(plan: ScreenPlan) => Promise<void>>().mockRejectedValue(renderErr)

    const ok = await renderPlanOrShowError(producePlan, renderFn, 'startup')

    expect(ok).toBe(false)
    // 内部エラー画面を描画しようとした1回だけ呼ばれる（通常 plan は producePlan が throw したので存在しない）
    expect(renderFn).toHaveBeenCalledTimes(1)
    const [calledWith] = renderFn.mock.calls[0]
    expect(calledWith.body).toContain('Error')

    // planScreen failed のログと、内部エラー画面の描画そのものが失敗したログの両方が出る
    expect(
      consoleError.mock.calls.some((args) => String(args[0]).includes('startup') && String(args[0]).includes('planScreen failed')),
    ).toBe(true)
    expect(
      consoleError.mock.calls.some(
        (args) => String(args[0]).includes('startup') && String(args[0]).includes('failed to render internal error screen'),
      ),
    ).toBe(true)
  })
})
