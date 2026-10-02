import { HTTPException } from 'hono/http-exception'

/**
 * Worker の環境（wrangler.jsonc の bindings / vars と Worker secret）。
 * - API_KEY: glasses → api の認証キー（secret）。glasses の VITE_API_KEY と同じ値
 * - ODPT_CONSUMER_KEY: ODPT の acl:consumerKey（secret）
 * - ODPT_BASE_URL: ODPT API の base URL（wrangler.jsonc の vars）
 * - CACHE: 時刻表・名称・運行情報のキャッシュ（KV namespace）
 *
 * 文字列は未設定の可能性があるため optional にし、使う箇所で requireVar により fail-fast で検査する。
 * ローカルは api/.dev.vars（wrangler dev が読む）、本番は `wrangler secret put` で設定する。
 */
export interface Bindings {
  API_KEY?: string
  ODPT_CONSUMER_KEY?: string
  ODPT_BASE_URL?: string
  CACHE: KVNamespace
}

export interface AppEnv {
  Bindings: Bindings
}

/** 設定不足は「なしで動かす」のではなく 500 にする（fail-fast）。値そのものはログにもレスポンスにも出さない */
export function requireVar(env: Bindings, name: 'API_KEY' | 'ODPT_CONSUMER_KEY' | 'ODPT_BASE_URL'): string {
  const value = env[name]
  if (!value) {
    console.error(`[config] ${name} is not configured on the server`)
    throw new HTTPException(500, { message: `Server misconfiguration: ${name} is not set` })
  }
  return value
}
