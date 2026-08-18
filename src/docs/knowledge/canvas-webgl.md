# 可视化与 Canvas / WebGL 入门

> 适用场景：图表、游戏、粒子动画、图像滤镜。本文讲 Canvas 2D 基础、`requestAnimationFrame`、WebGL 概览，并衔接 VueChest 的游戏类 App。
> 阅读前提：DOM 基础、事件循环（见 `event-loop`）。

Vue 管「界面与状态」，但遇到高频像素绘制（赛车、粒子、可视化），要用 Canvas/WebGL 把绘制从 DOM 移开——否则几百个 DOM 节点会卡死。

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
  x += speed                                    // 更新状态
  ctx.fillRect(x, 100, 50, 50)                  // 重绘
  rafId = requestAnimationFrame(loop)          // 下一帧
}
rafId = requestAnimationFrame(loop)
// 卸载时取消，避免泄漏
onUnmounted(() => cancelAnimationFrame(rafId))
```

> `requestAnimationFrame`（rAF）与浏览器刷新率同步（≈60fps），比 `setInterval` 更顺滑、更省电。务必在组件卸载时 `cancelAnimationFrame`，否则离场后还在跑（内存/CPU 泄漏）。
> 这与 `event-loop` 讲的「用宏任务让出主线程」一致：rAF 是浏览器调度的渲染时机，天然给交互留空隙。

## 三、性能要点

- **离屏 Canvas**：静态背景先画到离屏 canvas，每帧贴图，免重复绘制。
- **分层 Canvas**：不动的背景 + 动的角色分两层，减少重绘面积。
- **避免每帧 alloc**：对象/数组复用，减少 GC 抖动。
- **DPR 适配**：高清屏按 `devicePixelRatio` 放大 canvas 分辨率再 `ctx.scale`，否则发虚。

```ts
const dpr = window.devicePixelRatio || 1
cv.width = 800 * dpr; cv.height = 600 * dpr
ctx.scale(dpr, dpr)
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
- 游戏状态（分数、血量）放 Pinia（见 `pinia`），渲染层只读 store 渲染，不反向写。

> VueChest 游戏类 App（如 racing 3D）就是这套：Vue 负责外壳与业务逻辑，Three.js 负责 3D 场景，状态经 Pinia 桥接。

## 六、选型

| 需求 | 选 |
|------|-----|
| 简单图表 / 小动画 / 2D 游戏 | Canvas 2D |
| 图表库 | ECharts / D3（底层也是 Canvas/SVG） |
| 3D / 粒子 / 大规模图元 | WebGL + Three.js |
| 数据报表（非实时） | SVG / 组件库 |

## 参考来源

- MDN Canvas 教程：<https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API/Tutorial>
- requestAnimationFrame：<https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestAnimationFrame>
- WebGL 基础：<https://developer.mozilla.org/zh-CN/docs/Web/API/WebGL_API/Tutorial>
- Three.js：<https://threejs.org/docs/>
