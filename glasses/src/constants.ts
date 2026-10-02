// G2 の画面ジオメトリと各コンテナのレイアウト定数。
// pretext での折返し計算・pxTruncate の対象幅は、ここで定義した実寸に必ず追従させること。
//
// List コンテナは SDK 0.0.16 で初期選択 index を指定できず、rebuildPageContainer で
// 作り直すたびに選択が先頭へ戻ってしまう（up/down のイベントも来ない）。そのため
// すべての画面を Text コンテナ2つ（body + pager）だけで構成し、駅一覧・路線一覧は
// 自前のカーソル（"▶ " 記号）付きテキスト行として描画する（even-hatena-reader と同じ方式）。

export const CANVAS_WIDTH = 576
export const CANVAS_HEIGHT = 288

// LVGL の行高は G2 で固定 27px（一覧カーソルリストの1ページあたり行数計算に使う）。
export const LINE_HEIGHT_PX = 27

export const TEXT_BODY = {
  xPosition: 0,
  yPosition: 0,
  width: CANVAS_WIDTH,
  height: 240,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
} as const

export const TEXT_PAGER = {
  xPosition: 0,
  yPosition: 250,
  width: CANVAS_WIDTH,
  height: 30,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
} as const

export const TEXT_INNER_WIDTH = TEXT_BODY.width - 2 * TEXT_BODY.paddingLength
export const TEXT_INNER_HEIGHT = TEXT_BODY.height - 2 * TEXT_BODY.paddingLength

/**
 * body に安全に収まる最大行数。一覧のカーソルリスト（1ページの行数）が参照する。
 *
 * 内側高さから機械的に floor(TEXT_INNER_HEIGHT / LINE_HEIGHT_PX) を計算すると 8 行になるが、
 * pager 付きの body（高さ240）で 8 行ぴったりが実機でもはみ出さないかは未確認。はみ出すと
 * SCROLL イベント自体が届かなくなりカーソルを動かせなくなるため、安全側に倒して1行分の余裕を持たせる
 * （even-hatena-reader と同じ判断）。
 *
 * 発車予定画面はカーソル操作が無いためこの制約を受けない。方面が多く body からはみ出す場合は
 * ファームウェアのネイティブスクロールに任せる。
 */
export const BODY_MAX_LINES = Math.floor(TEXT_INNER_HEIGHT / LINE_HEIGHT_PX) - 1

/** 一覧・ルートのカーソル付きテキストリストで、1ページに詰め込める行数（BODY_MAX_LINES と同じ）。 */
export const LIST_ROWS_PER_PAGE = BODY_MAX_LINES

/**
 * Text コンテナに渡せる content の実測上限（UTF-8 バイト数）。
 *
 * SDK ドキュメントには「1000/2000文字」等の記載があるが、実測ではこれとは異なる。
 * createStartUpPageContainer / rebuildPageContainer / textContainerUpgrade のいずれでも、
 * 各コンテナの content が UTF-8 で 999 バイトを超えると失敗する
 * （シミュレーターのログで "exceeds limit of 999 bytes" を確認済み）。日本語では概ね330字前後に
 * 相当する。判定は必ずバイト数で行うこと（`string.length` は UTF-16 コード単位数であり
 * バイト数ではないため、これで判定すると実際の上限とズレる。format/textByteLimit.ts の
 * utf8ByteLength 参照）。
 */
export const MAX_TEXT_BYTES = 999

/** 選択中の行の先頭に付けるカーソル記号。 */
export const CURSOR_MARK = '▶ '
/**
 * 非選択行の先頭を埋める、CURSOR_MARK と同じ文字数の空白。画素幅は概ね同等だが厳密一致は求めない。
 * 文字数は見た目の1文字（書記素クラスタ）単位で数える（コードポイント単位だと絵文字等で数がずれるため）。
 */
export const CURSOR_BLANK = ' '.repeat([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(CURSOR_MARK)].length)

/** 最寄り駅を探す半径（m）。徒歩圏を想定 */
export const NEARBY_RADIUS_METERS = 1000

/** 現在地取得のタイムアウト（ms） */
export const LOCATION_TIMEOUT_MS = 10_000
