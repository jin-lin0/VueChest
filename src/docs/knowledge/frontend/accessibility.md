---
group: 综合与扩展
order: 33
---

# 无障碍（Accessibility / a11y）基础

> 无障碍不是"给少数人做善事"，而是让产品对所有人（包括临时受限、老年、弱网、屏幕阅读器用户）都可用，且往往顺带提升 SEO 与可用性。本文给前端工程师一份可落地的 a11y 清单。

## 一、语义化是地基

用对标签，屏幕阅读器才能正确播报结构：

- 标题 `h1~h6` 层级不跳级；一个页面一个 `h1`。
- 按钮用 `<button>`，链接用 `<a>`，别用 `div@click` 冒充。
- 列表用 `<ul>/<ol>/<li>`，表格用 `<table>` 配 `<th scope>`。
- 表单控件配 `<label for>`。

```html
<button type="button" @click="submit">提交</button>
<!-- 而非 -->
<div @click="submit">提交</div>
```

## 二、ARIA：语义化不够时的补充

ARIA 只"描述"不"改变行为"。能用原生语义就别用 ARIA。

```html
<!-- 自定义对话框：role + 状态 + 键盘 -->
<div role="dialog" aria-modal="true" aria-labelledby="title" aria-describedby="desc">
  <h2 id="title">确认删除</h2>
  <p id="desc">此操作不可恢复</p>
</div>
```

常用属性：`aria-label`（可访问名）、`aria-hidden="true"`（对 AT 隐藏装饰）、`aria-expanded`、`aria-live`（动态内容播报，见下）。

## 三、键盘可达与 Focus 管理

- 所有交互元素必须能用 **Tab** 聚焦、**Enter/Space** 触发。
- 自定义组件（弹窗、下拉、菜单）要实现"**焦点陷阱**"：打开时焦点进入、Tab 在内部循环、Esc 关闭并把焦点还给触发者。
- 可见 `:focus-visible` 样式，别 `outline:none` 后不补替代。
- VueChest 的 `Modal`/`Drawer`/`CustomSelect`（见 `component-library.md`）都应实现焦点陷阱。

```css
.btn:focus-visible {
  outline: 2px solid #4f8cff;
  outline-offset: 2px;
}
```

## 四、动态内容播报（aria-live）

流式输出、Toast、加载状态要被读屏播报：

```html
<div aria-live="polite">已保存</div>
<!-- 不打断当前朗读 -->
<div aria-live="assertive">操作失败</div>
<!-- 立即播报 -->
```

> VueChest AI 对话的"生成中/完成"状态、Toast（`useConfirm`/`addToast`）应挂 `aria-live`。

## 五、颜色与对比度

- 正文文字与背景对比度 ≥ **4.5:1**（WCAG AA），大文字 ≥ 3:1。
- 别只用颜色传达状态（如"红=错误"还要配图标/文字）。VueChest 表单错误应同时有图标 + 文案。
- 尊重 `prefers-reduced-motion`：减少动画（见 `css-effects.md` 的 `@media` 守卫）。

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

## 六、表单可访问性

- 每个输入关联 `<label>`；错误信息用 `aria-describedby` 指向。
- 必填用 `required` + `aria-required="true"`。
- 输入框 `autocomplete` 提升体验（手机号、邮箱等）。
- 错误汇总：提交失败后聚焦第一个错误项并用 `aria-live` 播报。

## 七、图片与多媒体

- 信息性图片加 `alt`；纯装饰图 `alt=""` 或 `aria-hidden`。
- 视频提供字幕（`track kind="captions"`）；自动播放且带声需允许用户暂停。

## 八、自测手段

- 键盘走查：拔掉鼠标用 Tab/Enter 跑一遍主流程。
- 屏幕阅读器：VoiceOver（Mac）、NVDA（Win）。
- 浏览器插件：axe DevTools、Lighthouse a11y 审计。
- 对比度检查器：WebAIM Contrast Checker。

## 九、小结

- 语义化优先，ARIA 补位；键盘可达是底线。
- 状态变化用 `aria-live` 播报；焦点陷阱进弹窗。
- 颜色不是唯一信号；尊重 `prefers-reduced-motion`。
- a11y 与可用性、SEO 同源，早做成本低。

## 参考来源

- MDN 无障碍指南：<https://developer.mozilla.org/zh-CN/docs/Web/Accessibility>
- WAI-ARIA 规范：<https://www.w3.org/TR/wai-aria/>
- WebAIM 对比度检查器：<https://webaim.org/resources/contrastchecker/>
- Vue a11y 指南：<https://vuejs.org/guide/best-practices/accessibility.html>
