import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { runtimeCompilerGuard } from './scripts/runtime-compiler-guard'

export default defineConfig({
  plugins: [vue(), vueDevTools({ launchEditor: 'code' }), runtimeCompilerGuard()],
  server: {
    open: true,
    proxy: {
      '/meting-api': {
        target: 'https://meting.mikus.ink',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/meting-api/, '/api'),
      },
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // 第三方 CJS 依赖也只使用运行时，SFC 模板已在构建时编译。
      { find: /^vue$/, replacement: 'vue/dist/vue.runtime.esm-bundler.js' },
    ],
  },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
})
