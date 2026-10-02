import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { API_KEY_HEADER } from '@departure/shared'
import { requireVar, type AppEnv } from '../env'
import { timingSafeEqualString } from '../utils/timing-safe-equal'

/**
 * /api/* への API Key 認証。
 *
 * OPTIONS preflight は index.ts で先に登録した cors() が 204 で完結させるため、ここには到達しない。
 * サーバー側の期待値は Worker secret の API_KEY。未設定の場合は「認証なしで通す」のではなく 500 を返す（fail-fast）。
 */
export const apiKeyAuth = createMiddleware<AppEnv>(async (c, next) => {
  const expectedApiKey = requireVar(c.env, 'API_KEY')
  const providedApiKey = c.req.header(API_KEY_HEADER)
  if (providedApiKey === undefined || !timingSafeEqualString(providedApiKey, expectedApiKey)) {
    throw new HTTPException(401, { message: 'Invalid or missing API key' })
  }
  await next()
})
