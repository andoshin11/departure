# @departure/api

公共交通オープンデータ（ODPT）API v4 を中継する API。Nuxt 4 の server routes のみで構成され、Cloudflare Workers（`workers.dev`）にデプロイする。

ODPT のアクセストークン（`acl:consumerKey`）をアプリ（`.ehpk`）に埋め込まないこと、ODPT の JSON-LD を G2 で表示しやすい形に整形すること、時刻表・名称をキャッシュすることが目的。

データの出典・ライセンスと遵守している規約は、ルートの README の「[データの出典とライセンス](../README.md#データの出典とライセンス)」を参照。

## エンドポイント

すべての `/api/**`（`OPTIONS` preflight を除く）に `X-API-Key` ヘッダーによる認証が必要（欠落・不一致は 401、サーバー側未設定は 500）。型は `shared/src/index.ts`。

- `GET /api/stations/nearby?lat=<緯度>&lon=<経度>&radius=<m>` — 半径（1〜4000m の整数）以内の駅を**駅名でまとめて**近い順に返す（`NearbyStationsResponse`）。不正なパラメータは 400。
  - ODPT の `places/odpt:Station` を使う。ODPT の駅（`odpt:Station`）は路線ごとに別オブジェクトなので、同じ駅名（`odpt:stationTitle.ja`）のものを1駅にまとめ、路線の一覧として返す。
- `GET /api/departures?station=<odpt:Station の owl:sameAs>` — その駅（路線）から次に発車する列車を**方面（`odpt:railDirection`）ごとに最大3本**返す（`DeparturesResponse`）。
  - あわせて、その路線の**運行情報**（`odpt:TrainInformation`）を `trainInformation` で返す。発車予定は時刻表どおりの予定なので、遅延等はここで伝える。
    - 有効期限（`dct:valid`）を過ぎた情報・有効期限の無い情報は返さず `{ kind: 'unavailable' }` にする（開発者ガイドライン 2.1.2）。理由はログに出す。
    - 運行情報は補助的な情報なので、取得に失敗しても発車予定は返し、`{ kind: 'error' }` にして画面で明示する（失敗はログに出す）。
  - `station` が `odpt.Station:` 形式でなければ 400。駅が存在しない、または ODPT にその駅の時刻表（`odpt:StationTimetable`）が無い場合は 404（「今日はもう電車が無い」と区別するため）。
- ODPT 側の失敗（ネットワークエラー・非2xx・想定外の形式）は 502。原因はログに出す（アクセストークンは伏せる）。自動リトライはしない。

## 発車予定の計算

- 現在時刻はサーバーの時計を JST に換算して使う。
- **運行日の境界は JST 03:00**。03:00 より前の時刻（例: `00:30` 発の終電）は前日の運行日のダイヤとして扱う（`server/utils/service-day.ts`）。
- **カレンダー（`odpt:calendar`）の選択**: 事業者によって「平日 / 土曜 / 休日」と分けるものと「平日 / 土休日」と分けるものがあるため、運行日ごとに候補を限定的な順に並べ、方面ごとに最初に見つかった時刻表を使う。
  | 運行日 | 候補（先頭優先） |
  | --- | --- |
  | 平日 | `<曜日>`（例: `Monday`）→ `Weekday` |
  | 土曜 | `Saturday` → `SaturdayHoliday` |
  | 日曜 | `Sunday` → `Holiday` → `SaturdayHoliday` |
  | 祝日・年末年始（12/30〜1/3） | `Holiday` → `SaturdayHoliday` |
  - 祝日判定は `@holiday-jp/holiday_jp`。年末年始を休日扱いにするのは首都圏の主要事業者の運用に合わせたもので、事業者ごとの例外には対応しない。
  - `odpt.Calendar:Specific.*`（臨時ダイヤ等）には対応しない。該当する時刻表が無い方面は `departures: []` で返し、アプリは「該当するダイヤがありません」と表示する。
- 当日の残りが3本に満たない場合（終電間際・終電後）は、翌運行日のダイヤの始発から補い `nextServiceDay: true` を付ける。
- 到着時刻のみ（終着）の列車は発車しないので除外する。
- **名称の解決**: 行き先駅・方面・種別・路線・事業者の日本語名は `owl:sameAs` をカンマ区切りで複数指定して一括取得する（ODPT の OR 条件の上限に合わせて10件ずつ。11件以上は 400 になる）。他事業者への直通先など ODPT にデータが無い ID は、ID の末尾（ローマ字表記、例: `odpt.Station:Tokyu.Toyoko.Yokohama` → `Yokohama`）で表示し、`[odpt] titles not found for ...` の警告ログを出す（行き先名1つのために発車予定全体をエラーにしないための縮退）。

## キャッシュ

`defineCachedFunction`（本番は Cloudflare KV、開発は in-memory）。レスポンス自体は現在地・現在時刻に依存するためキャッシュしない。

| 対象 | 期間 |
| --- | --- |
| 駅時刻表（駅ごと） | 6時間 |
| 運行情報（路線ごと） | 60秒（ODPT の有効期限が約5分のため、それより十分短く） |
| 名称（型 + ID 集合ごと。キーは ID 集合のハッシュ） | 24時間 |

## 設定

`nuxt.config.ts` の `runtimeConfig`（環境変数 `NUXT_*` からマッピング）。

| 環境変数 | 必須 | 内容 |
| --- | --- | --- |
| `NUXT_API_KEY` | ✔ | glasses の `VITE_API_KEY` と同じ値。未設定なら全リクエスト 500 |
| `NUXT_ODPT_CONSUMER_KEY` | ✔ | [ODPT 開発者サイト](https://developer.odpt.org/) で発行したアクセストークン。未設定なら 500 |
| `NUXT_ODPT_BASE_URL` | | 既定 `https://api.odpt.org/api/v4`。チャレンジ用 API 等を使う場合に指定 |

- ローカル (`yarn dev`): `api/.env`（`.env.example` 参照）
- ローカル (`yarn preview` = `wrangler dev`): `api/.dev.vars`（wrangler は `.env` を読まない）
- 本番: `wrangler secret put NUXT_API_KEY` / `wrangler secret put NUXT_ODPT_CONSUMER_KEY`

## 開発

```bash
yarn workspace @departure/api dev        # http://localhost:3000
yarn workspace @departure/api test
yarn workspace @departure/api typecheck
yarn workspace @departure/api lint
```

## デプロイ

`main` への `api/**` / `shared/**` の push で `.github/workflows/deploy-api.yml` が typecheck → lint → test → build → `wrangler deploy` を行う。

### 初回のみ必要な作業

1. **KV namespace**（2026-10-02 実施済み）: `wrangler kv namespace create departure-cache` で作成し、id を `wrangler.jsonc` に記入済み。作り直した場合は id を更新すること（プレースホルダー `REPLACE_WITH_KV_NAMESPACE_ID` が残っているとデプロイ workflow が失敗する）。
2. **Cloudflare API Token**（2026-10-02 実施済み）: アカウント API トークン `departure-deploy`（権限: Workers Scripts: Edit のみ、有効期限 2027-10-03）を発行し、GitHub Secrets の `CLOUDFLARE_API_TOKEN` に登録済み。期限前に同じ手順で再発行し、secret を更新すること。トークンがアカウントを列挙できないため、デプロイ時にアカウント ID を渡す必要がある。アカウント ID はリポジトリに書かず、GitHub Secrets の `CLOUDFLARE_ACCOUNT_ID` に登録している（2026-10-02 実施済み。`deploy-api.yml` が未設定を検知して失敗させる）。手元で wrangler を使う場合は `wrangler login` すればアカウントは自動で決まる（複数アカウントがある場合は環境変数 `CLOUDFLARE_ACCOUNT_ID` で指定する）。
3. `NUXT_API_KEY` / `NUXT_ODPT_CONSUMER_KEY` を Worker secret に設定する。
4. デプロイ後の Workers の URL を `glasses/.env.production` の `VITE_API_BASE_URL` に設定する（リポジトリには書かない。`glasses/README.md` 参照）。
