# 次の電車 (departure)

Even Realities G2 向けの「最寄り駅から次に発車する電車」をすぐ確認するアプリ。
[公共交通オープンデータ（ODPT）](https://developer.odpt.org/) の駅・駅時刻表データを使う。
構成は [even-hatena-reader](https://github.com/andoshin11/even-hatena-reader) を踏襲している。

| ディレクトリ | 内容 |
| --- | --- |
| [`glasses/`](glasses/README.md) | G2 アプリ本体（Vite + TypeScript + `@evenrealities/even_hub_sdk`） |
| [`api/`](api/README.md) | ODPT を中継する API（Nuxt 4 server routes → Cloudflare Workers）。ODPT のアクセストークンをアプリに埋め込まないためのもの |
| `shared/` | api と glasses の間の契約（レスポンス型・定数） |

## 画面

```
駅一覧 --CLICK--> 路線一覧 --CLICK--> 発車予定
  |       (路線が1つならスキップ)          |
  +<---------- DOUBLE_CLICK ---------------+
```

1. **駅一覧**: Even App（スマートフォン）の現在地から半径 1km 以内の駅を近い順に表示。ODPT の駅は路線ごとなので、同じ駅名はまとめる。
2. **路線一覧**: 選んだ駅に乗り入れている路線。1路線しかなければこの画面は出ない。
3. **発車予定**: 方面ごとに、次に発車する列車を最大3本（時刻・種別・行き先）。CLICK で最新に更新。

## セットアップ

```bash
corepack enable
yarn install

# api: ODPT のアクセストークン等を設定して起動（詳細は api/README.md）
cp api/.env.example api/.env
yarn workspace @departure/api dev

# glasses: 別ターミナルで（詳細は glasses/README.md）
cp glasses/.env.example glasses/.env
yarn workspace @departure/glasses dev
yarn workspace @departure/glasses simulator
```

Node.js は `.nvmrc`（24）を使う。
