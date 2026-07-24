# 前端性能优化指南

性能优化的目标是让页面**加载快、响应快、视觉稳**。本指南按"指标 → 加载 → 渲染 → 运行时 → Vue 3 专项 → 测量"组织，每项给出**做什么 / 为什么 / 怎么做**，可直接照抄落地。

## 一、Core Web Vitals（核心指标）

Google 用三个真实用户指标衡量体验，阈值在**第 75 百分位**评估（移动端与桌面端分别统计）。INP 已于 2024 年 3 月取代 FID。

| 指标 | 含义 | 良好 | 需改进 | 差 |
| --- | --- | --- | --- | --- |
| LCP（Largest Contentful Paint） | 最大内容绘制，主内容加载速度 | ≤ 2.5s | 2.5–4.0s | > 4.0s |
| INP（Interaction to Next Paint） | 交互到下次绘制，整体响应速度 | ≤ 200ms | 200–500ms | > 500ms |
| CLS（Cumulative Layout Shift） | 累计布局偏移，视觉稳定性 | ≤ 0.1 | 0.1–0.25 | > 0.25 |

**做什么 / 为什么 / 怎么做**

- **LCP**：最大内容（通常是首屏图片或大标题）出现太慢 = 用户觉得"没打开"。优化手段见下一节"加载优化"。
- **INP**：几乎都是 JS 问题——主线程被长任务占用，点按无响应。拆分为小任务、延迟第三方脚本、精简事件处理函数。
- **CLS**：图片/广告/字体加载后把内容挤动，导致误触。给媒体元素预留宽高、用 `font-display: swap`、为广告位预留空间。

## 二、加载优化

### 1. 代码分割：动态 import 与路由懒加载

**做什么**：把不首屏必需的代码拆成独立 chunk，按需加载。
**为什么**：首屏只下载当前路由需要的 JS，显著减小初始 bundle，改善 LCP 与 INP。
**怎么做**：

```js
// 路由懒加载（Vue Router）
const routes = [
  { path: '/detail/:id', component: () => import('../views/Detail.vue') },
  { path: '/settings', component: () => import('../views/Settings.vue') },
]

// 任意位置的动态 import
button.addEventListener('click', async () => {
  const { heavyCompute } = await import('./heavy')
  heavyCompute()
})
```

### 2. 资源压缩：gzip / brotli

**做什么**：构建期预压缩 JS/CSS/HTML，配合服务器直返压缩包。
**为什么**：文本资源体积可减少 60%–80%，降低传输耗时与带宽。
**怎么做**（Vite 用 `vite-plugin-compression`）：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import viteCompression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    viteCompression({ algorithm: 'gzip', ext: '.gz', threshold: 10240 }),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br', threshold: 10240 }),
  ],
})
```

服务器（Nginx）开启静态预压缩：`gzip_static on;` 与 `brotli_static on;`，并按 `Accept-Encoding` 返回 `.gz` / `.br`。

### 3. Tree Shaking 与按需引入

**做什么**：只打包被实际引用的代码。
**为什么**：消除死代码，减小 bundle。
**怎么做**：

- 用 ES Module（`import`/`export`），避免副作用写法；`package.json` 标注 `"sideEffects": false`。
- UI 库按需引入，而非整包 `import ElementPlus from 'element-plus'`：

```ts
// 推荐：按需
import { ElButton } from 'element-plus'
// 配合 unplugin-vue-components 可自动按需引入
```

### 4. 图片优化

**做什么**：用现代格式、懒加载、响应式尺寸。
**为什么**：图片常是 LCP 元素，也是体积大头。
**怎么做**：

```html
<!-- 首屏 LCP 图片：不要加 loading="lazy"，可 preload -->
<img src="hero.avif" width="1200" height="630" alt="封面" fetchpriority="high" />

<!-- 非首屏：原生懒加载 + 显式宽高防止 CLS -->
<img src="banner.webp" srcset="banner-480.webp 480w, banner-1200.webp 1200w"
     sizes="(max-width: 600px) 480px, 1200px"
     loading="lazy" decoding="async" width="1200" height="300" alt="横幅" />
```

要点：优先 WebP/AVIF（比 JPEG 小 30%–60%）；给所有图片设 `width`/`height` 预留空间；首屏图禁用懒加载。

### 5. 字体优化

**做什么**：用 `font-display: swap` 避免文字"隐形"。
**为什么**：默认 `block` 期间文字不可见，拖慢感知速度并引发 CLS。
**怎么做**：

```css
@font-face {
  font-family: 'Custom';
  src: url('/fonts/custom.woff2') format('woff2');
  font-display: swap; /* 先显示回退字体，加载完再替换 */
}
```

配合 `<link rel="preload" href="/fonts/custom.woff2" as="font" type="font/woff2" crossorigin>` 预加载关键字体。

### 6. 预加载：preload / prefetch

**做什么**：`preload` 提前加载当前页关键资源；`prefetch` 空闲时预取下一页资源。
**为什么**：让关键资源尽早开始下载，缩短 LCP；用空闲带宽提升后续导航速度。
**怎么做**：

```html
<link rel="preload" as="image" href="/hero.avif" />
<link rel="prefetch" as="script" href="/views/Detail.vue" />
```

## 三、渲染优化

### 1. 减少重排（reflow）与重绘（repaint）

**做什么 / 为什么**：布局与绘制昂贵，频繁触发会掉帧。
**怎么做**：

- 批量读写 DOM：先读 `offsetHeight` 再统一写，避免"读-写-读"循环强制同步布局。
- 用 `DocumentFragment` 或 `requestAnimationFrame` 批量插入节点。
- 离屏修改：先把元素 `display:none` 改完再显示，或用 `cloneNode` 改完替换。

### 2. 动画只用 transform / opacity

**做什么**：动画只改 `transform` 与 `opacity`。
**为什么**：这两个属性可由合成器（compositor）独立处理，**不触发重排/重绘**，最流畅。
**怎么做**：

```css
/* 推荐：只动 transform/opacity */
.box { transition: transform 0.2s ease, opacity 0.2s ease; }
.box:hover { transform: translateX(8px); opacity: 0.8; }

/* 避免：会触发布局重算 */
.bad { transition: left 0.2s, width 0.2s; }
```

### 3. will-change 谨慎使用

**做什么**：仅在即将发生复杂动画的元素上临时加 `will-change`。
**为什么**：它会提升图层、占用内存；滥用反而更卡。
**做法**：动画结束移除；不要写进通配符或大量元素。

### 4. 虚拟列表（长列表）

**做什么**：只渲染可视区域内的若干行。
**为什么**：上万条 DOM 节点会拖慢渲染与 INP。
**怎么做**：用 `vue-virtual-scroller` 等库，或自行监听滚动计算 `start/end` 切片。

### 5. 防抖与节流

**做什么**：高频事件（输入、滚动、resize）限频。
**为什么**：避免每次触发都执行昂贵逻辑。
**怎么做**：

```js
function debounce(fn, wait = 300) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait) }
}
function throttle(fn, wait = 200) {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= wait) { last = now; fn(...args) }
  }
}
searchInput.addEventListener('input', debounce(query, 300))
window.addEventListener('scroll', throttle(onScroll, 200))
```

## 四、运行时优化

### 1. 避免大型 bundle：可视化分析

**做什么**：定期分析依赖体积，定位"体重"来源。
**为什么**：看不见就优化不了。
**怎么做**：

```bash
# webpack 项目
npm i -D webpack-bundle-analyzer
# vite 项目
npm i -D rollup-plugin-visualizer
```

```ts
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'
export default defineConfig({
  plugins: [visualizer({ open: true, filename: 'stats.html' })],
})
```

### 2. 缓存策略

**做什么 / 为什么**：让重复访问零网络往返，直接命中缓存。
**怎么做**：

- **HTTP 缓存**：带 hash 的静态资源设 `Cache-Control: max-age=31536000, immutable`；HTML 用 `no-cache` 以便版本更新。
- **Service Worker**：用 Vite 的 `vite-plugin-pwa` 启用离线缓存与运行时缓存。

```ts
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  plugins: [VitePWA({ registerType: 'autoUpdate', workbox: { globPatterns: ['**/*.{js,css,html,svg}'] } })],
})
```

### 3. CDN

**做什么**：把静态资源放到边缘节点。
**为什么**：缩短物理距离与 TTFB，提升 LCP。
**做法**：构建产物上传对象存储/CDN；`publicPath` 指向 CDN 域名。

## 五、Vue 3 专项优化

### 1. v-once 与 v-memo

```vue
<template>
  <!-- v-once：内容永不变，渲染一次即可 -->
  <p v-once>{{ staticText }}</p>

  <!-- v-memo：依赖不变则跳过子树更新 -->
  <div v-for="item in list" :key="item.id" v-memo="[item.id]">
    {{ item.label }}
  </div>
</template>
```

**为什么**：跳过不需要的重新渲染，降低组件更新开销。

### 2. computed 缓存

**做什么**：派生状态用 `computed` 而非在模板里写复杂表达式或 `methods`。
**为什么**：`computed` 基于响应式依赖缓存，依赖不变不重算。

```vue
<script setup>
import { ref, computed } from 'vue'
const list = ref([])
const total = computed(() => list.value.reduce((s, i) => s + i.price, 0))
</script>
```

### 3. 异步组件 defineAsyncComponent

**做什么**：把重组件异步加载，配合 `<Suspense>` 或加载态。
**为什么**：拆分 bundle、避免阻塞首屏。

```vue
<script setup>
import { defineAsyncComponent } from 'vue'
const Chart = defineAsyncComponent(() => import('./BigChart.vue'))
const ChartWithFallback = defineAsyncComponent({
  loader: () => import('./BigChart.vue'),
  loadingComponent: Loading,
  errorComponent: ErrorComp,
  delay: 200,
})
</script>
```

### 4. keep-alive 缓存组件实例

**做什么**：对频繁切换的视图用 `<keep-alive>` 保留状态、避免重复创建。
**为什么**：减少挂载/卸载成本，提升切换流畅度。

```vue
<template>
  <router-view v-slot="{ Component }">
    <keep-alive include="Home,Profile">
      <component :is="Component" />
    </keep-alive>
  </router-view>
</template>
```

### 5. shallowRef / shallowReactive 处理大对象

**做什么**：对大型、深层或第三方（如图表实例、大数组）对象用浅响应式。
**为什么**：深层 `reactive` 会递归代理每个属性，成本高；浅响应式只跟踪 `.value`/顶层。

```vue
<script setup>
import { shallowRef, shallowReactive, triggerRef } from 'vue'
const bigList = shallowRef([]) // 替换整个数组才触发更新
function update() { bigList.value = fetchNew(); triggerRef(bigList) }

const state = shallowReactive({ items: [] }) // 只追踪 state 自身赋值
</script>
```

## 六、测量工具

| 工具 | 用途 | 何时用 |
| --- | --- | --- |
| Lighthouse | 综合跑分（CWV、最佳实践） | 本地/CI 快速体检 |
| Chrome DevTools Performance | 录制火焰图、定位长任务、FPS | 定位具体卡顿根因 |
| Performance API | 代码内采集真实指标上报 | 监控线上真实用户数据 |

**Lighthouse**：DevTools → Lighthouse → 选 Mobile → 生成报告，关注 LCP/INP/CLS 与建议项。

**DevTools Performance**：点 Record，操作页面后停止，查看 Main 线程长任务（>50ms 标红）与帧率。

**Performance API（代码中采集）**：

```js
// 采集 LCP
new PerformanceObserver((list) => {
  const entries = list.getEntries()
  console.log('LCP:', entries[entries.length - 1].startTime)
}).observe({ type: 'largest-contentful-paint', buffered: true })

// 采集 CLS
let cls = 0
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value
}).observe({ type: 'layout-shift', buffered: true })
```

## 七、落地清单（优先做高杠杆项）

1. 给所有图片设宽高 + 首屏图 `preload`、非首屏 `loading="lazy"`。
2. 路由懒加载 + `vite-plugin-compression` 出 gzip/brotli。
3. 字体 `font-display: swap` 并预加载关键字体。
4. 用 `visualizer` 分析 bundle，移除/拆分重型依赖。
5. 动画仅用 `transform/opacity`，长列表上虚拟列表。
6. 高频事件加防抖/节流；大数据用 `shallowRef`。
7. 用 Lighthouse + Performance 面板建立基线，按 INP 长任务逐个击破。

> 提示：先量后优化。以 Lighthouse / 真实字段数据建立基线，优先修复影响第 75 百分位用户的高杠杆问题。
