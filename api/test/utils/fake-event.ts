import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEvent, type H3Event } from 'h3'

/**
 * middleware / event handler のユニットテスト用に、Node の IncomingMessage / ServerResponse を
 * 最小限だけ模した H3Event を作る。
 *
 * h3 の getRequestURL / getHeader / sendNoContent 等が実際に参照するプロパティ
 * (node.req.url, node.req.headers, node.res.setHeader/writeHead/end 等) のみを用意する。
 */
export interface FakeEventOptions {
  method?: string
  url?: string
  headers?: Record<string, string>
}

export interface FakeResponse {
  statusCode: number
  headersSent: boolean
  writableEnded: boolean
  headers: Record<string, string>
  setHeader: (name: string, value: string) => void
  getHeader: (name: string) => string | undefined
  removeHeader: (name: string) => void
  writeHead: (statusCode: number) => void
  end: (data?: unknown) => void
}

function createFakeResponse(): FakeResponse {
  const headers: Record<string, string> = {}
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    headers,
    setHeader(name, value) {
      headers[name] = value
    },
    getHeader(name) {
      return headers[name]
    },
    removeHeader(name) {
      Reflect.deleteProperty(headers, name)
    },
    writeHead(statusCode) {
      this.statusCode = statusCode
      this.headersSent = true
    },
    end() {
      this.writableEnded = true
    },
  }
}

export function createFakeEvent(options: FakeEventOptions = {}): { event: H3Event; res: FakeResponse } {
  const { method = 'GET', url = '/', headers = {} } = options

  const readable = new Readable({ read() {} })
  readable.push(null)
  const req = Object.assign(readable, { method, url, headers }) as unknown as IncomingMessage

  const res = createFakeResponse()
  const event = createEvent(req, res as unknown as ServerResponse)

  return { event, res }
}
