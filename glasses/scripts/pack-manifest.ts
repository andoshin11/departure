// .ehpk に同梱する app.json（パッケージ用マニフェスト）を組み立てる純粋関数。
//
// 本番 API の URL をリポジトリに載せないため、コミットしている app.json の network whitelist には
// 開発用の http://localhost:3000 だけを書き、パッケージ時に .env.production の VITE_API_BASE_URL から
// 本番の origin を差し込む。パッケージ用の whitelist は本番の origin だけにする（Even Hub の審査では
// 未使用の接続先を whitelist に残さないことが求められるため、開発用の localhost はここで外す）。

export interface AppJsonPermission {
  name: string
  desc: string
  whitelist?: string[]
}

export interface AppJson {
  permissions?: AppJsonPermission[]
  [key: string]: unknown
}

/** 本番 API の base URL から whitelist に書く origin を求める。https 以外は受け付けない（fail-fast） */
export function productionOrigin(apiBaseUrl: string): string {
  let url: URL
  try {
    url = new URL(apiBaseUrl)
  } catch {
    throw new Error(`VITE_API_BASE_URL が URL として解釈できません: ${apiBaseUrl}`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`本番の VITE_API_BASE_URL は https である必要があります: ${url.origin}`)
  }
  return url.origin
}

/**
 * コミットしている app.json を元に、network whitelist を本番の origin だけに置き換えたマニフェストを返す。
 * network 権限が無い app.json は設定ミスなので例外にする（API に接続できないパッケージを作らないため）。
 */
export function buildPackManifest(appJson: AppJson, apiBaseUrl: string): AppJson {
  const origin = productionOrigin(apiBaseUrl)
  const permissions = appJson.permissions ?? []
  if (!permissions.some((p) => p.name === 'network')) {
    throw new Error('app.json に network 権限がありません')
  }
  return {
    ...appJson,
    permissions: permissions.map((p) => (p.name === 'network' ? { ...p, whitelist: [origin] } : p)),
  }
}
