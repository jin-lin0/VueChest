---
group: 可视化与图形
order: 23
---

# 可视化与 Canvas / WebGL 入门

> 适用场景：图表、游戏、粒子动画、图像滤镜。本文讲 Canvas 2D 基础、`requestAnimationFrame`、WebGL 概览，并衔接 VueChest 的游戏类 App。
> 阅读前提：DOM 基础、事件循环（见 `event-loop`）。

Vue 管界面与业务状态，但遇到高频像素绘制（赛车、粒子、可视化），Canvas/WebGL 能避免维护大量 DOM 节点。普通 Canvas/WebGL 默认仍在主线程执行；只有 OffscreenCanvas 配合 Worker 等方案才能把部分绘制真正移出主线程。

## 一、Canvas 2D 基础

```html
<canvas ref="cv" width="800" height="600"></canvas>
```

```ts
const cv = cvRef.value!
const ctx = cv.getContext('2d')!
// 画一个方块
ctx.fillStyle = '#42b883'
ctx.fillRect(50, 50, 100, 100)
// 画圆
ctx.beginPath()
ctx.arc(200, 100, 30, 0, Math.PI * 2)
ctx.fill()
```

> 关键点：Canvas 是「命令式绘制」——每帧要**手动重绘**（清屏 + 重画）。它与 Vue 的「声明式」不同：你持有绘制循环，Vue 不帮你管像素。

## 二、动画循环：requestAnimationFrame

```ts
function loop(t: number) {
  ctx.clearRect(0, 0, cv.width, cv.height) // 清屏
  x += speed // 更新状态
  ctx.fillRect(x, 100, 50, 50) // 重绘
  rafId = requestAnimationFrame(loop) // 下一帧
}
rafId = requestAnimationFrame(loop)
// 卸载时取消，避免泄漏
onUnmounted(() => cancelAnimationFrame(rafId))
```

> `requestAnimationFrame`（rAF）与浏览器刷新率同步（≈60fps），比 `setInterval` 更顺滑、更省电。务必在组件卸载时 `cancelAnimationFrame`，否则离场后还在跑（内存/CPU 泄漏）。
> rAF 回调发生在浏览器的渲染更新阶段，不应简单叫“宏任务”。它能对齐刷新机会，但回调本身如果计算过重仍会阻塞输入和掉帧。

## 三、性能要点

- **离屏 Canvas**：静态背景先画到离屏 canvas，每帧贴图，免重复绘制。
- **分层 Canvas**：不动的背景 + 动的角色分两层，减少重绘面积。
- **避免每帧 alloc**：对象/数组复用，减少 GC 抖动。
- **DPR 适配**：高清屏按 `devicePixelRatio` 放大 canvas 分辨率再 `ctx.scale`，否则发虚。

```ts
const dpr = window.devicePixelRatio || 1
cv.width = 800 * dpr
cv.height = 600 * dpr
cv.style.width = '800px'
cv.style.height = '600px'
ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // resize 时重设，避免 scale 累乘
```

## 四、WebGL 概览（3D / 大规模）

Canvas 2D 够 2D 小场景；**3D 或海量图元用 WebGL**（GPU 加速）：

- 管线：顶点着色器（算位置）→ 片元着色器（算颜色）→ 光栅化。
- 你写 GLSL 着色器 + JS 传顶点/纹理数据，GPU 并行处理百万级图元。
- 库：**Three.js**（最流行，封装好）、**Babylon.js**（游戏向）。VueChest 的赛车游戏即用 Three.js（已做独立分包，见 `vite`）。
- 心智：WebGL 是「状态机 + 缓冲 + 着色器」，比 2D 复杂得多，先用 Three.js 别裸写。

```ts
import * as THREE from 'three'
const scene = new THREE.Scene()
const cam = new THREE.PerspectiveCamera(75, 4 / 3, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({ canvas: cv })
// ... 加 mesh、灯光，每帧 renderer.render(scene, cam)
```

## 五、与 Vue 协作模式

- **Vue 管 UI 外壳**（菜单、HUD、状态），**Canvas/WebGL 管游戏世界**，两者通过 ref/事件通信。
- 用 `<canvas ref>` 拿到 DOM，在 `onMounted` 初始化绘制、`onUnmounted` 销毁（取消 rAF、释放 WebGL 上下文）。
- 分数、暂停、设置等低频业务状态可进 Pinia；位置、速度、粒子等逐帧状态留在引擎内部，避免每帧触发 Vue/DevTools 响应式开销。按固定频率把 UI 摘要同步给 Vue。

> VueChest 游戏类 App（如 racing 3D）就是这套：Vue 负责外壳与业务逻辑，Three.js 负责 3D 场景，状态经 Pinia 桥接。

## 六、选型

| 需求                        | 选                                  |
| --------------------------- | ----------------------------------- |
| 简单图表 / 小动画 / 2D 游戏 | Canvas 2D                           |
| 图表库                      | ECharts / D3（底层也是 Canvas/SVG） |
| 3D / 粒子 / 大规模图元      | WebGL + Three.js                    |
| 数据报表（非实时）          | SVG / 组件库                        |

## 七、时间步长、输入与坐标

rAF 时间间隔随刷新率和卡顿变化，`x += speed` 会让 144Hz 设备跑得更快。渲染动画用 delta time，物理模拟更适合固定 timestep 并限制一次补算次数，避免标签页恢复后“追赶”几千帧。

```ts
let previous = performance.now()
let accumulator = 0
const step = 1 / 60

function frame(now: number) {
  const delta = Math.min((now - previous) / 1000, 0.1)
  previous = now
  accumulator += delta

  while (accumulator >= step) {
    updatePhysics(step)
    accumulator -= step
  }
  render(accumulator / step)
  rafId = requestAnimationFrame(frame)
}
```

Pointer 坐标要从 CSS 像素映射到画布/世界坐标，考虑 `getBoundingClientRect()`、DPR、相机和缩放；不要直接拿 `clientX` 当 canvas 坐标。高频 pointermove 只保存最新输入，在下一帧统一处理。

## 八、资源生命周期与上下文丢失

Three.js 的 `dispose()` 不是自动递归：Geometry、Material、Texture、RenderTarget 和控制器/事件监听都要释放。路由切换前取消 rAF，移除 observer/listener，再释放 GPU 资源。浏览器还可能触发 `webglcontextlost`，应阻止默认行为、暂停循环，并在 restored 后重建不可恢复资源或给出降级。

图片纹理受 CORS 与 tainted canvas 规则影响；跨源资源要有正确响应头，否则 `toDataURL/getImageData` 会抛安全错误。大纹理按 GPU 上限与内存预算缩放，压缩纹理需要 feature detect。

## 九、OffscreenCanvas 与 Worker

支持环境中可把控制权转给 Worker，让主线程处理 UI。消息协议要批量、可转移并限制频率；频繁结构化克隆大型对象可能比绘制本身更慢。DOM、字体加载和部分 API 仍有环境差异，因此保留主线程或简化模式降级。

## 十、常见坑与可访问性

- rAF 中每帧创建对象/纹理/材质，造成 GC 与 GPU 内存抖动。
- DPR 直接无限放大，4K 高倍屏生成超大缓冲；设置 DPR 上限并按质量档调整。
- 只取消 rAF 不释放监听、observer 和 GPU 资源，反复进页面后内存增长。
- Canvas 交互没有 DOM 语义，键盘和读屏无法操作；提供 DOM 控件、状态文本和等价列表/表格。
- WebGL/动画不可用时没有静态图或简化模式，核心信息完全丢失。

## 十一、渲染方案检查清单

1. DOM/SVG 是否已经足够；只有图元与更新规模需要时才用 Canvas/WebGL。
2. 高低频状态分离，循环使用 delta/fixed timestep，并在不可见时降频或暂停。
3. DPR、resize、pointer 坐标和字体/图片加载都有统一处理。
4. 组件卸载与 context lost 路径能释放并恢复资源。
5. 真实性能测试同时看 CPU、GPU、内存、掉帧和低端设备，不只看平均 FPS。
6. 核心功能有键盘、文本或静态降级，不把 Canvas 当唯一语义载体。

## 参考来源

- MDN Canvas 教程：<https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API/Tutorial>
- requestAnimationFrame：<https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestAnimationFrame>
- WebGL 基础：<https://developer.mozilla.org/zh-CN/docs/Web/API/WebGL_API/Tutorial>
- Three.js：<https://threejs.org/docs/>
- OffscreenCanvas：<https://developer.mozilla.org/docs/Web/API/OffscreenCanvas>
- WebGL context lost：<https://developer.mozilla.org/docs/Web/API/HTMLCanvasElement/webglcontextlost_event>
