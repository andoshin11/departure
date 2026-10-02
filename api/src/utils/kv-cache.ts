/**
 * Cloudflare KV を使った関数結果のキャッシュ。
 *
 * KV の値は `{ expiresAt, value }` の形で保存し、読み出し時に expiresAt を自分で確認する。
 * KV の expirationTtl だけに頼ると、KV のエッジキャッシュ（結果整合）により期限切れ直後の値が
 * しばらく返ることがあり、運行情報（60秒）のような短い期間を守れないため。
 * expirationTtl は KV から古いエントリを消すためだけに使う（KV の下限は 60 秒）。
 *
 * 書き込みの失敗（同じキーへの同時書き込みによる 429 等）はログに残してキャッシュなしで結果を返す。
 * キャッシュは ODPT への負荷と応答時間を下げるための最適化で、結果の正しさには影響しないため。
 * 読み出しの失敗や保存形式の不一致は、KV 側の障害や実装のバグなのでそのまま投げる。
 */

/** 保存形式を変えたら上げる。古い形式のエントリを読まないよう、キーの先頭に付ける */
const FORMAT_VERSION = 'v1'
const KV_MIN_EXPIRATION_TTL_SECONDS = 60

interface Entry<T> {
  expiresAt: number
  value: T
}

function isEntry(data: unknown): data is Entry<unknown> {
  return typeof data === 'object' && data !== null && 'expiresAt' in data && typeof data.expiresAt === 'number' && 'value' in data
}

export interface CacheOptions {
  /** キャッシュの名前（キーの名前空間） */
  name: string
  /** KV のキー長上限は 512 バイト。長くなりうるものはハッシュ化して渡す */
  key: string
  maxAgeSeconds: number
  /** 現在時刻（テスト用） */
  now?: () => number
}

export async function cached<T>(kv: KVNamespace, options: CacheOptions, load: () => Promise<T>): Promise<T> {
  const { name, key, maxAgeSeconds, now = Date.now } = options
  const kvKey = `${FORMAT_VERSION}:${name}:${key}`

  const stored = await kv.get<unknown>(kvKey, 'json')
  if (stored !== null) {
    if (!isEntry(stored)) throw new Error(`[cache] unexpected entry format: key=${kvKey}`)
    if (stored.expiresAt > now()) return stored.value as T
  }

  const value = await load()
  const entry: Entry<T> = { expiresAt: now() + maxAgeSeconds * 1000, value }
  try {
    await kv.put(kvKey, JSON.stringify(entry), { expirationTtl: Math.max(maxAgeSeconds, KV_MIN_EXPIRATION_TTL_SECONDS) })
  } catch (error) {
    console.error(`[cache] failed to write: key=${kvKey}`, error)
  }
  return value
}
