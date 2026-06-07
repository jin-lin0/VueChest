import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['iife'],
      name: 'MarketApp',
      fileName: () => 'app.js',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'window.__VueChest__.Vue',
        },
      },
    },
  },
})
