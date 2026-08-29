# 主题变量与深色模式

VueChest 使用一套**全局设计 Token（CSS 变量）**统一管理颜色、圆角、阴影、间距等视觉风格，并据此实现**亮色 / 深色模式**一键切换。本章说明这些变量有哪些、如何在市场应用中使用，以及 JS 层如何跟随主题。

> 相关：运行时主题对象（`isDark` / `onChange`）见 [市场应用可用能力](./market-capabilities.md)。

## 1. 工作机制

- 变量定义在 `public/tokens.css`：`:root` 为**浅色默认值**，`:root.dark` 覆盖为**深色值**。该文件由 `index.html` 与 `sandbox.html` 共用，是 token 的**唯一可编辑源**（不要在 `src/` 另存一份）。
- 主题切换靠给根元素加类：`<html class="dark">`。宿主在首屏渲染前就会应用主题，避免闪烁；用户切换时会同步写入 `localStorage['theme']`。
- 市场应用被注入主页面执行，与宿主**共享同一份全局 CSS 变量**。因此你在应用样式里直接写 `var(--xxx)`，即可自动获得亮 / 暗两套配色，**无需自己写深色样式**。

```css
/* 你的市场应用样式：用变量即自动适配深色 */
.my-card {
  background: var(--bg-card);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-5);
}
```

## 2. 变量总览

### 2.1 品牌 / 主色

| 变量                      | 浅色                                              | 深色      | 用途                                 |
| ------------------------- | ------------------------------------------------- | --------- | ------------------------------------ |
| `--brand-1`               | `#667eea`                                         | 同        | 品牌主色起点                         |
| `--brand-2`               | `#764ba2`                                         | 同        | 品牌主色终点                         |
| `--gradient-primary`      | `linear-gradient(135deg,#667eea 0%,#764ba2 100%)` | 同        | 主渐变（按钮 / 强调）                |
| `--gradient-primary-soft` | 浅紫渐变                                          | 深蓝渐变  | 柔和背景渐变                         |
| `--accent`                | `#667eea`                                         | 同        | 全站主强调色                         |
| `--accent-strong`         | `#764ba2`                                         | 同        | hover 加深 / 渐变末端                |
| `--accent-contrast`       | `#ffffff`                                         | 同        | 主色之上的文字                       |
| `--accent-bg`             | `#eef2ff`                                         | `#1e293b` | 强调底（选中行 / tab）               |
| `--accent-light`          | `#c7d2fe`                                         | `#334155` | 浅描边 / 发光                        |
| `--accent-rgb`            | `102, 126, 234`                                   | 同        | 供 `rgba(var(--accent-rgb), a)` 使用 |

### 2.2 语义色

| 变量           | 浅色      | 深色      | 用途        |
| -------------- | --------- | --------- | ----------- |
| `--success`    | `#059669` | 同        | 成功        |
| `--success-bg` | `#d1fae5` | `#064e3b` | 成功底色    |
| `--warning`    | `#d97706` | 同        | 警告        |
| `--warning-bg` | `#fef3c7` | `#78350f` | 警告底色    |
| `--danger`     | `#dc2626` | 同        | 危险 / 错误 |
| `--danger-bg`  | `#fee2e2` | `#450a0a` | 危险底色    |
| `--info`       | `#3498db` | 同        | 信息        |

### 2.3 表面 / 背景

| 变量              | 浅色                    | 深色                 | 用途                      |
| ----------------- | ----------------------- | -------------------- | ------------------------- |
| `--bg-page`       | `#f5f7fa`               | `#0f172a`            | 页面底                    |
| `--bg-card`       | `#ffffff`               | `#1e293b`            | 卡片底                    |
| `--bg-elevated`   | `#ffffff`               | `#1e293b`            | 浮层底                    |
| `--bg-hover`      | `#f3f4f6`               | `#334155`            | hover 底                  |
| `--bg-subtle`     | `#f3f4f6`               | `#334155`            | 图标底 / tag 底           |
| `--bg-input`      | `#ffffff`               | `#0f172a`            | 输入框底                  |
| `--tag-bg`        | `#f3f4f6`               | `#334155`            | 标签底                    |
| `--bg-glass`      | `rgba(255,255,255,.92)` | `rgba(30,41,59,.92)` | 玻璃拟态（卡片 / 搜索框） |
| `--bg-glass-soft` | `rgba(255,255,255,.8)`  | `rgba(30,41,59,.6)`  | 玻璃拟态（按钮 / tab）    |

### 2.4 文本

| 变量               | 浅色      | 深色      | 用途            |
| ------------------ | --------- | --------- | --------------- |
| `--text-primary`   | `#2c3e50` | `#f1f5f9` | 标题 / 强文本   |
| `--text-body`      | `#333333` | `#e2e8f0` | 正文            |
| `--text-secondary` | `#6b7280` | `#94a3b8` | 次要文本        |
| `--text-muted`     | `#9ca3af` | `#64748b` | 弱化文本 / 占位 |
| `--text-dim`       | `#7f8c8d` | `#94a3b8` | 更弱文本        |
| `--text-inverse`   | `#ffffff` | 同        | 反色文本        |

### 2.5 边框

| 变量             | 浅色      | 深色      | 用途            |
| ---------------- | --------- | --------- | --------------- |
| `--border`       | `#d1d5db` | `#334155` | 默认边框        |
| `--border-light` | `#e5e7eb` | `#334155` | 浅边框 / 分割线 |
| `--border-color` | `#d1d5db` | `#334155` | 边框（别名）    |

### 2.6 圆角

| 变量            | 值     |
| --------------- | ------ |
| `--radius-xs`   | `4px`  |
| `--radius-sm`   | `8px`  |
| `--radius-md`   | `12px` |
| `--radius-lg`   | `16px` |
| `--radius-xl`   | `20px` |
| `--radius-pill` | `50px` |
| `--radius-full` | `50%`  |

### 2.7 阴影

| 变量                                | 用途                                          |
| ----------------------------------- | --------------------------------------------- |
| `--shadow-xs` / `--shadow-sm`       | 极浅阴影                                      |
| `--shadow-md`                       | 卡片常规阴影                                  |
| `--shadow-lg`                       | 浮层 / 弹窗                                   |
| `--shadow-xl`                       | 大浮层                                        |
| `--shadow-brand-sm` / `-md` / `-lg` | 品牌着色阴影（聚焦 / 发光，深色下透明度更高） |

> 阴影的透明度在深色模式下更强，以在深底上保持层次感。

### 2.8 间距（4px 基准）

| 变量        | 值     | 变量        | 值     |
| ----------- | ------ | ----------- | ------ |
| `--space-1` | `4px`  | `--space-5` | `20px` |
| `--space-2` | `8px`  | `--space-6` | `24px` |
| `--space-3` | `12px` | `--space-7` | `28px` |
| `--space-4` | `16px` | `--space-8` | `32px` |

### 2.9 字体字号

字体族由 `--font-sans` 统一管理。固定字号先使用 primitive 阶梯，再通过语义别名供组件消费：

| Primitive                | 值      | Primitive                 | 值      |
| ------------------------ | ------- | ------------------------- | ------- |
| `--font-size-2xs`        | `10px`  | `--font-size-sm`          | `12px`  |
| `--font-size-base`       | `14px`  | `--font-size-xl`          | `16px`  |
| `--font-size-3xl`        | `20px`  | `--font-size-4xl`         | `24px`  |
| `--font-size-5xl`        | `28px`  | `--font-size-6xl`         | `32px`  |
| `--font-size-8xl`        | `40px`  | `--font-size-9xl`         | `48px`  |
| `--font-size-display-md` | `64px`  | `--font-size-display-lg`  | `96px`  |
| `--font-size-display-xl` | `120px` | `--font-size-display-2xl` | `154px` |

| 语义变量                                     | 对应阶梯      | 用途                           |
| -------------------------------------------- | ------------- | ------------------------------ |
| `--font-size-caption`                        | `2xs`         | 最小辅助文字、标签、时间、计数 |
| `--font-size-meta`                           | `sm`          | 元信息 / 次要说明              |
| `--font-size-small`                          | `sm`          | 小号正文 / 紧凑控件            |
| `--font-size-control`                        | `base`        | 紧凑按钮 / 表单控件            |
| `--font-size-body` / `--font-size-body-lg`   | `base` / `xl` | 正文                           |
| `--font-size-title` / `--font-size-title-lg` | `xl` / `3xl`  | 卡片标题                       |
| `--font-size-heading`                        | `3xl`         | 页面区块标题                   |

全站可读字号下限为 `--font-size-caption`。组件的固定 `px/rem` 字号必须走 token；只有确实依赖父级比例或视口变化的 `em`、`clamp()`，以及用于消除行内间隙的 `font-size: 0` 可以保留。

### 2.10 过渡

| 变量                | 值           |
| ------------------- | ------------ |
| `--transition-fast` | `0.15s ease` |
| `--transition`      | `0.2s ease`  |

## 3. 让 JS 决定的颜色也跟随主题

CSS 变量只能作用于**样式属性**。当颜色是由 JS 计算并直接写入的（如 `canvas`、ECharts、图表配色、内联 style），CSS 变量够不到，需要借助运行时主题对象。

### 3.1 市场应用（注入的 JS）

用 `window.__APP_THEME__`（或 `window.__VueChest__.theme`）：

```js
const theme = window.__APP_THEME__

function palette() {
  return theme.isDark
    ? { bg: '#0f172a', fg: '#e2e8f0', line: '#334155' }
    : { bg: '#ffffff', fg: '#333333', line: '#e5e7eb' }
}

function draw() {
  const c = palette()
  ctx.fillStyle = c.bg
  // ...重绘
}
draw()

// 主题切换时重绘；卸载时取消订阅
const off = theme.onChange(() => draw())
// onUnmounted(() => off())
```

### 3.2 系统内置应用（Vue 组件）

内置 app 通过依赖注入消费同一个主题对象：

```js
import { inject, onUnmounted } from 'vue'

const appTheme = inject('appTheme') // 与 window.__APP_THEME__ 同一实例
const off = appTheme.onChange((isDark) => {
  /* 重绘 */
})
onUnmounted(() => off())
```

> 说明：是否跟随主题是**自愿（opt-in）**的。纯样式类应用只用 CSS 变量即可；只有 JS 绘图 / 图表类才需要订阅 `onChange`。沉浸式游戏等有独立美术风格的应用可以完全不跟随。

## 4. 最佳实践

- **能用 CSS 变量就用 CSS 变量**：写 `var(--bg-card)` 而非硬编码 `#fff`，深色自动适配。
- **不要硬编码颜色**：一旦硬编码，深色模式下往往对比度不足、难以阅读。
- **JS 颜色务必订阅 `onChange`**：否则切换主题后画布 / 图表不会更新。
- **取消订阅**：`onChange` 返回的函数要在卸载时调用，避免泄漏。

## 相关文档

- [市场应用可用能力](./market-capabilities.md)
- [应用包开发规范](./market-spec.md)
- [如何上传应用到市场](./market-upload.md)
