# 次の電車 (glasses/)

Even Realities G2 向けの「最寄り駅から次の電車」アプリ。`@evenrealities/even_hub_sdk` + `@evenrealities/pretext` を使った TypeScript アプリ。ツールチェーンは [Vite+](https://viteplus.dev/)（`vp`）で、開発サーバー・ビルド・テスト・lint・フォーマット・型チェックを1つの CLI と `vite.config.ts` にまとめている。描画・イベント処理の基盤（Text コンテナ2つ + 自前カーソル、reducer / plan / executor の分離、999バイトガード）は even-hatena-reader と同じ。

## セットアップ

```bash
cp .env.example .env
# VITE_API_BASE_URL: api/ の URL（ローカルは http://localhost:3000）
# VITE_API_KEY: api/ の API_KEY（Worker secret）と同じ値
```

- `VITE_API_BASE_URL` / `VITE_API_KEY` は必須。本番ビルド（`yarn build`）は未設定なら失敗し、`yarn dev` は起動時にエラー画面を出す。
- **本番 API の URL はリポジトリに書かない**。コミットしている `app.json` の network whitelist は開発用の `http://localhost:3000` だけで、`yarn package:ehpk`（`scripts/pack.ts`）が `.env.production` の `VITE_API_BASE_URL` の origin を差し込んだパッケージ用の `app.json`（`.pack/app.json`、`.gitignore` 済み）を作ってから `evenhub pack` する。パッケージ用の whitelist は本番の origin だけ（開発用の localhost は外れる）。
- 本番ビルドでは `VITE_API_BASE_URL` が https であることも検証する（`vite-plugins/check-build-env.ts`）。
- 環境ごとの値は `.env`（`yarn dev` / シミュレーター。ローカルの api を指す）と `.env.production`（`yarn build` / `yarn package:ehpk`。本番 URL と、Worker secret `API_KEY` と同じ値）に置く（どちらも `.gitignore` 済み）。
- `VITE_API_KEY` は `.ehpk` にそのまま埋め込まれる。個人利用前提の簡易的なアクセス制限であり、強固な秘匿ではない（ODPT のアクセストークンはアプリに含まれず、api/ 側だけが持つ）。

### 現在地

Even App の `bridge.getAppLocation`（高精度、タイムアウト10秒）で1回取得する。`app.json` に `location` 権限を宣言している。取得できなければエラー画面を出し、CLICK で再試行する（自動リトライはしない）。

**シミュレーターには位置情報 API が無い**ため、開発時は `.env.development` に `VITE_DEV_FIXED_LOCATION=緯度,経度` を書くと、その座標を現在地として使う（`yarn dev` のときだけ有効。本番ビルドで設定されているとビルドを失敗させる）。

```bash
echo 'VITE_DEV_FIXED_LOCATION=35.6580,139.7016' > .env.development
```

## 開発

```bash
yarn dev          # vp dev (http://localhost:5173)
yarn simulator    # evenhub-simulator
npx evenhub qr --url "http://<LAN IP>:5173"   # 実機（Even App でスキャン）
```

## 画面と操作

| 画面     | SCROLL                                  | CLICK                                                                  | DOUBLE_CLICK                                 | アプリに戻ったとき                                 |
| -------- | --------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| 駅一覧   | カーソル移動（7件/ページ）              | 路線一覧へ（1路線なら発車予定へ直接）。エラー・0件なら現在地から再検索 | 終了                                         | 現在地から再検索（選んでいた駅名にカーソルを戻す） |
| 路線一覧 | カーソル移動                            | 発車予定へ                                                             | 駅一覧へ（カーソル位置を保持、再検索しない） | —                                                  |
| 発車予定 | —（はみ出した分はネイティブスクロール） | 最新に更新 / エラー時は再試行                                          | 路線一覧へ（スキップしてきた場合は駅一覧へ） | 最新に更新                                         |

発車予定画面の表示例:

```
運行情報 12:00 ダイヤ乱れ（荷物挟まり）   ← 路線の運行情報（データの生成時刻つき）
浅草方面
　12:03 各停 浅草
　12:06 各停 浅草
　翌05:01 各停 浅草 終電      ← 翌運行日は「翌」、終電は「終電」
渋谷方面
　…
渋谷 銀座線　12:01時点　CLICK で更新   ← pager
```

- 方面が多く Text コンテナの上限（UTF-8 999バイト）に収まらない場合は、収まる方面までを表示し「（他N方面は表示しきれません）」と明示する。
- 時刻表が ODPT に無い路線は「この路線の時刻表データがありません」（api/ の 404）。
- **1行目は運行情報**（ODPT の `odpt:TrainInformation`。動的データなので開発者ガイドライン 2.1 に従う）。
  - 状態（東京メトロの遅延時の「遅延」「ダイヤ乱れ」等）があれば「状態（原因）」、無ければ運行情報の文章をそのまま出し、データの生成時刻（`dc:date`）を添える。1行に収まらない部分は切り詰める。
  - **有効期限（`dct:valid`）が来たら自動で取り直す**（`main.ts` のタイマー → `INFO_EXPIRED`）。取り直している間は発車予定を表示したまま、運行情報の行だけを「運行情報を更新中…」にする。取り直しに失敗したら「運行情報を取得できませんでした」にし、期限切れの情報は表示し続けない。
  - 情報が無い路線は「運行情報はありません」と表示する。
  - 2方面のときは本文が9行になり、最後の1行はスクロールで表示する（発車予定画面はカーソル操作が無いので、はみ出しはファームウェアのネイティブスクロールに任せている）。

## スクリプト

| コマンド            | 内容                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| `yarn dev`          | `vp dev`（開発サーバー）                                                          |
| `yarn build`        | `vp lint`（lint + 型チェック）→ `vp build`（whitelist 検証込み）                  |
| `yarn check`        | `vp check`（フォーマット確認 + lint + 型チェック）。CI はこれを実行する           |
| `yarn lint`         | `vp lint`（Oxlint + tsgolint による型チェック）                                   |
| `yarn fmt`          | `vp fmt`（Oxfmt で整形して書き込む）                                              |
| `yarn test`         | `vp test`（Vitest。設定は `vitest.config.ts`）                                    |
| `yarn package:ehpk` | `yarn build` → `scripts/pack.ts`（パッケージ用 app.json を作って `evenhub pack`） |
| `yarn simulator`    | `evenhub-simulator http://localhost:5173`                                         |

### Vite+ の導入方法（このモノレポでの注意点）

- `vp migrate` はワークスペースのルートでしか実行できないため、glasses・api それぞれに手動で導入している。
  - `glasses/package.json` の devDependencies で `vite` を `npm:@voidzero-dev/vite-plus-core` に、`vitest` を `vite-plus` 同梱のバージョンに固定している。ドキュメントの手順（ルートの `resolutions`）に従うと、`api/` が使う `vite` / `vitest` まで差し替わってしまうため。
  - さらに `installConfig.hoistingLimits: "workspaces"` で glasses の依存をルートに巻き上げないようにしている。これが無いと Yarn の node-modules linker がエイリアスをルートの `node_modules/vite` に置き、`api/` からも vite-plus-core が見えてしまう。
  - `yarn install` で出る `vite is listed by your project with version 1.0.0 ... doesn't satisfy ...`（YN0060）は、エイリアス先のバージョン番号（1.0.0）が peer dependency の範囲判定に使われるための警告で、動作には影響しない。
- `vite-plus` を更新するときは、`vite`（エイリアスのバージョン）と `vitest` のピンも `vite-plus` の依存に合わせて更新すること（`npm view vite-plus@<version> dependencies`）。
- lint の設定は旧 ESLint 設定（eslint:recommended + typescript-eslint recommended）相当。Oxlint の `correctness` に含まれない typescript-eslint recommended のルールは `vite.config.ts` で個別に有効化している（存在しないルール名を書くと `vp lint` がエラーになる）。
- 型チェックは Oxlint の型チェック（`lint.options.typeCheck`。tsgolint / TypeScript Go）で行い、`tsc --noEmit` は使わない。tsgolint は TypeScript 7 系なので、`devDependencies` の `typescript`（5.9.3）はエディタ向け。
  - ドキュメントにある型チェックだけの実行（`vp check --no-fmt --no-lint`）は、このワークスペース構成では「No checks enabled」で失敗するため使わない（原因は未確認。ドキュメントにある「ワークスペースのパッケージからは root の lint 設定を使う」挙動との関係を疑っているが、検証していない）。`vp lint` が型チェックも行う。
- `vite-plugins/check-build-env.ts` の本番ビルド判定は `command === 'build' && mode === 'production'`。Oxlint / Oxfmt が `vite.config.ts` の `lint` / `fmt` ブロックを読むときに、`resolveConfig(..., 'build')` を mode=development で呼ぶため。

## 構成

- `src/domain/` — `reducer.ts` の `reduce(state, event)` は純粋関数（state + event → 次の state + Effect[]）。`types.ts` に画面ごとの state / event / effect。`listPaging.ts` はカーソルリストのページ計算。
- `src/format/` — 表示用整形（純粋関数）。`departure.ts`（駅・路線ラベル、発車予定の行組み立てとバイト数上限の処理）、`label.ts`（カーソル記号付き行）、`textByteLimit.ts`（UTF-8 バイト数）。
- `src/render/` — `plan.ts`（state → 描画内容、折返しの fail-fast チェック込み）、`executor.ts`（bridge 呼び出し。初回のみ createStartUpPageContainer、以降は textContainerUpgrade）、`renderGuard.ts`（描画失敗時の内部エラー画面）。
- `src/api/` — API クライアント（`fetch` 注入可、自動リトライなし）と shared の契約型に対する実行時検証。
- `src/location/` — 現在地の取得と `VITE_DEV_FIXED_LOCATION` の解釈。
- `src/main.ts` — イベント正規化 → `reduce` → `planScreen` → `render` → 副作用実行を Promise チェーンで直列化。

## 実機で要確認

- `getAppLocation` が実機で期待どおりの精度・時間で返るか（シミュレーターでは検証できない）。
- 発車予定画面は 2方面×4行 = 8行で、pager 付き body（高さ240）に収まることはシミュレーターで確認済み。実機でも同じか。
