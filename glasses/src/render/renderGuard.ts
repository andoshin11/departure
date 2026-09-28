import type { ScreenPlan } from './plan'

/**
 * reduce/planScreen（本来は純粋関数のはずだが、fail-fast 用の測定チェック等で例外を投げ得る）や
 * 実際の描画呼び出し（bridge 呼び出し）が失敗した場合に、代わりに表示する内部エラー画面。
 * state は更新前のまま保たれるので、DOUBLE_CLICK での復帰は通常どおり reduce に委ねられる。
 */
export function buildInternalErrorPlan(err: unknown): ScreenPlan {
  const name = err instanceof Error ? err.name : String(err)
  return { kind: 'text', body: `表示エラーが発生しました（内部エラー）\n${name}\n\nDOUBLE_CLICK で戻る` }
}

/**
 * `producePlan`（planScreen 呼び出し）と、それに続く実際の描画呼び出し（`renderFn`。
 * main.ts では通常 `renderer.render`、exit ダイアログ復帰時は `renderer.redrawCurrent` を渡す）の
 * 両方を try/catch し、失敗時は詳細を console.error に出したうえで内部エラー画面の描画を試みる。
 * それも失敗した場合（= 描画する手段自体が無い）は諦めて console.error のみで済ませる
 * （起動直後の createStartUpPageContainer 自体が失敗したケースなど。1回しか呼べないため）。
 *
 * 内部エラー画面自体も同じ `renderFn` で描画する（redrawCurrent が必要な文脈——ホスト側で
 * ページが一度クリアされている——では、エラー画面の描画も rebuild 系でなければ失敗するため）。
 *
 * 呼び出し元は戻り値の ok で、続く state 更新・effects 実行を行ってよいかを判断する。
 *
 * SDK 初期化（waitForEvenAppBridge）を伴う main.ts から分離してあるため、
 * この関数自体は import するだけで副作用を起こさず、単体でテストできる。
 */
export async function renderPlanOrShowError(
  producePlan: () => ScreenPlan,
  renderFn: (plan: ScreenPlan) => Promise<void>,
  label: string,
): Promise<boolean> {
  let plan: ScreenPlan
  try {
    plan = producePlan()
  } catch (err) {
    console.error(`${label}: planScreen failed:`, err)
    await showInternalErrorOrGiveUp(renderFn, err, label)
    return false
  }

  try {
    await renderFn(plan)
    return true
  } catch (err) {
    console.error(`${label}: render failed:`, err)
    await showInternalErrorOrGiveUp(renderFn, err, label)
    return false
  }
}

async function showInternalErrorOrGiveUp(renderFn: (plan: ScreenPlan) => Promise<void>, err: unknown, label: string): Promise<void> {
  try {
    await renderFn(buildInternalErrorPlan(err))
  } catch (renderErr) {
    console.error(`${label}: failed to render internal error screen (createStartUpPageContainer itself may have failed):`, renderErr)
  }
}
