import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// 测试配置独立于 vite.config.ts：跑单测不需要 vue-devtools / dev proxy，
// 只保留路径别名，避免构建插件在测试环境产生副作用。
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // 测试统一放在同层 __tests__/ 下：tsconfig.app.json 已排除该目录，
    // 避免 vitest 的类型被拉进应用类型检查（npm run build 会跑 type-check）。
    include: ['src/**/__tests__/**/*.spec.ts'],
  },
})
