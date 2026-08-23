---
group: CSS 与样式
order: 0
---

# CSS 特效与动画实战

本文聚焦前端常用视觉特效与动画：渐变、毛玻璃、霓虹发光、悬浮交互、关键帧动画、过渡性能，以及 `:has()` / `:is()` / `clamp()` / `@property` 等现代特性。示例均可直接复制运行（代码块带语言标签，适配 `marked` + `highlight.js` 渲染）。

---

## 渐变与背景特效

CSS 渐变本质是 `background-image`，可作背景使用且天然响应式（无需图片）。

### 线性 / 径向 / conic 渐变

```css
.linear {
  background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);
}
.radial {
  background: radial-gradient(circle at 30% 30%, #ff9a9e, #fad0c4 60%);
}
.conic {
  background: conic-gradient(from 0deg, #ff0080, #ff8c00, #ff0080);
}
```

### 网格背景（重复渐变叠加）

```css
.grid-bg {
  background-color: #0f172a;
  background-image:
    repeating-linear-gradient(0deg, transparent 0 19px, rgba(148, 163, 184, 0.25) 19px 20px),
    repeating-linear-gradient(90deg, transparent 0 19px, rgba(148, 163, 184, 0.25) 19px 20px);
}
```

### 渐变文字（background-clip: text）

三步：`background` 设渐变 → `background-clip: text` → `color: transparent`。

```css
.gradient-text {
  background: linear-gradient(90deg, #ff6ec4, #7873f5);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 700;
  font-size: 2.5rem;
}
```

---

## 毛玻璃 / Glassmorphism

原理：`backdrop-filter: blur()` 模糊元素**背后**内容，叠加半透明背景与细边框。要点：背景必须用 `rgba()` 半透明（不可用 `opacity`，否则文字也透明）；用 `@supports` 做降级。

```css
.glass {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
@supports not (backdrop-filter: blur(1px)) {
  .glass {
    background: rgba(255, 255, 255, 0.85);
  }
}
```

> 性能：移动端 `backdrop-filter` 元素建议控制在 3–5 个，模糊半径越大越费 GPU。

---

## 霓虹 / 发光文字与按钮

发光靠多层 `text-shadow` / `box-shadow` 叠加形成光晕，颜色与主题同色系最自然。

```css
.neon-text {
  color: #fff;
  text-shadow:
    0 0 5px #fff,
    0 0 10px #0ff,
    0 0 20px #0ff,
    0 0 40px #0ff;
}
.neon-btn {
  padding: 12px 28px;
  color: #0ff;
  background: transparent;
  border: 2px solid #0ff;
  border-radius: 8px;
  box-shadow:
    0 0 8px #0ff,
    inset 0 0 8px #0ff;
  transition:
    box-shadow 0.25s ease,
    color 0.25s ease;
}
.neon-btn:hover {
  color: #fff;
  box-shadow:
    0 0 16px #0ff,
    0 0 32px #0ff,
    inset 0 0 16px #0ff;
}
```

---

## 悬浮交互特效

### 按钮 hover 光晕（伪元素 + 扩散）

```css
.glow-btn {
  position: relative;
  overflow: hidden;
  padding: 12px 28px;
  border: none;
  border-radius: 999px;
  background: #6366f1;
  color: #fff;
}
.glow-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.6), transparent 60%);
  opacity: 0;
  transform: scale(0.5);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.glow-btn:hover::before {
  opacity: 1;
  transform: scale(1.4);
}
```

### 下划线动画（宽度由 0 展开）

```css
.link-underline {
  position: relative;
  color: #1f2937;
  text-decoration: none;
}
.link-underline::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -2px;
  width: 0;
  height: 2px;
  background: #6366f1;
  transition: width 0.3s ease;
}
.link-underline:hover::after {
  width: 100%;
}
```

### 卡片悬浮抬升 + 阴影

```css
.card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease;
}
.card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
}
```

---

## 关键帧动画 keyframes

### loading 旋转 / 脉冲

```css
.spinner {
  width: 36px;
  height: 36px;
  border: 4px solid #e5e7eb;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.pulse {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #6366f1;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.5;
  }
}
```

### 骨架屏 shimmer（流光）

```css
.skeleton {
  width: 100%;
  height: 16px;
  border-radius: 8px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 37%, #e5e7eb 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}
```

### 打字机效果（steps 控制步数）

```css
.typewriter {
  width: 18ch;
  white-space: nowrap;
  overflow: hidden;
  border-right: 2px solid #6366f1;
  animation:
    typing 3s steps(18) forwards,
    blink 0.7s step-end infinite;
}
@keyframes typing {
  from {
    width: 0;
  }
  to {
    width: 18ch;
  }
}
@keyframes blink {
  50% {
    border-color: transparent;
  }
}
```

> 纯 CSS 打字机需固定宽度与字符数；动态文本建议配合 JS 设置变量。

---

## transition 最佳实践与性能

`transition` 用于状态切换补间。原则是**只过渡触发合成（compositing）的属性**，避开触发布局（layout）的属性。

| 属性                                | 推荐度   | 原因                   |
| ----------------------------------- | -------- | ---------------------- |
| `transform` / `opacity`             | 强烈推荐 | 仅合成层，GPU 加速     |
| `filter` / `backdrop-filter`        | 可用     | 合成但开销较大         |
| `background-color`                  | 可用     | 仅重绘（paint）        |
| `width` / `height` / `top` / `left` | 避免     | 触发 layout 重排，卡顿 |
| `box-shadow`（大范围）              | 谨慎     | 重绘成本高             |

```css
.smooth {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}
.smooth:hover {
  transform: translateY(-4px) scale(1.02);
  opacity: 0.9;
}
```

补充：`will-change: transform` 可提前提升合成层（动画结束后移除，避免内存占用）；用 `@media (prefers-reduced-motion: reduce)` 关闭非必要动画以照顾无障碍。

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

## 现代特性

### :has() 与 :is()

`:has()` 是“父选择器”，按子元素状态选中祖先；`:is()` 简化选择器列表（继承最高特异度）。二者现代浏览器均支持（`:has()` 需 Chrome 105+ / Safari 15.4+ / Firefox 121+）。

```css
.form-group:has(.error) {
  border-color: #ef4444;
} /* 含错误高亮分组 */
.card:has(img) {
  align-items: flex-start;
} /* 含图调整布局 */
:is(h1, h2, h3) {
  font-weight: 700;
  line-height: 1.2;
} /* 合并标题样式 */
.card:has(a:hover) :is(h2, h3) {
  color: #6366f1;
} /* 组合用法 */
```

### clamp() 做响应式特效

`clamp(min, preferred, max)` 让字号/间距随视口平滑伸缩，免去多个媒体查询：

```css
.responsive-title {
  font-size: clamp(1.5rem, 4vw, 3rem); /* 最小1.5 理想4vw 最大3rem */
  border-radius: clamp(8px, 1.5vw, 16px);
}
```

### @property 自定义属性动画

普通 `--var` 被视为字符串无法平滑过渡；`@property` 注册带类型的变量后可像普通属性一样 `transition` / `animation`，最适合做渐变角度、色相流动。

```css
@property --angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@property --hue {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}

.rotating-border {
  --angle: 0deg;
  border: 4px solid transparent;
  border-image: linear-gradient(var(--angle), #ff0080, #ff8c00) 1;
  animation: rotate-border 4s linear infinite;
}
@keyframes rotate-border {
  to {
    --angle: 360deg;
  }
}

.hue-flow {
  background: hsl(var(--hue), 80%, 55%);
  animation: hue-shift 6s linear infinite;
}
@keyframes hue-shift {
  to {
    --hue: 360;
  }
}
```

> 兼容：`@property` 已在 Chrome / Edge / Safari 稳定支持，Firefox 较新版本已跟进，不支持时回退静态值，可安全渐进增强。

---

## 小结

- 渐变用 `linear/radial/conic`，文字渐变靠 `background-clip: text`；
- 毛玻璃 = `backdrop-filter: blur` + `rgba` 半透明 + 细边框 + `@supports` 降级；
- 发光靠多层 `text-shadow` / `box-shadow`；
- 悬浮交互优先 `transform` / `opacity` 过渡；
- 关键帧覆盖 loading、骨架屏、打字机；
- 性能上避免过渡 `width/top/left` 等触发布局的属性；
- 现代特性 `:has()` `:is()` `clamp()` `@property` 让特效更简洁可控。

## 常见坑与验收清单

- **只在 hover 才能触发**：触屏和键盘用户可能无法使用。交互反馈同时覆盖 `:focus-visible`，核心信息不能只藏在 hover 中。
- **忽略减少动态效果偏好**：对位移、闪烁和自动循环动画使用 `prefers-reduced-motion` 降级，不能只把时长缩短一点。
- **阴影和滤镜范围过大**：多层 `box-shadow`、`filter: blur()` 与 `backdrop-filter` 可能扩大绘制区域；在低端设备用 Performance/Paint Flashing 验证。
- **动画 `height: auto`**：传统 transition 不能直接在数值与 `auto` 间稳定插值。可用 Grid 行轨道、测量后的明确高度或 View Transitions，并保留无动画状态。
- **无限声明合成层**：`will-change` 只在动画临近时用于已测热点，结束后移除，不能对卡片列表全量开启。
- **对比度被特效破坏**：毛玻璃背景会随底图变化，文字必须在最差背景下仍满足对比度，并提供实色回退。

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

.effect-button:focus-visible {
  outline: 3px solid CanvasText;
  outline-offset: 3px;
}
```

上线前在键盘、触屏、深浅主题、200% 缩放、低性能设备和 reduced-motion 模式下检查；特效应强化层级与状态反馈，不能成为理解内容的前置条件。

## 参考来源

- MDN — [`:has()` 父选择器](https://developer.mozilla.org/zh-CN/docs/Web/CSS/:has)
- MDN — [`@property` 带类型的自定义属性](https://developer.mozilla.org/zh-CN/docs/Web/CSS/@property)
- MDN — [`backdrop-filter` 毛玻璃](https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter)
- MDN — [`clamp()` 流式尺寸](https://developer.mozilla.org/zh-CN/docs/Web/CSS/clamp)
- MDN — [过渡使用指南](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_transitions/Using_CSS_transitions)
- MDN — [`prefers-reduced-motion` 无障碍](https://developer.mozilla.org/zh-CN/docs/Web/CSS/@media/prefers-reduced-motion)
