---
group: CSS 与样式
order: 1
---

# 现代 CSS 布局：Flexbox 与 Grid 实战

在 Vue 3 组件化开发中，布局是最高频的需求。本文系统讲解 **Flexbox**（一维布局）与 **Grid**（二维布局）的实战用法，配套响应式与现代 CSS 特性，所有示例均可直接复制使用。

> 浏览器支持说明：截至 2026 年，`gap` 在 flex 中、容器查询、subgrid、aspect-ratio 均已进入 Baseline（广泛可用），可放心用于生产环境。可查 [web.dev Baseline](https://web.dev/baseline) 确认各特性的浏览器支持进度。

---

## 一、Flexbox 核心概念

Flexbox 是**一维**布局模型，沿「主轴」和「交叉轴」排列子项。

- **主轴（main axis）**：`flex-direction` 决定的方向（`row` 横向 / `column` 纵向）。
- **交叉轴（cross axis）**：与主轴垂直的方向。
- **justify-\*** 控制主轴，**align-\*** 控制交叉轴。

```css
.flex {
  display: flex;
  flex-direction: row; /* 主轴方向 */
  justify-content: center; /* 主轴对齐 */
  align-items: center; /* 交叉轴对齐 */
  gap: 1rem; /* 子项间距（含 flex，无需 margin hack） */
}
```

### 1.1 水平垂直居中

最常用也最可靠的方式：

```html
<div class="center-box">
  <div class="center-item">居中内容</div>
</div>
```

```css
.center-box {
  display: flex;
  justify-content: center; /* 水平居中 */
  align-items: center; /* 垂直居中 */
  height: 200px;
}
```

### 1.2 两端对齐导航

```html
<nav class="nav">
  <div class="nav-brand">Logo</div>
  <ul class="nav-links">
    <li>首页</li>
    <li>文档</li>
    <li>关于</li>
  </ul>
</nav>
```

```css
.nav {
  display: flex;
  justify-content: space-between; /* 两端对齐 */
  align-items: center;
  padding: 0 1rem;
}
.nav-links {
  display: flex;
  gap: 1.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
```

### 1.3 等高卡片 + 自动换行

`align-items: stretch`（默认）让卡片等高；`flex-wrap` 实现换行。

```css
.card-row {
  display: flex;
  flex-wrap: wrap; /* 空间不足时换行 */
  gap: 1rem;
  align-items: stretch; /* 卡片等高（默认） */
}
.card {
  flex: 1 1 240px; /* grow shrink basis */
}
```

### 1.4 flex 三属性速查

`flex: grow shrink basis` 是 `flex-grow`、`flex-shrink`、`flex-basis` 的简写。

| 写法              | 等价       | 含义                 |
| ----------------- | ---------- | -------------------- |
| `flex: 1`         | `1 1 0%`   | 等分剩余空间         |
| `flex: auto`      | `1 1 auto` | 等分，但优先内容尺寸 |
| `flex: none`      | `0 0 auto` | 不伸缩，按内容定宽   |
| `flex: 1 1 240px` | —          | 基准 240px，可伸缩   |

```css
.main {
  flex: 1;
} /* 占据所有剩余空间（经典左右栏） */
.sidebar {
  flex: 0 0 240px;
} /* 固定 240px，不伸缩 */
```

---

## 二、Grid 核心概念

Grid 是**二维**布局模型，同时控制行与列。

### 2.1 定义行列与 fr 单位

`fr`（fraction）表示剩余空间的占比。

```css
.grid {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr; /* 三列，中间占一半 */
  grid-template-rows: auto 200px;
  gap: 1rem;
}
```

### 2.2 repeat()、minmax()、auto-fit / auto-fill

```css
/* 等宽三列 */
grid-template-columns: repeat(3, 1fr);

/* 列宽在 200~1fr 间自适应，至少 200px */
grid-template-columns: repeat(3, minmax(200px, 1fr));

/* 自适应卡片网格：容器变窄自动减少列数 */
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
```

> `auto-fill` 保留空轨道，`auto-fit` 把空轨道折叠——绝大多数「卡片墙」场景用 `auto-fit`。

### 2.3 grid-template-areas 语义化布局

```html
<div class="layout">
  <header class="area-header">Header</header>
  <aside class="area-side">Side</aside>
  <main class="area-main">Main</main>
  <footer class="area-foot">Footer</footer>
</div>
```

```css
.layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  grid-template-rows: 60px 1fr 60px;
  grid-template-areas:
    'header header'
    'side   main'
    'footer footer';
  gap: 1rem;
  min-height: 100vh;
}
.area-header {
  grid-area: header;
}
.area-side {
  grid-area: side;
}
.area-main {
  grid-area: main;
}
.area-foot {
  grid-area: footer;
}
```

### 2.4 跨行跨列（span）

```css
.item {
  grid-column: span 2; /* 横跨 2 列 */
  grid-row: 1 / 3; /* 从第 1 行线到第 3 行线 */
}
```

### 2.5 子项对齐 place-items

`place-items: 交叉轴 主轴` 是 `align-items` + `justify-items` 的简写。

```css
.grid {
  display: grid;
  place-items: center; /* 所有子项在单元格内居中 */
  gap: 1rem;
}
```

---

## 三、响应式实战

### 3.1 媒体查询（页面级）

```css
.container {
  display: grid;
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .container {
    grid-template-columns: 240px 1fr;
  }
}
```

### 3.2 clamp() 流体尺寸

无需断点即可平滑过渡字号/间距。

```css
.title {
  font-size: clamp(1.25rem, 2vw + 1rem, 2.5rem);
}
.gap-fluid {
  gap: clamp(0.5rem, 1vw + 0.25rem, 1.5rem);
}
```

### 3.3 容器查询 @container（组件级）

组件随**容器**尺寸变化，而非视口——设计系统的利器。

```html
<div class="card-wrap">
  <div class="card">
    <img src="cover.jpg" alt="" />
    <div class="card-body">描述</div>
  </div>
</div>
```

```css
.card-wrap {
  container: card / inline-size; /* 声明容器 */
}
.card {
  display: block;
}
@container card (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 1rem;
  }
  .card-body {
    font-size: 1.1rem;
  }
}
```

> 语法：`container: <名称> / <类型>`，`inline-size` 按宽度查询。单位 `cqw`/`cqi` 相对容器尺寸。

---

## 四、经典布局模板

### 4.1 两栏 / 三栏布局（Flex）

```css
.two-col {
  display: flex;
  gap: 1rem;
}
.two-col .side {
  flex: 0 0 240px;
}
.two-col .main {
  flex: 1;
}

.three-col {
  display: flex;
  gap: 1rem;
}
.three-col .side-l,
.three-col .side-r {
  flex: 0 0 200px;
}
.three-col .main {
  flex: 1;
}
```

### 4.2 卡片网格自适应（首选 Grid）

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}
```

### 4.3 圣杯 / 双飞翼的现代做法

传统 float 方案已过时，推荐 Grid 一行搞定：

```css
.holy-grail {
  display: grid;
  grid-template:
    'header header header' auto
    'left   main   right' 1fr
    'footer footer footer' auto
    / 200px 1fr 200px;
  min-height: 100vh;
  gap: 1rem;
}
.holy-grail header {
  grid-area: header;
}
.holy-grail .left {
  grid-area: left;
}
.holy-grail main {
  grid-area: main;
}
.holy-grail .right {
  grid-area: right;
}
.holy-grail footer {
  grid-area: footer;
}
```

---

## 五、Flex vs Grid 选型指南

| 维度      | Flexbox                | Grid                 |
| --------- | ---------------------- | -------------------- |
| 维度      | 一维（行 **或** 列）   | 二维（行 **和** 列） |
| 最佳场景  | 组件内排列、导航、居中 | 页面整体框架、卡片墙 |
| 对齐控制  | 主轴/交叉轴            | 行列双向 + 单元格    |
| 内容驱动  | 强（按内容伸缩）       | 弱（按轨道定义）     |
| span 跨区 | 不支持                 | `span` 跨行跨列      |
| 典型组合  | 导航栏 + 按钮组        | 整体布局 + 表单栅格  |

**经验法则**：先用 Grid 搭「骨架」，再用 Flex 排「组件内部」。

```css
/* Grid 负责页面骨架 */
.page {
  display: grid;
  grid-template-columns: 240px 1fr;
}
/* Flex 负责卡片内部对齐 */
.card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
```

---

## 六、现代特性补充

### 6.1 gap 在 Flex 中

`gap` 现已全面支持 flex 容器，无需 `margin` 或 `:not(:last-child)` 技巧。

```css
.flex {
  display: flex;
  gap: 1rem;
} /* ✅ 现代浏览器均支持 */
```

### 6.2 subgrid 子网格

让嵌套网格继承父网格轨道，实现跨卡片的标题/内容/底部对齐。

```css
.wrapper {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto 1fr auto; /* 头/体/脚 */
  gap: 1rem;
}
.card {
  display: grid;
  grid-template-rows: subgrid; /* 继承父行轨道 */
  grid-row: span 3;
}
```

> 支持：Chrome 117+、Safari 16+、Firefox 71+。旧浏览器会回退为普通 grid。

### 6.3 aspect-ratio 固定宽高比

```css
.thumb {
  aspect-ratio: 16 / 9;
  width: 100%;
  object-fit: cover;
}
```

---

## 七、速查清单

- 居中：Flex `justify-content + align-items` 或 Grid `place-items: center`。
- 卡片墙：`repeat(auto-fit, minmax(240px, 1fr))`。
- 占满剩余：`flex: 1` 或 Grid `1fr`。
- 语义布局：`grid-template-areas`。
- 组件响应式：优先 `@container`，页面级才用 `@media`。
- 流体尺寸：用 `clamp()` 替代多重断点。
- 二维跨区对齐：用 `subgrid`。

## 八、常见坑与排障

### `min-width: auto` 导致内容把布局撑破

Flex/Grid 子项默认最小尺寸可能来自内容。长 URL、代码或单行文本会让 `1fr` 看似失效。先给可收缩子项加 `min-width: 0`，文本再配 `overflow-wrap: anywhere`；纵向滚动容器常对应 `min-height: 0`。

```css
.main {
  min-width: 0;
  overflow-wrap: anywhere;
}
```

### `100vw` 带来横向滚动条

桌面浏览器中 `100vw` 可能把垂直滚动条宽度算进去。普通满宽容器优先 `width: 100%`；需要视口单位时检查窄屏和出现滚动条后的结果。移动端全高界面优先评估 `dvh`，并保留合理回退。

### 只靠视觉顺序改变 DOM 顺序

Flex `order` 和 Grid 显式定位只改变视觉位置，键盘焦点与屏幕阅读器通常仍按 DOM 顺序移动。不要用布局属性修复错误的语义顺序；先保证 DOM 顺序合理，再用 CSS 布局。

### 布局选型检查清单

1. 内容主要沿一条轴排列用 Flex，需要同时控制行列用 Grid。
2. 组件按自身容器变化用 container query，整页断点用 media query。
3. 为可收缩区域验证 `min-width/min-height: 0`，为图片声明宽高比。
4. 在长文本、空内容、缩放 200%、键盘操作和 RTL 方向下测试。
5. 先用 intrinsic sizing、`minmax()` 和 `clamp()`，再增加大量固定断点。

## 参考来源

- MDN — [Flexbox 布局指南](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_flexible_box_layout)
- MDN — [Grid 布局指南](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout)
- MDN — [容器查询 Container Queries](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_containment/Container_queries)
- MDN — [subgrid 子网格](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout/Subgrid)
- web.dev — [Learn CSS：布局](https://web.dev/learn/css)
