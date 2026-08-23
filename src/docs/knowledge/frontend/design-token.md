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

## 七、命名、模式与作用域

Token 名称描述用途，不描述当前视觉值：`color.text.muted` 比 `gray.500` 更适合组件消费，因为暗色主题下“弱文字”未必仍映射到同一灰阶。primitive 可以按色板命名，semantic 才承载产品语义，component token 只在确实需要局部覆写时增加，避免每个组件复制一套变量。

主题不止 light/dark，还可能包含品牌、对比度、密度和平台模式。不要把所有维度拼成巨大的选择器矩阵；把互相独立的维度拆成不同 token 组，并明确覆盖顺序。组件内提供带 fallback 的局部变量，可以开放有限定制点而不泄漏内部结构。

```css
.card {
  --card-padding: var(--space-4);
  color: var(--color-text-primary);
  background: var(--card-background, var(--color-surface-raised));
  padding: var(--card-padding);
}

[data-density='compact'] .card {
  --card-padding: var(--space-2);
}
```

## 八、从设计源到代码的流水线

理想流程是设计变量和代码 token 共享机器可读源，再生成 CSS、TypeScript、Android/iOS 等目标格式。生成物不要手改；PR 中展示 token diff，并检查删除、重命名和主题缺失。破坏性重命名要提供弃用周期或 codemod，因为 token 本质上是组件间 API。

数值也要有单位和约束：颜色保存可互操作表示，尺寸区分 `rem/px` 用途，动画 token 同时考虑 reduced motion，阴影和渐变明确序列化格式。JS/Canvas 需要读取 token 时优先从同一生成源导出类型，而不是在运行时复制另一份色值。

```ts
export const tokens = {
  color: {
    textPrimary: 'var(--color-text-primary)',
    surfaceRaised: 'var(--color-surface-raised)',
  },
  space: { 2: 'var(--space-2)', 4: 'var(--space-4)' },
} as const
```

## 九、架构决策清单

1. 先盘点重复设计决策，只把会复用或换肤的值提升为 token。
2. 组件消费 semantic token，primitive 主要服务语义映射，避免跳层依赖。
3. 明确主题、品牌、密度的覆盖优先级，并对每种组合做视觉回归。
4. token 变更按公共 API 管理：校验命名、类型、引用和弃用计划。
5. 样式作用域问题先用 cascade layers、低特异性选择器和明确入口解决，不依赖 `!important` 竞赛。
6. 对比度、焦点、reduced motion 和高对比模式进入设计验收，不把无障碍留给组件补丁。

## 十、小结

- Token 三层（primitive/semantic/component）是主题化基石。
- VueChest 的 `tokens.css` 是单一可编辑源；组件用变量、JS 用 `getAppTheme()`。
- 架构上 Vue `scoped` + Token 变量最省心；z-index 集中管理。

## 参考来源

- W3C Design Tokens 规范草案：<https://tr.designtokens.org/format/>
- CSS Custom Properties MDN：<https://developer.mozilla.org/zh-CN/docs/Web/CSS/--*>
- CSS Cascade Layers：<https://developer.mozilla.org/docs/Learn_web_development/Core/Styling_basics/Cascade_layers>
- BEM 方法论：<https://getbem.com/>
- ITCSS：<https://www.creativebloq.com/article/itcss>
