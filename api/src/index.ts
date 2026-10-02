import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { API_KEY_HEADER } from '@departure/shared'
import type { AppEnv } from './env'
import { apiKeyAuth } from './middleware/auth'
import { departures } from './routes/departures'
import { stations } from './routes/stations'

// api/ は ODPT API を中継する Cloudflare Workers（Hono）。
// ODPT の consumerKey をクライアント（.ehpk）に埋め込まないため、ODPT へのアクセスは必ずここを経由する。

const app = new Hono<AppEnv>()

// 処理順は「CORS/OPTIONS → 認証 → ルート」。
// OPTIONS preflight は cors() が 204 で完結させ、API Key を持たない preflight を認証で落とさない。
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', API_KEY_HEADER],
  }),
)
app.use('/api/*', apiKeyAuth)

app.route('/api/stations', stations)
app.route('/api/departures', departures)

// エラーは { statusCode, message } の JSON で返す。想定外の例外は原因をログに残して 500 にする。
app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ statusCode: error.status, message: error.message }, error.status)
  }
  console.error(`[app] unhandled error: ${c.req.method} ${c.req.path}`, error)
  return c.json({ statusCode: 500, message: 'Internal Server Error' }, 500)
})

export default app
