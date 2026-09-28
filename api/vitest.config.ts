import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// nuxt.config.ts の nitro.alias '#server' はビルド時(Nitro)にしか解決されないため、
// テスト実行用にも同じエイリアスを独立して定義する（vite.config.ts が存在しないため
// nuxt/Nitro の設定は継承されない前提で、必要なものだけをここに書く）。
export default defineConfig({
  resolve: {
    alias: {
      '#server': fileURLToPath(new URL('./server', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.{test,spec}.ts'],
    environment: 'node',
  },
})
