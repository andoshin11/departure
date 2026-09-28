/** クエリ文字列の数値を範囲チェック付きで読む。不正なら null（呼び出し側で 400 にする） */
export function parseCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

/** radius は 1 以上 max 以下の整数 */
export function parseRadius(value: unknown, max: number): number | null {
  const n = parseCoordinate(value, 1, max)
  return n !== null && Number.isInteger(n) ? n : null
}

const STATION_ID_RE = /^odpt\.Station:[A-Za-z0-9_.-]+$/

export function isStationId(value: unknown): value is string {
  return typeof value === 'string' && STATION_ID_RE.test(value)
}
