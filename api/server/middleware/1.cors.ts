import { defineEventHandler, getRequestURL, sendNoContent, setResponseHeader } from 'h3'
import { API_KEY_HEADER } from '@departure/shared'

/**
 * /api/** への CORS ヘッダー付与と OPTIONS (preflight) の明示的なハンドリング。
 *
 * ファイル名の `1.` プレフィックスに意味がある: Nitro は server/middleware 配下のファイルを
 * パス文字列の昇順(localeCompare)で実行するため、`2.auth.ts`（API Key 認証）より必ず先に
 * 実行される。処理順は 「CORS/OPTIONS → 認証 → ルート」の必要があり、認証より前に
 * OPTIONS preflight を完結させる必要があるため。
 *
 * 注意: defineCachedEventHandler と Nitro の routeRules.cors を併用すると、
 * OPTIONS リクエストがキャッシュ層を通過してキャッシュ済みのレスポンス本文が返ってしまう
 * 事象が確認されている。そのため OPTIONS はこの global middleware の時点
 * （ルーティング/キャッシュ層、および認証チェックに到達する前）で完結させ、routeRules.cors は使わない。
 */
export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/api/')) {
    return
  }

  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')

  if (event.method === 'OPTIONS') {
    setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, OPTIONS')
    setResponseHeader(event, 'Access-Control-Allow-Headers', `Content-Type, ${API_KEY_HEADER}`)
    // sendNoContent は event.node.res を直接 end() する。
    // これにより後続の middleware/router layer（2.auth.ts や defineCachedEventHandler を含む）には到達しない。
    sendNoContent(event, 204)
  }
})
