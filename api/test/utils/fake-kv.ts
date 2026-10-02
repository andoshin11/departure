/** テスト用の KVNamespace。cached() が使う get(key, 'json') と put だけを Map で実装する */
export interface FakeKv {
  kv: KVNamespace
  store: Map<string, string>
  /** put を失敗させる（同じキーへの同時書き込みによる 429 等を模す） */
  failPut: (error: Error | null) => void
}

export function createFakeKv(): FakeKv {
  const store = new Map<string, string>()
  let putError: Error | null = null
  const kv = {
    async get(key: string, type: string) {
      if (type !== 'json') throw new Error(`fake KV supports only json reads: ${type}`)
      const raw = store.get(key)
      return raw === undefined ? null : JSON.parse(raw)
    },
    async put(key: string, value: string) {
      if (putError) throw putError
      store.set(key, value)
    },
  }
  return {
    kv: kv as unknown as KVNamespace,
    store,
    failPut: (error) => {
      putError = error
    },
  }
}
