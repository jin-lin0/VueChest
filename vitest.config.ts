import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 测试配置独立于 vite.config.ts：跑单测不需要 vue-devtools / dev proxy，
// 保留路径别名，并使用 Vue 插件编译组件测试导入的 .vue 文件。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // 音频 DSP 端到端用例会执行完整合成谱面；在并行测试或低功耗环境下
    // 偶尔超过 Vitest 默认 5 秒，给计算型测试留出稳定的回归窗口。
    testTimeout: 15_000,
    // 统一收集宿主、市场应用及构建脚本测试，复用根目录依赖。
    include: [
      'src/**/__tests__/**/*.spec.ts',
      'market-apps/**/__tests__/**/*.spec.ts',
      'scripts/**/__tests__/**/*.spec.ts',
    ],
  },
})
