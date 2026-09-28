import { defineConfig } from 'vitest/config'

// vite.config.ts の check-network-whitelist プラグイン（.env / app.json 依存）を
// テスト実行に持ち込まないよう、あえて vite.config.ts を継承しない独立設定にしている。
export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec}.ts'],
    environment: 'node',
  },
})
