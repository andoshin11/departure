# 次の電車 (glasses/)

Even Realities G2 向けの「最寄り駅から次の電車」アプリ。`@evenrealities/even_hub_sdk` + `@evenrealities/pretext` を使った Vite + TypeScript アプリ。描画・イベント処理の基盤（Text コンテナ2つ + 自前カーソル、reducer / plan / executor の分離、999バイトガード）は even-hatena-reader と同じ。

## セットアップ

```bash
cp .env.example .env
# VITE_API_BASE_URL: api/ の URL（ローカルは http://localhost:3000）
# VITE_API_KEY: api/ の NUXT_API_KEY と同じ値
```

- `VITE_API_BASE_URL` / `VITE_API_KEY` は必須。`vite build` は未設定なら失敗し、`vite dev` は起動時にエラー画面を出す。
- `VITE_API_BASE_URL` の origin は `app.json` の `permissions[network].whitelist` に含まれている必要がある（`vite-plugins/check-network-whitelist.ts` が dev/build で検証）。本番（`https://departure.shinglish11.workers.dev`）とローカル開発用（`http://localhost:3000`）を登録している。Even Hub へ公開申請する場合は、未使用の `http://localhost:3000` を外すこと。
- 環境ごとの値は `.env`（`yarn dev` / シミュレーター。ローカルの api を指す）と `.env.production`（`yarn build` / `yarn package:ehpk`。本番 URL と、Worker secret `NUXT_API_KEY` と同じ値）に置く（どちらも `.gitignore` 済み）。
- `VITE_API_KEY` は `.ehpk` にそのまま埋め込まれる。個人利用前提の簡易的なアクセス制限であり、強固な秘匿ではない（ODPT のアクセストークンはアプリに含まれず、api/ 側だけが持つ）。

### 現在地

Even App の `bridge.getAppLocation`（高精度、タイムアウト10秒）で1回取得する。`app.json` に `location` 権限を宣言している。取得できなければエラー画面を出し、CLICK で再試行する（自動リトライはしない）。

**シミュレーターには位置情報 API が無い**ため、開発時は `.env.development` に `VITE_DEV_FIXED_LOCATION=緯度,経度` を書くと、その座標を現在地として使う（`vite dev` のときだけ有効。`vite build` で設定されているとビルドを失敗させる）。

```bash
echo 'VITE_DEV_FIXED_LOCATION=35.6580,139.7016' > .env.development
```

## 開発

```bash
yarn dev          # Vite dev server (http://localhost:5173)
yarn simulator    # evenhub-simulator
npx evenhub qr --url "http://<LAN IP>:5173"   # 実機（Even App でスキャン）
```

## 画面と操作

| 画面 | SCROLL | CLICK | DOUBLE_CLICK | アプリに戻ったとき |
| --- | --- | --- | --- | --- |
| 駅一覧 | カーソル移動（7件/ページ） | 路線一覧へ（1路線なら発車予定へ直接）。エラー・0件なら現在地から再検索 | 終了 | 現在地から再検索（選んでいた駅名にカーソルを戻す） |
| 路線一覧 | カーソル移動 | 発車予定へ | 駅一覧へ（カーソル位置を保持、再検索しない） | — |
| 発車予定 | —（はみ出した分はネイティブスクロール） | 最新に更新 / エラー時は再試行 | 路線一覧へ（スキップしてきた場合は駅一覧へ） | 最新に更新 |

発車予定画面の表示例:

```
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

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `yarn dev` | Vite dev server |
| `yarn build` | `tsc --noEmit` → whitelist 検証 → `vite build` |
| `yarn typecheck` | `tsc --noEmit`（`src`・`test`） |
| `yarn lint` | ESLint |
| `yarn test` | `vitest run` |
| `yarn package:ehpk` | `yarn build` → `evenhub pack ... -o departure.ehpk --sdk-ver 0.0.16` |
| `yarn simulator` | `evenhub-simulator http://localhost:5173` |

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
