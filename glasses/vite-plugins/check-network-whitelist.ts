import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

interface AppJsonPermission {
  name: string
  desc: string
  whitelist?: string[]
}

interface AppJson {
  permissions?: AppJsonPermission[]
}

function originOf(url: string): string {
  return new URL(url).origin
}

/**
 * VITE_API_BASE_URL の origin が app.json の network permission whitelist に
 * 含まれているかを検証し、あわせて必須の環境変数（VITE_API_BASE_URL / VITE_API_KEY）が
 * 本番ビルドで欠落していないかを検証する vite plugin。
 *
 * - 本番ビルド（`vp build`、mode=production）: VITE_API_BASE_URL / VITE_API_KEY のいずれかが未設定なら即エラー（本番ビルドは必須設定）。
 *   開発専用の VITE_DEV_FIXED_LOCATION が設定されている場合もエラー（現在地固定の配布物を作らないため）。
 * - `vite dev` / `vite build` 共通: VITE_API_BASE_URL が設定されている場合、その origin が
 *   app.json の whitelist に含まれていなければエラー（審査・実機で確実に失敗するため fail-fast）。
 * - `vite dev` で VITE_API_BASE_URL / VITE_API_KEY が未設定の場合はここでは何もしない
 *   （src/env.ts のランタイムエラー画面に委ねる）。
 */
export function checkNetworkWhitelist(): Plugin {
  return {
    name: 'check-network-whitelist',
    configResolved(resolvedConfig) {
      const apiBaseUrl = resolvedConfig.env.VITE_API_BASE_URL as string | undefined
      const apiKey = resolvedConfig.env.VITE_API_KEY as string | undefined

      // 本番ビルドの判定は command と mode の両方で行う。Vite+ の lint/fmt（Oxlint/Oxfmt）は
      // vite.config.ts の lint/fmt ブロックを読むために resolveConfig(..., 'build') を
      // mode=development で呼ぶため、command だけで判定すると設定の読み込み時に誤発火する。
      const isProductionBuild = resolvedConfig.command === 'build' && resolvedConfig.mode === 'production'
      if (isProductionBuild) {
        const missing = [!apiBaseUrl && 'VITE_API_BASE_URL', !apiKey && 'VITE_API_KEY'].filter((v): v is string => Boolean(v))
        if (resolvedConfig.env.VITE_DEV_FIXED_LOCATION) {
          throw new Error(
            '[check-network-whitelist] VITE_DEV_FIXED_LOCATION は開発専用です。本番ビルドでは現在地を固定できないよう、設定を外してください。',
          )
        }
        if (missing.length > 0) {
          throw new Error(
            `[check-network-whitelist] ${missing.join(', ')} が設定されていません。本番ビルドには必須です。` +
              ' glasses/.env.example を参考に .env を用意するか、環境変数で指定してください。',
          )
        }
      }

      if (!apiBaseUrl) return

      const appJsonPath = path.resolve(resolvedConfig.root, 'app.json')
      const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8')) as AppJson
      const whitelist = appJson.permissions?.find((p) => p.name === 'network')?.whitelist ?? []
      const requiredOrigin = originOf(apiBaseUrl)
      const allowed = whitelist.some((entry) => originOf(entry) === requiredOrigin)

      if (!allowed) {
        throw new Error(
          `[check-network-whitelist] VITE_API_BASE_URL の origin (${requiredOrigin}) が ` +
            `app.json の permissions[network].whitelist に含まれていません。` +
            ` whitelist: ${JSON.stringify(whitelist)}`,
        )
      }
    },
  }
}
