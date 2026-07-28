import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [vue(), vueDevTools({ launchEditor: 'code' })],
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
          charts: ['lightweight-charts'],
          // markdown 渲染（文档中心 / AI 聊天等公开页均需要）
          markdown: ['marked', 'highlight.js'],
          // md-editor-v3 体积最大且仅后台 QuestionEditor 使用，
          // 单独成块以免拖累使用 markdown 渲染的公开页面
          editor: ['md-editor-v3'],
          three: ['three'],
        },
      },
    },
  },
})
