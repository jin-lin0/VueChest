---
group: CSS 与样式
order: 2
---

# Design Token 与 CSS 架构

> VueChest 的 `public/tokens.css` 就是一套 Design Token 驱动的主题系统（浅色 `:root` / 暗色 `:root.dark, .vc-dark`）。本文讲清 Token 分层、如何支撑多主题，以及现代 CSS 架构怎样与 Token 配合，避免样式熵增。

## 一、什么是 Design Token

Design Token 是"设计决策的原子化变量"——颜色、间距、圆角、字体、阴影、z-index 等都以语义变量集中管理，组件只消费变量，不写死具体值。改主题 = 改一处 Token，全站联动。

## 二、三层 Token 模型（推荐）

| 层                    | 命名               | 含义                     | 示例                                     |
| --------------------- | ------------------ | ------------------------ | ---------------------------------------- |
| **Primitive（原始）** | `--color-blue-500` | 调色板原子，不含语义     | `--color-blue-500: #3b82f6`              |
| **Semantic（语义）**  | `--color-primary`  | 业务语义，指向 primitive | `--color-primary: var(--color-blue-500)` |
| **Component（组件）** | `--button-bg`      | 组件级映射语义           | `--button-bg: var(--color-primary)`      |

> VueChest 实践：在 `tokens.css` 把"可编辑源"全放这里；组件用 `var(--xxx)` 自动随主题，无需 `onDark` 变体；canvas/JS 上色用 `getAppTheme()` + `onChange` 监听。暗色作用域 `.vc-dark` 让任意元素加类即进入暗色子树。

## 三、多主题（暗色模式）落地

```css
/* tokens.css —— 唯一可编辑源 */
:root {
  --color-bg: #ffffff;
  --color-text: #1f2937;
  --color-primary: #4f8cff;
  --z-modal: 1100;
}
:root.dark,
.vc-dark {
  --color-bg: #0f172a;
  --color-text: #e5e7eb;
  --color-primary: #60a5fa;
}
```

```ts
// JS 侧跟随主题
function getAppTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}
```

要点：z-index **唯一出处**是 `tokens.css`（drawer 1000 / modal 1100 / custom-select 2000 / confirm 3000 / toast 9999），自定义层级不得 ≥3000，避免覆盖确认弹窗。

## 四、现代 CSS 架构

| 方案                    | 思路                                       | 适用                      |
| ----------------------- | ------------------------------------------ | ------------------------- |
| **BEM**                 | `block__element--modifier` 命名约定        | 无构建时的强约束          |
| **ITCSS**               | 分层（设置→工具→通用→组件→截断）控制优先级 | 大型手写下项目            |
| **CSS Modules**         | 构建期作用域哈希，类名局部化               | 组件库、Vue `scoped` 同理 |
| **Utility（Tailwind）** | 原子类组合                                 | 快速开发                  |

Vue 单文件组件用 `scoped` 即自带组件级隔离，配合 Token 变量即可，无需额外 BEM 包袱；全局通用样式（reset、布局骨架）走 `tokens.css` + 少量全局类。

## 五、Token 与设计的协作流

1. 设计稿产出 Token 表（Figma Variables）→ 导出为 CSS 变量。
2. 前端在 `tokens.css` 落地 primitive + semantic。
3. 组件只引用 semantic/component 层变量。
4. 主题切换改 semantic 映射，组件零改动。
5. 暗色/品牌色等通过覆盖 `:root.dark` 等实现。

## 六、常见坑

- **组件直接写死色值**：一旦换肤全部失灵。强制走 `var(--xxx)`。
- **Token 命名无语义**：`--color-3` 不如 `--color-danger`；语义层让"危险红"可整体替换。
- **暗色只改背景不改边框/阴影**：暗色下边框、遮罩、阴影都要有对应 Token，否则"白边刺眼"。
- **z-index 散落各处**：统一收口到 `tokens.css`，否则弹窗被遮挡类 bug 难查。

## 七、小结

- Token 三层（primitive/semantic/component）是主题化基石。
- VueChest 的 `tokens.css` 是单一可编辑源；组件用变量、JS 用 `getAppTheme()`。
- 架构上 Vue `scoped` + Token 变量最省心；z-index 集中管理。

## 参考来源

- W3C Design Tokens 规范草案：<https://tr.designtokens.org/format/>
- CSS Custom Properties MDN：<https://developer.mozilla.org/zh-CN/docs/Web/CSS/--*>
- BEM 方法论：<https://getbem.com/>
- ITCSS：<https://www.creativebloq.com/article/itcss>
