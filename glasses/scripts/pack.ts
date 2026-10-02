// yarn package:ehpk から呼ばれる。本番ビルド済みの dist/ を、本番 API の origin を差し込んだ
// パッケージ用 app.json（.pack/app.json、gitignore 済み）と一緒に .ehpk にまとめる。
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'
import { buildPackManifest, type AppJson } from './pack-manifest.ts'

const root = path.resolve(import.meta.dirname, '..')
const env = loadEnv('production', root, 'VITE_')
const apiBaseUrl = env.VITE_API_BASE_URL
if (!apiBaseUrl) {
  console.error('[pack] VITE_API_BASE_URL が設定されていません。glasses/.env.production を用意してください。')
  process.exit(1)
}

const appJson = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf-8')) as AppJson
const manifest = buildPackManifest(appJson, apiBaseUrl)

const packDir = path.join(root, '.pack')
mkdirSync(packDir, { recursive: true })
const manifestPath = path.join(packDir, 'app.json')
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const result = spawnSync('evenhub', ['pack', manifestPath, 'dist', '-o', 'departure.ehpk', '--sdk-ver', '0.0.16'], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
