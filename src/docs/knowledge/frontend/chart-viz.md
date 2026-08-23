---
group: 可视化与图形
order: 24
---

# 前端图表与可视化

> 数据要"看得见"才有价值。本文对比 SVG/Canvas/WebGL 三类渲染基底，讲清 ECharts / D3 / Canvas 自绘的取舍，以及大数据量、响应式、与 Vue 集成的实战要点（可与 `canvas-webgl.md` 互参）。

## 一、渲染基底对比

| 基底          | 特点                                | 适用                         |
| ------------- | ----------------------------------- | ---------------------------- |
| **SVG**       | DOM 节点，易交互/可访问、元素多则卡 | 图表元素 < 1k、需 hover/点击 |
| **Canvas 2D** | 像素绘制，万级点流畅、无 DOM        | 大散点、实时折线、热力       |
| **WebGL**     | GPU，百万级、3D                     | 地理大屏、3D 可视化          |

> 经验：普通业务图表（折线/柱/饼）用 SVG 类库（ECharts 默认 SVG 或 Canvas 自动切）最省心；实时/海量数据上 Canvas；炫酷大屏上 WebGL/Three.js（见 `canvas-webgl.md`）。

## 二、库选型

| 库               | 定位                 | 特点                                        |
| ---------------- | -------------------- | ------------------------------------------- |
| **ECharts**      | 开箱即用图表         | 配置驱动、类型全、中文文档好、自带动画/交互 |
| **D3**           | 底层数据驱动 DOM/SVG | 灵活到能做任意定制图，学习曲线陡            |
| **Chart.js**     | 轻量图表             | 体积小、够用就好                            |
| **AntV (G2/G6)** | 蚂蚁系               | 统计图/关系图强                             |

## 三、ECharts 与 Vue 集成

```vue
<script setup>
import * as echarts from 'echarts'
import { onMounted, onBeforeUnmount, ref } from 'vue'

const el = ref(null)
let chart
onMounted(() => {
  chart = echarts.init(el.value)
  chart.setOption({
    /* 配置 */
  })
  window.addEventListener('resize', resize)
})
function resize() {
  chart?.resize()
} // 响应式
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose() // 必须销毁，防内存泄漏
})
</script>
```

要点：`resize()` 保证容器变化图表自适应；`dispose()` 在卸载时释放，避免内存泄漏（SPA 切路由尤要注意）。

## 四、大数据量优化

- **降采样**：百万点用 `dataZoom` + `sampling: 'lttb'` 抽稀。
- **增量渲染**：实时数据用 `appendData` / `setOption` 增量，而非全量重绘。
- **Canvas 而非 SVG**：`renderer: 'canvas'` 应对高频更新。
- **分块/Web Worker**：重计算（聚合）放 Worker，主线程只画图。
- **避免每帧 new Option**：复用 option 对象，只改数据字段。

## 五、响应式与可访问性

- 容器用 `ResizeObserver` 比 `window.resize` 更精准（避免父级尺寸变化漏监听）。
- 可访问性：图表旁配 `<table>` 或 `aria` 描述数据要点（见 `accessibility.md`），别只给一张图。
- 暗色模式：ECharts 主题切换（见 `design-token.md` 的 `getAppTheme()` 监听）。

## 六、常见坑

- **内存泄漏**：忘了 `dispose()`，路由来回切图表堆积。
- **尺寸为 0**：容器未渲染完就 `init`，拿到 0 宽高 → 在 `onMounted` + `nextTick` 后初始化，或先给固定高度。
- **频繁 setOption 卡顿**：实时场景用增量 + 节流。
- **移动端模糊**：`devicePixelRatio` 适配（`echarts.init(el, null, { renderer })` 已处理 DPR）。

## 七、小结

- SVG（交互好）/ Canvas（量大）/ WebGL（炫酷）按数据规模选。
- ECharts 配置驱动最省心；务必 `resize` + `dispose`。
- 海量数据靠降采样/增量/Worker；可访问性别只给图。

## 参考来源

- ECharts 文档：<https://echarts.apache.org/zh-cn/docs/index.html>
- D3 文档：<https://d3js.org/>
- MDN Canvas：<https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API>
