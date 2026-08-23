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

> 经验：普通业务图表优先成熟图表库。ECharts 默认 Canvas renderer，也可显式选择 SVG；它不会仅按数据量自动替你做所有渲染决策。实时/大量图元先用采样和 Canvas，只有已证实 GPU 适合的规模与效果再上 WebGL。

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

窗口尺寸不变时，侧栏展开和 Grid 布局也会改变容器，因此公共组件更适合用 ResizeObserver。初始化后保存 observer，卸载时与 chart 一起释放：

```ts
let observer: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  chart = echarts.init(el.value!, undefined, { renderer: 'canvas' })
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el.value!)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = undefined
})
```

## 四、大数据量优化

- **降采样**：百万点用 `dataZoom` + `sampling: 'lttb'` 抽稀。
- **增量渲染**：实时数据用 `appendData` / `setOption` 增量，而非全量重绘。
- **Canvas 而非 SVG**：`renderer: 'canvas'` 应对高频更新。
- **分块/Web Worker**：重计算（聚合）放 Worker，主线程只画图。
- **避免每帧 new Option**：复用 option 对象，只改数据字段。

先优化数据而不是只切 renderer：限制时间窗口、服务端聚合、按像素宽度降采样。屏幕只有 1200 个横向像素时展示百万个折线点不会增加可读信息。采样必须保留峰值、异常和统计语义，不能为了流畅让结论失真。

更新频率与绘制频率解耦：网络数据进入 buffer，按 rAF 或固定窗口批量刷新；隐藏标签页降低频率。Worker 适合聚合、布局和解析，但 Canvas 绘制是否移入 Worker 要看库对 OffscreenCanvas 的支持。

## 五、数据契约与视觉编码

把接口数据先转换成稳定的 chart model，组件不直接理解后端字段。模型明确维度、度量、单位、时区、缺失值与排序；同一指标在 tooltip、坐标轴和导出表格使用同一 formatter。颜色用于分类时保持跨页面一致，用于连续值时选择符合感知的色带。

```ts
interface SeriesPoint {
  timestamp: number
  value: number | null
}

function toSeries(rows: ApiRow[]): SeriesPoint[] {
  return rows
    .map((row) => ({ timestamp: Date.parse(row.time), value: row.value ?? null }))
    .sort((a, b) => a.timestamp - b.timestamp)
}
```

`null`、0 与无数据语义不同。坐标轴是否从 0 开始取决于图形：柱状图截断零点会夸大差异，折线图可按分析目标缩放但必须清晰标注。双 Y 轴容易制造虚假相关，能分面展示时优先分面。

## 六、响应式与可访问性

- 容器用 `ResizeObserver` 比 `window.resize` 更精准（避免父级尺寸变化漏监听）。
- 可访问性：图表旁配 `<table>` 或 `aria` 描述数据要点（见 `accessibility.md`），别只给一张图。
- 暗色模式：ECharts 主题切换（见 `design-token.md` 的 `getAppTheme()` 监听）。

键盘用户不能依赖 hover tooltip。为关键数据提供可聚焦摘要、筛选控件和表格替代；动画尊重 reduced motion；颜色之外再用形状、线型或标签编码。图表 canvas 本身不是完整可访问数据结构，ARIA 描述只能概括，不能替代可访问表格。

## 七、常见坑

- **内存泄漏**：忘了 `dispose()`，路由来回切图表堆积。
- **尺寸为 0**：容器未渲染完就 `init`，拿到 0 宽高 → 在 `onMounted` + `nextTick` 后初始化，或先给固定高度。
- **频繁 setOption 卡顿**：实时场景用增量 + 节流。
- **移动端模糊**：`devicePixelRatio` 适配（`echarts.init(el, null, { renderer })` 已处理 DPR）。
- **ResizeObserver 循环**：resize 回调又改变容器尺寸，造成反复通知；图表只适配容器，不在回调里重写布局。
- **暗色主题只改背景**：轴线、标签、tooltip、dataZoom 和强调色都要来自 token/主题。
- **用动画掩盖数据跳变**：实时图表动画排队会越来越滞后，高频模式关闭或缩短过渡。
- **销毁后异步更新**：请求返回时组件已卸载仍调用 setOption；取消请求或检查实例状态。

## 八、图表选型检查清单

1. 先确定用户任务：比较、趋势、分布、关系还是地理，不从“想用什么图”开始。
2. 按图元数量、更新频率、交互与可访问性选择 SVG/Canvas/WebGL。
3. 定义单位、时区、缺失值、排序、采样和颜色语义，避免图形误导。
4. 组件处理 init/resize/theme/dispose，数据层处理聚合、缓存和竞态。
5. 用真实数据测帧时间、内存和交互延迟，同时提供文本摘要/表格与导出。

## 九、小结

- SVG（交互好）/ Canvas（量大）/ WebGL（炫酷）按数据规模选。
- ECharts 配置驱动最省心；务必 `resize` + `dispose`。
- 海量数据靠降采样/增量/Worker；可访问性别只给图。

## 参考来源

- ECharts 文档：<https://echarts.apache.org/zh-cn/docs/index.html>
- D3 文档：<https://d3js.org/>
- MDN Canvas：<https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API>
- ECharts Canvas/SVG 选择：<https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/>
- ECharts 无障碍：<https://echarts.apache.org/handbook/en/best-practices/aria/>
