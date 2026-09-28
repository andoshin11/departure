import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import type { ScreenPlan } from './plan'
import { TEXT_BODY, TEXT_PAGER } from '../constants'
import { assertWithinTextByteLimit, utf8ByteLength } from '../format/textByteLimit'

const BODY_CONTAINER_ID = 1
const BODY_CONTAINER_NAME = 'body'
const PAGER_CONTAINER_ID = 2
const PAGER_CONTAINER_NAME = 'pager'

/**
 * body/pager の content の UTF-8 バイト長チェック（constants.ts の MAX_TEXT_BYTES）。
 *
 * すべての画面の通常描画・読み込み中・エラー・render/renderGuard.ts の内部エラー画面・
 * main.ts の起動時エラー画面のすべてが最終的に ScreenRenderer の createStartup/rebuild/
 * upgradeText のいずれかを通るため、この3箇所すべてから必ずこの関数を呼ぶ（=画面の種類を
 * 問わずすべてのテキストが必ず通る唯一の関門にする）。個別の組み立て側でチェックする方式だと
 * 呼び忘れの経路が生まれ得るため、ここに1箇所だけ置く。
 */
function assertTextByteLimits(body: string, footer: string): void {
  assertWithinTextByteLimit(body, 'body')
  assertWithinTextByteLimit(footer, 'pager')
}

/** 実際に bridge へ渡す直前の body/pager の content（TextContainerProperty）を組み立てる。 */
export function buildTextContainers(body: string, footer: string): [TextContainerProperty, TextContainerProperty] {
  assertTextByteLimits(body, footer)

  const bodyContainer = new TextContainerProperty({
    ...TEXT_BODY,
    containerID: BODY_CONTAINER_ID,
    containerName: BODY_CONTAINER_NAME,
    content: body,
    isEventCapture: 1,
  })
  const pagerContainer = new TextContainerProperty({
    ...TEXT_PAGER,
    containerID: PAGER_CONTAINER_ID,
    containerName: PAGER_CONTAINER_NAME,
    content: footer,
    isEventCapture: 0,
  })
  return [bodyContainer, pagerContainer]
}

/**
 * ScreenPlan (何を描くか、の純粋な記述) を実際の bridge 呼び出しに変換する。
 *
 * List コンテナは廃止した（in-place 更新不可・初期選択 index も指定できないため）。
 * すべての画面が body+pager の Text コンテナ2つで統一されているので、初回描画のみ
 * createStartUpPageContainer を使い、以降の画面遷移・カーソル移動・ページ送りはすべて
 * textContainerUpgrade で完結させる（rebuildPageContainer によるちらつきを避け、
 * かつ選択状態を常にアプリ側の state だけで管理できるようにするため）。
 */
export class ScreenRenderer {
  private startedUp = false

  constructor(private readonly bridge: EvenAppBridge) {}

  async render(plan: ScreenPlan): Promise<void> {
    if (!this.startedUp) {
      await this.createStartup(plan)
      this.startedUp = true
      return
    }
    await this.upgradeText(plan)
  }

  /**
   * 現在の画面をそのまま再描画する（exit ダイアログ後の FOREGROUND_ENTER 対応など）。
   * ダイアログ表示時にホスト側でページが一度クリアされているため、textContainerUpgrade
   * ではなく rebuildPageContainer で作り直す必要がある。
   */
  async redrawCurrent(plan: ScreenPlan): Promise<void> {
    if (!this.startedUp) {
      await this.createStartup(plan)
      this.startedUp = true
      return
    }
    await this.rebuild(plan)
  }

  /**
   * bridge 呼び出しの失敗（createStartUpPageContainer/rebuildPageContainer/textContainerUpgrade
   * のいずれも失敗時は戻り値でしか分からない＝例外を投げない SDK）を、呼び出し元
   * （render/renderGuard.ts の renderPlanOrShowError）が検知できる例外に変換する共通処理。
   * これをしないと、bridge 呼び出しが実際には失敗しているのに render() 自体は正常終了と
   * みなされ、main.ts 側で state を「実際には描画できていない画面」に進めてしまう。
   */
  private fail(message: string): never {
    console.error(message)
    throw new Error(message)
  }

  private async createStartup(plan: ScreenPlan): Promise<void> {
    const container = new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: buildTextContainers(plan.body, plan.footer ?? ''),
    })
    const result = await this.bridge.createStartUpPageContainer(container)
    if (result !== 0) {
      this.fail(`createStartUpPageContainer failed (result=${result})`)
    }
  }

  private async rebuild(plan: ScreenPlan): Promise<void> {
    const container = new RebuildPageContainer({
      containerTotalNum: 2,
      textObject: buildTextContainers(plan.body, plan.footer ?? ''),
    })
    const ok = await this.bridge.rebuildPageContainer(container)
    if (!ok) {
      this.fail('rebuildPageContainer failed')
    }
  }

  private async upgradeText(plan: ScreenPlan): Promise<void> {
    const body = plan.body
    const footer = plan.footer ?? ''
    assertTextByteLimits(body, footer)

    const bodyOk = await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: BODY_CONTAINER_ID, containerName: BODY_CONTAINER_NAME, content: body }),
    )
    const pagerOk = await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: PAGER_CONTAINER_ID, containerName: PAGER_CONTAINER_NAME, content: footer }),
    )

    if (!bodyOk || !pagerOk) {
      const parts = [
        !bodyOk ? `body(${utf8ByteLength(body)}バイト)` : null,
        !pagerOk ? `pager(${utf8ByteLength(footer)}バイト)` : null,
      ].filter((p): p is string => p !== null)
      this.fail(`textContainerUpgrade failed: ${parts.join(', ')}`)
    }
  }
}
