import { createError, defineEventHandler, getHeader, getRequestURL } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { API_KEY_HEADER } from '@departure/shared'
import { timingSafeEqualString } from '#server/utils/timing-safe-equal'

/**
 * /api/** への API Key 認証。
 *
 * ファイル名の `2.` プレフィックス: 1.cors.ts より後に実行される必要がある
 * （OPTIONS preflight は 1.cors.ts が認証チェックより前に完結させるため）。
 *
 * サーバー側の期待値は runtimeConfig.apiKey（環境変数 NUXT_API_KEY、本番は Worker secret）。
 * 期待値が未設定の場合は「認証なしで通す」のではなく 500 を返す（fail-fast）。
 * 曖昧な設定不足を許可リスト漏れとして握りつぶさない。
 */
export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/api/') || event.method === 'OPTIONS') {
    return
  }

  const expectedApiKey = useRuntimeConfig(event).apiKey
  if (!expectedApiKey) {
    console.error('[auth] NUXT_API_KEY is not configured on the server; refusing to authenticate requests')
    throw createError({
      statusCode: 500,
      statusMessage: 'Server misconfiguration: API key is not set',
    })
  }

  const providedApiKey = getHeader(event, API_KEY_HEADER)
  if (typeof providedApiKey !== 'string' || !timingSafeEqualString(providedApiKey, expectedApiKey)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or missing API key',
    })
  }
})
