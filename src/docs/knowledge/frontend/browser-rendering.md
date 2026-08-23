---
group: 浏览器原理与网络
order: 15
---

# 浏览器渲染原理

> 适用场景：看懂「为什么某些写法慢」、配合性能优化对症下药。本文讲从 HTML/CSS 到像素的完整管线，以及 reflow/repaint/合成层。
> 阅读前提：前端性能优化（见 `perf-frontend`）。

改一个样式有时会卡，有时很丝滑——差别就在它触发了渲染管线的哪一步。理解管线，才知道 `perf-frontend` 里的建议「为什么有效」。

## 一、从代码到像素的管线

```
HTML ──> DOM Tree
CSS  ──> CSSOM Tree
              │
              ▼
        Render Tree（渲染树：可见节点 + 计算样式）
              │
              ▼
        Layout（布局/重排：算每个节点的几何位置与尺寸）
              │
              ▼
        Paint（绘制：填像素，分成若干图层）
              │
              ▼
        Composite（合成：把图层交给 GPU 拼成最终画面）
```

- **DOM Tree**：HTML 解析出的节点树（含 `<head>` 等不可见节点）。
- **CSSOM Tree**：CSS 解析出的样式树。
- **Render Tree**：只保留「可见」节点（`<head>`、`display:none` 的不进），并附上最终计算样式。
- **Layout（重排/reflow）**：计算每个节点在视口里的位置、大小。
- **Paint（重绘/repaint）**：把节点画成像素，可能分到多个图层。
- **Composite（合成）**：GPU 把各图层按正确顺序、变换合成一帧。

## 二、三大开销：reflow / repaint / composite

| 操作                                      | 触发阶段                   | 代价 |
| ----------------------------------------- | -------------------------- | ---- |
| 改几何（width/height/top/left、增删节点） | Layout → Paint → Composite | 最重 |
| 改外观（color/background/visibility）     | Paint → Composite          | 中等 |
| 改合成属性（transform/opacity）           | Composite only             | 最轻 |

> **黄金法则**：能用 `transform` / `opacity` 实现的动画，绝不用 `top/left/width` 去动——前者只走 Composite（GPU 加速、不触发 reflow/repaint），后者每次都重排重绘，肉眼可见卡顿。这正是 `css-effects` 里动画用 `transform` 而非改 `left` 的原因。

## 三、什么是「合成层（Compositing Layer）」

浏览器为提升性能，会把某些元素单独提到一个图层，由 GPU 独立合成：

```css
/* 以下属性会提升为独立合成层（常见触发条件） */
.video-card {
  transform: translateZ(0); /* 经典「层提升」hack */
  will-change: transform; /* 提前告诉浏览器：我要动 transform */
}
```

提升为合成层的好处：该层的变化（位移/缩放/透明度）只走 GPU 合成，不牵动其他层重排重绘。

> **别滥用 `will-change`**：提升层会占用更多 GPU 显存。只给「确实会动、且频繁动」的元素加，动完可考虑移除。盲目给所有元素加 `will-change` 反而更卡。

## 四、阻塞渲染的因素

- **CSS 阻塞渲染**：Render Tree 需要 CSSOM，所以 `<style>`/`<link>` 会阻塞首屏渲染（但脚本执行会等 CSS 就绪）。
- **JS 阻塞**：`<script>` 默认阻塞 HTML 解析（除非 `async`/`defer`）。JS 执行前还会等前面的 CSS 解析完（因为 JS 可能读样式）。
- **字体阻塞**：`font-display: swap` 可让文字先用兜底字体显示，避免「字体没加载完整页空白」。

> 这些点与 `perf-frontend` 的「关键渲染路径优化」直接对应：把 CSS 放 `<head>`、JS 用 `defer`、关键 CSS 内联、非关键资源异步，都是在缩短这条管线。

## 五、DevTools 怎么看

- **Performance 面板**：录制交互，看每一帧耗时，定位是 Scripting / Rendering / Painting 哪段拖慢。
- **Rendering 面板**（DevTools 设置里打开）：勾「Paint flashing」看哪些区域在重绘；勾「Layer borders」看合成层边界。
- **Layers 面板**：看当前有哪些合成层、为何被提升（reason）。

> 调动画卡顿，先看 Paint flashing 闪的范围大不大，再用 Performance 看长任务。这套是 `perf-frontend` 实操的「眼睛」。

## 六、与性能优化的衔接

| 现象       | 根因（本文）        | 对策（perf-frontend）             |
| ---------- | ------------------- | --------------------------------- |
| 动画掉帧   | 触发 reflow/repaint | 改 transform/opacity、提合成层    |
| 首屏白屏久 | 关键路径阻塞        | 内联关键 CSS、JS defer、预加载    |
| 交互卡顿   | 长任务 + 频繁重排   | 防抖节流、批量 DOM 更新、虚拟列表 |
| 内存涨     | 合成层/监听器泄漏   | 合理用 will-change、卸载时清理    |

## 参考来源

- MDN 渲染原理：<https://developer.mozilla.org/zh-CN/docs/Web/Performance/How_browsers_work>
- web.dev 关键渲染路径：<https://web.dev/articles/critical-rendering-path>
- web.dev 渲染性能：<https://web.dev/articles/rendering-performance>
- Google 开发者「Preventing layout thrashing」：<https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing>
