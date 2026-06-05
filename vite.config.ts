import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_CONFIG } from './src/config/app'

export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-mask-512.png'],
      manifest: {
        name: APP_CONFIG.fullName,
        short_name: APP_CONFIG.pwa.shortName,
        description: APP_CONFIG.description,
        theme_color: APP_CONFIG.pwa.themeColor,
        background_color: APP_CONFIG.pwa.backgroundColor,
        display: APP_CONFIG.pwa.display,
        orientation: APP_CONFIG.pwa.orientation,
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-mask-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: [...APP_CONFIG.pwa.categories],
        lang: APP_CONFIG.pwa.lang,
        dir: 'ltr',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/www\.google\.com\/s2\/favicons\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'favicons-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.siliconflow\.cn\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    proxy: {
      '/api/stock-search': {
        target: 'https://smartbox.gtimg.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/stock-search/, '/s3/'),
      },
      '/api/stock-kline': {
        target: 'https://web.ifzq.gtimg.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/stock-kline/, ''),
      },
      '/api/stock': {
        target: 'http://qt.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stock/, ''),
      },
      '/meting-api': {
        target: 'https://meting.mikus.ink',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/meting-api/, '/api'),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
})
