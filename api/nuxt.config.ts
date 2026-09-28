import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'

// api/ は Nuxt 4 の server routes のみで構成される ODPT 中継 API（Nuxt の app/ ページは持たない）。
// デプロイ先は Cloudflare Workers（cloudflare_module preset）。
// ODPT の consumerKey をクライアント（.ehpk）に埋め込まないため、ODPT へのアクセスは必ずここを経由する。
export default defineNuxtConfig({
  compatibilityDate: '2026-09-28',

  modules: ['@nuxt/eslint'],

  // 環境変数からマッピングされる（Nuxt の envPrefix 既定値 "NUXT_"）。
  // - NUXT_API_KEY: glasses → api の認証キー。空のままだと server/middleware/2.auth.ts が 500 を返す。
  // - NUXT_ODPT_CONSUMER_KEY: ODPT の acl:consumerKey。空のままだと server/utils/odpt-client.ts が 500 を返す。
  // - NUXT_ODPT_BASE_URL: ODPT API の base URL（既定は api.odpt.org。チャレンジ用 API 等に切り替える場合に指定）。
  // 本番は Worker secret / vars、ローカルは api/.env（dev）/ api/.dev.vars（wrangler dev/preview）で設定する。
  runtimeConfig: {
    apiKey: '',
    odptConsumerKey: '',
    odptBaseUrl: 'https://api.odpt.org/api/v4',
  },

  nitro: {
    preset: 'cloudflare_module',

    // server/utils 等を相対パスではなく `#server/` エイリアスで import するため。
    alias: {
      '#server': fileURLToPath(new URL('./server', import.meta.url)),
    },

    // defineCachedFunction のキャッシュ保存先。本番は Cloudflare KV binding、開発中は in-memory。
    storage: {
      cache: {
        driver: 'cloudflare-kv-binding',
        binding: 'CACHE',
      },
    },
    devStorage: {
      cache: {
        driver: 'memory',
      },
    },
  },
})
