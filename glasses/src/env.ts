// ビルド時に埋め込まれる設定値。デフォルト値へのフォールバックは行わない
// （未設定は「設定不足」であり、隠さずに起動時エラーとして表面化させる）。

export interface EnvConfig {
  apiBaseUrl: string
  apiKey: string
  /**
   * 開発時（vite dev）だけ有効な現在地の固定値（VITE_DEV_FIXED_LOCATION）。未設定なら null で、
   * Even App の位置情報を使う。本番ビルドでは設定されていても無視せず、ビルド時にエラーにする
   * （vite-plugins/check-network-whitelist.ts 参照）。
   */
  devFixedLocation: string | null
}

export class MissingEnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingEnvError'
  }
}

/**
 * VITE_API_BASE_URL / VITE_API_KEY を読み取る。どちらか一方でも未設定・空文字の場合は例外を投げる。
 * 呼び出し側 (main.ts) がこれを捕捉してエラー画面を表示する。
 */
export function readEnvConfig(): EnvConfig {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  const apiKey = import.meta.env.VITE_API_KEY

  if (!apiBaseUrl || !apiKey) {
    const missing = [!apiBaseUrl && 'VITE_API_BASE_URL', !apiKey && 'VITE_API_KEY'].filter((v): v is string => Boolean(v))
    throw new MissingEnvError(
      `${missing.join(' / ')} が設定されていません。glasses/.env.example を参考に .env を用意してビルドし直してください。`,
    )
  }

  return { apiBaseUrl, apiKey, devFixedLocation: import.meta.env.DEV ? (import.meta.env.VITE_DEV_FIXED_LOCATION || null) : null }
}
