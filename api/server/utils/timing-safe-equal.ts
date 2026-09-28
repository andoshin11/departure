/**
 * 文字列を定数時間で比較する純粋関数。
 *
 * API Key の比較に `===` を使うと、文字列の不一致箇所（先頭から何文字目で異なるか）に応じて
 * 比較にかかる時間が変わり、タイミング攻撃で正解の API Key を推測される余地が生まれる。
 * そのため長さの違いを含めて常に固定長（両文字列のうち長い方の長さ）を走査し、
 * 早期 return をしない実装にしている。
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  const length = Math.max(aBytes.length, bBytes.length)

  let diff = aBytes.length ^ bBytes.length
  for (let i = 0; i < length; i++) {
    const x = i < aBytes.length ? aBytes[i]! : 0
    const y = i < bBytes.length ? bBytes[i]! : 0
    diff |= x ^ y
  }
  return diff === 0
}
