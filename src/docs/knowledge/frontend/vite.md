---
group: 工程化与构建
order: 11
---

# Vite 构建与优化

> 适用场景：Vue 3 项目的构建工具链（开发服务器 + 生产打包）。本文讲配置、预构建、资源导入、分包、插件与构建优化，并结合 VueChest 实际用法。
> 阅读前提：了解 ES Module 与 npm 脚本。

Vite 的核心思路：**开发期用原生 ESM + 浏览器按需请求，不打包**（启动秒级）；**生产期用 Rollup 打包**（产物优化）。这就解释了为什么 `npm run dev` 极快而 `npm run build` 要等——两者走的完全不同的管线。

## 一、基础配置

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)), // 配置 @ -> src
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发期把 /api 代理到后端，避开跨域
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
```

> VueChest 用 `@` 别名指向 `src`，所有 import 走 `@/xxx`。`fileURLToPath` 比字符串拼接更稳（跨平台路径分隔符正确）。

## 二、预构建（optimizeDeps）

开发期 Vite 会用 esbuild **把 `node_modules` 里的 CommonJS/大依赖先打包成 ESM**，避免浏览器逐个请求上千个小文件：

```ts
export default defineConfig({
  optimizeDeps: {
    include: ['lodash-es', 'dayjs'],  // 强制预构建这些包
    exclude: ['vue-demi'],           // 跳过某些包
    esbuildOptions: { target: 'es2020' },
  },
})
```

> 现象：第一次启动某依赖较慢、之后变快，就是预构建在生效（产物缓存在 `node_modules/.vite`）。
> **坑**：改了 `optimizeDeps` 或依赖行为异常时，删 `.vite` 缓存（`rm -rf node_modules/.vite`）重启即可。

## 三、资源导入（VueChest 高频用法）

Vite 对资源有特殊的「后缀查询」导入方式，VueChest 大量使用 `?raw` 加载文档与样式：

```ts
// 1. ?raw —— 以字符串形式读取文件内容（不打成模块）
import docMd from './doc.md?raw'        // docMd 是 markdown 字符串
import tokensCss from '../public/tokens.css?raw' // 读取 CSS 文本

// 2. ?url —— 返回资源 URL（适合图片/字体等）
import logoUrl from '@/assets/logo.png?url'

// 3. ?worker —— 作为 Web Worker 导入（离线计算/密集任务）
import Worker from './heavy.worker.ts?worker'

// 4. 普通导入 —— 被打包进产物（JS/TS 模块）
import { format } from '@/utils'
```

> VueChest 文档中心（`src/docs`）正是用 `import xxx from './xxx.md?raw'` 把每篇 markdown 读成字符串，再交给 `marked` + `highlight.js` 渲染（见 `css-effects` 文末说明）。`public/tokens.css` 也通过 `?raw` 读取做主题注入。

## 四、分包（manualChunks）

生产打包默认按入口和动态 `import()` 自动拆 chunk。对大库可手动指定分包，避免单包过大、利于缓存：

```ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 把 echarts 单独拆成 vendor-echarts.xxx.js
          'vendor-echarts': ['echarts'],
          'vendor-three': ['three'],
          // 也可用函数形式按模块路径精细控制
        },
      },
    },
  },
})
```

> 路由懒加载（见 `vue-router`）已经自动产生「每路由一包」；`manualChunks` 是补充手段，优先按「变动频率」拆分（第三方库单独包，业务代码随发版变）。VueChest 把 three.js（赛车游戏）、echarts 等重型依赖都做了独立分包。

## 五、环境变量

```ts
// .env.production / .env.development
VITE_API_BASE_URL=https://server.020201.xyz

// 代码里读取（只有 VITE_ 前缀的才会暴露给客户端）
const apiBase = import.meta.env.VITE_API_BASE_URL
```

> **安全红线**：`VITE_` 前缀的变量会被打进前端产物（任何人可看）。**密钥/服务端凭证绝不能加 `VITE_`**，应放在后端 `.env`（如 VueChestServer 的 `.env`）。
> 命令行可临时覆盖：`VITE_API_BASE_URL=http://localhost:3000 npm run build`（VueChest 本地修线上数据时就这么用，**不写进 `.env.production`**）。

## 六、构建优化项

```ts
export default defineConfig({
  build: {
    target: 'es2020',            // 产出目标语法
    minify: 'esbuild',           // 压缩器，默认 esbuild（比 terser 快）
    sourcemap: false,            // 生产关 sourcemap（安全+体积）
    cssCodeSplit: true,          // CSS 也按 chunk 拆分
    chunkSizeWarningLimit: 1500, // 超过该体积才告警（默认 500KB）
    assetsInlineLimit: 4096,     // <4KB 资源内联成 base64
  },
})
```

> 体积告警只是提醒，不代表错误。真正优化靠：**路由分包 + 大库 manualChunks + 用到的 API 按需引入**（如 `import dayjs from 'dayjs'` 而非全量 moment）。

## 七、插件生态

Vite 插件在 `plugins` 数组顺序执行，常见：

- `@vitejs/plugin-vue`：编译 `.vue` 单文件组件（必装）。
- `unplugin-auto-import` / `unplugin-vue-components`：API 与组件自动按需引入（省去手写 import）。
- `vite-plugin-pwa`：把站点变成 PWA（离线可用）。
- `@vitejs/plugin-legacy`：为旧浏览器生成兼容包（现代项目多已不需要）。

> 插件顺序有讲究：某些插件要求放在特定位置（如 `vue` 通常先于 auto-import）。加插件前看官方文档的「order」说明。

## 八、开发服务器原理小结

Vite dev 不打包，而是：浏览器请求 `main.ts` → Vite 即时编译该文件并改写 import 指向 → 浏览器再请求下一层 → 按需编译。所以**改哪个文件只编译哪个**，启动与热更新都极快。代价是首屏（尤其依赖多时）会有较多请求，生产构建用 Rollup 解决了这点。

## 参考来源

- Vite 官方文档：<https://vitejs.dev/>
- 配置参考：<https://vitejs.dev/config/>
- 静态资源处理：<https://vitejs.dev/guide/assets.html>
- 构建优化：<https://vitejs.dev/guide/build.html>
- 依赖预构建：<https://vitejs.dev/guide/dep-pre-bundling.html>
