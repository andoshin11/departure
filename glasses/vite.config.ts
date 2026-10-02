import { defineConfig } from 'vite-plus'
import { checkNetworkWhitelist } from './vite-plugins/check-network-whitelist.ts'

export default defineConfig({
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
  plugins: [checkNetworkWhitelist()],

  // `vp fmt` / `vp check`（Oxfmt）。既存コードのスタイル（セミコロンなし・シングルクォート）に合わせ、
  // 整形による差分が最小になる行幅にしている。
  fmt: {
    printWidth: 140,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    ignorePatterns: ['dist/**'],
  },

  // `vp lint` / `vp check`（Oxlint）。旧 ESLint 設定（eslint:recommended + typescript-eslint recommended）相当。
  lint: {
    plugins: ['eslint', 'typescript', 'oxc'],
    categories: { correctness: 'error' },
    ignorePatterns: ['dist/**'],
    rules: {
      // typescript-eslint recommended のうち、Oxlint の correctness カテゴリに含まれないもの。
      'typescript/no-explicit-any': 'error',
      'typescript/ban-ts-comment': 'error',
      'typescript/no-namespace': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'typescript/no-wrapper-object-types': 'error',
      'typescript/prefer-namespace-keyword': 'error',
      'typescript/triple-slash-reference': 'error',
      'no-unused-expressions': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // 全角スペース(U+3000)等を画面表示用の文字列で意図的に使う（display.md のフルワイド文字運用）。
      'no-irregular-whitespace': 'off',
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
})
