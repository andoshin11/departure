import type { Plugin } from 'vite'
import { productionOrigin } from '../scripts/pack-manifest.ts'

/**
 * 本番ビルドに必要な環境変数を検証する vite plugin（設定不足は fail-fast）。
 *
 * - 本番ビルド（`vp build`、mode=production）:
 *   - VITE_API_BASE_URL / VITE_API_KEY のいずれかが未設定ならエラー。
 *   - VITE_API_BASE_URL が https でなければエラー（.ehpk の whitelist には本番の origin を差し込むため）。
 *   - 開発専用の VITE_DEV_FIXED_LOCATION が設定されていればエラー（現在地固定の配布物を作らないため）。
 * - 開発（`vp dev`）では何もしない。未設定の場合は src/env.ts のランタイムエラー画面に委ねる。
 *
 * 本番 API の origin はリポジトリの app.json に書かず、`yarn package:ehpk`（scripts/pack.ts）が
 * パッケージ用の app.json の network whitelist に差し込む。そのため whitelist との突き合わせはここでは行わない。
 */
export function checkBuildEnv(): Plugin {
  return {
    name: 'check-build-env',
    configResolved(resolvedConfig) {
      // 本番ビルドの判定は command と mode の両方で行う。Vite+ の lint/fmt（Oxlint/Oxfmt）は
      // vite.config.ts の lint/fmt ブロックを読むために resolveConfig(..., 'build') を
      // mode=development で呼ぶため、command だけで判定すると設定の読み込み時に誤発火する。
      const isProductionBuild = resolvedConfig.command === 'build' && resolvedConfig.mode === 'production'
      if (!isProductionBuild) return

      const apiBaseUrl = resolvedConfig.env.VITE_API_BASE_URL as string | undefined
      const apiKey = resolvedConfig.env.VITE_API_KEY as string | undefined

      if (resolvedConfig.env.VITE_DEV_FIXED_LOCATION) {
        throw new Error(
          '[check-build-env] VITE_DEV_FIXED_LOCATION は開発専用です。本番ビルドでは現在地を固定できないよう、設定を外してください。',
        )
      }
      const missing = [!apiBaseUrl && 'VITE_API_BASE_URL', !apiKey && 'VITE_API_KEY'].filter((v): v is string => Boolean(v))
      if (missing.length > 0) {
        throw new Error(
          `[check-build-env] ${missing.join(', ')} が設定されていません。本番ビルドには必須です。` +
            ' glasses/.env.example を参考に .env.production を用意するか、環境変数で指定してください。',
        )
      }
      try {
        productionOrigin(apiBaseUrl!)
      } catch (err) {
        throw new Error(`[check-build-env] ${(err as Error).message}`)
      }
    },
  }
}
