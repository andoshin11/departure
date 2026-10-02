// yarn demo:gif から呼ばれる。シミュレーターの Automation API でシナリオどおりに操作しながら
// グラス画面を連続キャプチャし、操作名と解説の字幕を付けた GIF を作る（実機の画面は撮れないため）。
//
// 前提: api/ の dev サーバー（glasses/.env の VITE_API_BASE_URL）が起動していること、ffmpeg があること。
// glasses の dev サーバーとシミュレーターはこのスクリプトが専用ポートで起動・終了する。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'

/** デモの現在地（銀座駅付近。1km 以内に駅が多く、銀座駅は3路線が乗り入れる） */
const DEMO_LOCATION = '35.6717,139.7650'
const DEV_PORT = 5174
const AUTOMATION_PORT = 9898
const CAPTURE_INTERVAL_MS = 100
const GIF_FPS = 10

const DISPLAY_W = 576
const DISPLAY_H = 288
const PAD = 12
const CAPTION_H = 84
const FONT_BOLD = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
const FONT_REGULAR = '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'

type Action = 'up' | 'down' | 'click' | 'double_click'

interface Step {
  /** 送る入力。省略時は起動直後の画面を待つ */
  action?: Action
  /** 字幕（1行目: 操作名、2行目: 解説）。省略時は直前の字幕を引き継ぐ */
  caption?: [string, string]
  /** 入力後に画面が変わるまで待つ（API 呼び出しを伴う遷移） */
  waitForChange?: boolean
  /** 画面が落ち着いてから次の操作までの表示時間 */
  holdMs: number
}

const SCENARIO: Step[] = [
  { caption: ['起動', '現在地から 1km 以内の駅を近い順に表示'], waitForChange: true, holdMs: 2500 },
  { action: 'down', caption: ['SCROLL ↓', 'カーソルを動かして駅を選ぶ'], holdMs: 600 },
  { action: 'down', holdMs: 600 },
  { action: 'up', holdMs: 600 },
  { action: 'up', holdMs: 1000 },
  { action: 'click', caption: ['CLICK', '駅を決定すると乗り入れている路線の一覧へ'], waitForChange: true, holdMs: 1800 },
  { action: 'down', caption: ['SCROLL ↓', '路線を選ぶ'], holdMs: 1000 },
  { action: 'click', caption: ['CLICK', '方面ごとに次に発車する列車を3本ずつ表示'], waitForChange: true, holdMs: 3500 },
  { action: 'click', caption: ['CLICK', '最新の発車予定に更新'], holdMs: 2000 },
  { action: 'double_click', caption: ['DOUBLE_CLICK', 'ひとつ前の画面に戻る'], waitForChange: true, holdMs: 1200 },
  { action: 'double_click', waitForChange: true, holdMs: 2500 },
]

const root = path.resolve(import.meta.dirname, '..')
const workDir = path.join(root, '.demo')
const output = path.resolve(process.argv[2] ?? path.join(root, '..', 'docs', 'demo.gif'))
const automation = `http://127.0.0.1:${AUTOMATION_PORT}/api`

const children: ChildProcess[] = []
function startDetached(command: string, args: string[], env: NodeJS.ProcessEnv = {}): void {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'ignore', detached: true })
  children.push(child)
}
function stopChildren(): void {
  for (const child of children) {
    if (child.pid !== undefined && child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        // 既に終了している
      }
    }
  }
}
process.on('exit', stopChildren)
process.on('SIGINT', () => process.exit(130))

function fail(message: string): never {
  console.error(`[demo-gif] ${message}`)
  process.exit(1)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitUntil(label: string, timeoutMs: number, check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return
    await sleep(200)
  }
  fail(`${label} がタイムアウトしました（${timeoutMs}ms）`)
}

// ---- 事前チェック ----
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) fail('ffmpeg が見つかりません（brew install ffmpeg）')
const apiBaseUrl = loadEnv('development', root, 'VITE_').VITE_API_BASE_URL
if (!apiBaseUrl) fail('VITE_API_BASE_URL が設定されていません。glasses/.env を用意してください。')
await fetch(apiBaseUrl).catch(() =>
  fail(`api/ に接続できません（${apiBaseUrl}）。先に yarn workspace @departure/api dev を起動してください。`),
)
if (await fetch(`${automation}/ping`).catch(() => null))
  fail(`ポート ${AUTOMATION_PORT} で既にシミュレーターが動いています。終了してから実行してください。`)

// ---- 起動 ----
// --mode demo にして .env.development（開発者ごとの VITE_DEV_FIXED_LOCATION）を読ませない。
// development モードのままだと .env.development の値が環境変数より優先され、デモの現在地にならない。
startDetached(path.join(root, 'node_modules/.bin/vp'), ['dev', '--mode', 'demo', '--port', String(DEV_PORT), '--strictPort'], {
  VITE_DEV_FIXED_LOCATION: DEMO_LOCATION,
})
await waitUntil('glasses dev サーバーの起動', 30_000, async () => (await fetch(`http://localhost:${DEV_PORT}`)).ok)
startDetached(path.join(root, 'node_modules/.bin/evenhub-simulator'), [
  `http://localhost:${DEV_PORT}`,
  '--automation-port',
  String(AUTOMATION_PORT),
  '--no-glow',
])
await waitUntil('シミュレーターの起動', 30_000, async () => (await fetch(`${automation}/ping`)).ok)

// ---- 撮影 ----
interface Frame {
  t: number
  hash: string
  png: Buffer
}
const frames: Frame[] = []
const captions: { t: number; caption: [string, string] }[] = []
const startedAt = Date.now()
let recording = true

async function screenshot(): Promise<Frame> {
  const res = await fetch(`${automation}/screenshot/glasses`)
  if (!res.ok) fail(`スクリーンショットの取得に失敗しました: HTTP ${res.status}`)
  const png = Buffer.from(await res.arrayBuffer())
  return { t: Date.now() - startedAt, hash: createHash('sha1').update(png).digest('hex'), png }
}
const recorder = (async () => {
  while (recording) {
    frames.push(await screenshot())
    await sleep(CAPTURE_INTERVAL_MS)
  }
})()

const latestHash = () => frames.at(-1)?.hash
/** 画面が baseHash から変わり、その後 stableMs のあいだ変化しなくなるまで待つ */
async function waitForSettledChange(baseHash: string | undefined, stableMs: number): Promise<void> {
  await waitUntil('画面の変化', 20_000, async () => latestHash() !== undefined && latestHash() !== baseHash)
  let hash = latestHash()
  let since = Date.now()
  await waitUntil('画面の安定', 20_000, async () => {
    if (latestHash() !== hash) {
      hash = latestHash()
      since = Date.now()
    }
    return Date.now() - since >= stableMs
  })
}

/** アプリ側のエラー（未捕捉例外・fetch 失敗）が出ていたら撮影を中止する */
async function assertNoAppErrors(): Promise<void> {
  const { entries } = (await (await fetch(`${automation}/console`)).json()) as { entries: { level: string; message: string }[] }
  const errors = entries.filter((e) => e.level === 'error' || /^\[(uncaught|unhandledrejection|fetch)\]/.test(e.message))
  if (errors.length > 0) fail(`アプリでエラーが発生しました:\n${errors.map((e) => `  ${e.message}`).join('\n')}`)
}

await waitUntil('最初のフレーム', 10_000, async () => frames.length > 0)
for (const [i, step] of SCENARIO.entries()) {
  const baseHash = latestHash()
  if (step.caption) captions.push({ t: Date.now() - startedAt, caption: step.caption })
  if (step.action) {
    const res = await fetch(`${automation}/input`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: step.action }),
    })
    if (!res.ok) fail(`入力 ${step.action} の送信に失敗しました: HTTP ${res.status}`)
  }
  if (step.waitForChange) await waitForSettledChange(baseHash, 800)
  await assertNoAppErrors()
  console.log(`[demo-gif] step ${i + 1}/${SCENARIO.length}: ${step.action ?? 'launch'}`)
  await sleep(step.holdMs)
}
recording = false
await recorder
const endedAt = Date.now() - startedAt
stopChildren()

// ---- GIF 生成 ----
// 起動直後の何も描画されていないフレームは捨てる
const firstDrawn = frames.findIndex((f) => f.hash !== frames[0]?.hash)
if (firstDrawn < 0) fail('画面が一度も描画されませんでした')
const t0 = frames[firstDrawn]!.t
const kept = frames.slice(firstDrawn)

rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })
// 同じ画面が続くフレームは1枚にまとめ、表示時間で表す（concat demuxer の duration）
const concat: string[] = []
let index = 0
for (const [i, frame] of kept.entries()) {
  if (i > 0 && frame.hash === kept[i - 1]!.hash) continue
  const next = kept.slice(i + 1).find((f) => f.hash !== frame.hash)
  const duration = ((next?.t ?? endedAt) - frame.t) / 1000
  const file = `frame-${String(index++).padStart(4, '0')}.png`
  writeFileSync(path.join(workDir, file), frame.png)
  concat.push(`file '${file}'`, `duration ${duration.toFixed(3)}`)
}
// concat demuxer は最後のファイルの duration を無視するので、最後のフレームを繰り返す
concat.push(concat.at(-2)!)
writeFileSync(path.join(workDir, 'frames.txt'), `${concat.join('\n')}\n`)

const width = DISPLAY_W + PAD * 2
const height = DISPLAY_H + PAD * 2 + CAPTION_H
// 黒背景にグラス画面（透過 PNG）を重ね、下部の字幕帯に操作名と解説を描く
const chain = [
  `[bg][fg]overlay=${PAD}:${PAD}:shortest=1`,
  `drawbox=x=0:y=${DISPLAY_H + PAD * 2}:w=${width}:h=${CAPTION_H}:color=0x1c1c1c:t=fill`,
]
for (const [i, { t, caption }] of captions.entries()) {
  const from = Math.max(0, (t - t0) / 1000)
  const to = i + 1 < captions.length ? (captions[i + 1]!.t - t0) / 1000 : 1e9
  const enable = `enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`
  caption.forEach((text, line) => writeFileSync(path.join(workDir, `caption-${i}-${line}.txt`), text))
  const captionTop = DISPLAY_H + PAD * 2
  chain.push(
    `drawtext=fontfile='${FONT_BOLD}':textfile='caption-${i}-0.txt':expansion=none:fontsize=22:fontcolor=0xffd54a:x=${PAD + 4}:y=${captionTop + 14}:${enable}`,
    `drawtext=fontfile='${FONT_REGULAR}':textfile='caption-${i}-1.txt':expansion=none:fontsize=20:fontcolor=white:x=${PAD + 4}:y=${captionTop + 48}:${enable}`,
  )
}
const graph = [
  `color=c=black:s=${width}x${height}:r=${GIF_FPS}[bg]`,
  `[0:v]fps=${GIF_FPS}[fg]`,
  `${chain.join(',')},split[a][b]`,
  '[a]palettegen=stats_mode=full[p]',
  '[b][p]paletteuse=dither=none',
].join(';\n')
writeFileSync(path.join(workDir, 'filter.txt'), graph)

mkdirSync(path.dirname(output), { recursive: true })
const ffmpeg = spawnSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-/filter_complex', 'filter.txt', '-loop', '0', output],
  { cwd: workDir, stdio: 'inherit' },
)
if (ffmpeg.status !== 0) fail(`ffmpeg が失敗しました（作業ファイル: ${workDir}）`)
console.log(`[demo-gif] ${output}（${((endedAt - t0) / 1000).toFixed(1)} 秒）`)
