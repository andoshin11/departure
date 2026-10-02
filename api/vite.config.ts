import { defineConfig } from 'vite-plus'

// api/ は wrangler がバンドル・実行するため、Vite+ はテスト（vp test）・整形（vp fmt）・lint と型チェック（vp lint / vp check）にだけ使う。
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },

  // `vp fmt` / `vp check`（Oxfmt）。glasses/vite.config.ts と同じ設定。
  fmt: {
    printWidth: 140,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    ignorePatterns: ['dist/**', '.wrangler/**'],
  },

  // `vp lint` / `vp check`（Oxlint）。glasses/vite.config.ts と同じ設定（eslint:recommended + typescript-eslint recommended 相当）。
  lint: {
    plugins: ['eslint', 'typescript', 'oxc'],
    categories: { correctness: 'error' },
    ignorePatterns: ['dist/**', '.wrangler/**'],
    rules: {
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
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
})
