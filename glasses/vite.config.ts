import { defineConfig } from 'vite'
import { checkNetworkWhitelist } from './vite-plugins/check-network-whitelist.ts'

export default defineConfig({
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
  plugins: [checkNetworkWhitelist()],
})
