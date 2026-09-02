import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Finance Planner',
        short_name: 'Finance',
        description: 'Personal finance dashboard over the Sambathikam Google Sheet workbook',
        theme_color: '#2a6fc0',
        background_color: '#f6f6f4',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      // No runtimeCaching entries: the Sheets API is cross-origin and
      // already cached by the app's own IndexedDB layer, so the default
      // config (precache built JS/CSS/HTML/icons only) is exactly right.
    }),
  ],
  base: '/finance-planner/',
  test: {
    setupFiles: ['tests/setup.ts'],
  },
})
