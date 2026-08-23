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

自动化工具只能发现一部分问题：它能检查缺少 label、明显对比度和部分 ARIA 错误，却无法判断焦点顺序是否符合业务、替代文本是否准确、读屏播报是否重复。因此应把静态扫描、组件测试和人工键盘/读屏走查组合起来。

## 九、复合组件与可访问名称

自定义下拉、Tab、菜单、树和对话框必须遵循对应的 WAI-ARIA APG 键盘模型，不能只加一个 `role`。例如模态对话框打开后要把焦点移入，`Tab/Shift+Tab` 在内部循环，`Escape` 关闭，关闭后把焦点归还触发元素；同时页面其余区域对所有用户都不可交互，才能声明 `aria-modal="true"`。

控件的可访问名称优先来自可见文本或 `<label>`。`aria-label` 会覆盖部分名称来源，错误使用可能让视觉文字与读屏名称不一致。图标按钮要提供准确名称；一组输入用 `fieldset/legend` 表达共同问题；错误信息通过 `aria-describedby` 关联，不要把冗长说明全部塞进 label。

```html
<button type="button" aria-label="关闭设置">
  <svg aria-hidden="true" focusable="false"><!-- 装饰图标 --></svg>
</button>

<label for="email">邮箱</label>
<input id="email" aria-describedby="email-error" aria-invalid="true" />
<p id="email-error">请输入有效邮箱地址</p>
```

## 十、WCAG 2.2 中容易遗漏的场景

- 固定头部、Cookie 横幅和 Toast 不应遮住当前键盘焦点。
- 拖拽排序必须提供按钮或键盘等非拖拽替代操作。
- 点击目标要有足够尺寸或间距，尤其是移动端密集图标。
- 登录不能只依赖记忆或复杂认知测试；允许密码管理器、复制粘贴和无障碍认证方式。
- 重复流程中已经提供过的信息不应强迫用户再次输入，除非确有安全或必要性理由。

## 十一、上线检查清单

1. HTML 结构和标题层级合理，页面有语言，交互使用原生元素优先。
2. 仅用键盘完成主流程，无焦点丢失、陷阱或被遮挡，焦点样式清晰。
3. 表单有名称、说明、错误关联和提交后焦点策略；状态不只靠颜色表达。
4. 弹窗、下拉、Tab、树等按 APG 模式验证角色、状态和键盘行为。
5. 200% 缩放和窄屏下内容不丢失；动效支持 reduced motion。
6. 用 axe/Lighthouse 做自动扫描，再用 VoiceOver 或 NVDA 人工走一遍关键任务。
7. 新组件把 a11y 行为写入测试和 Storybook 示例，避免业务页面重复修复。

## 十二、小结

- 语义化优先，ARIA 补位；键盘可达是底线。
- 状态变化用 `aria-live` 播报；焦点陷阱进弹窗。
- 颜色不是唯一信号；尊重 `prefers-reduced-motion`。
- a11y 与可用性、SEO 同源，早做成本低。

## 参考来源

- MDN 无障碍指南：<https://developer.mozilla.org/zh-CN/docs/Web/Accessibility>
- WAI-ARIA 规范：<https://www.w3.org/TR/wai-aria/>
- WCAG 2.2：<https://www.w3.org/TR/WCAG22/>
- WAI-ARIA Authoring Practices：<https://www.w3.org/WAI/ARIA/apg/patterns/>
- WebAIM 对比度检查器：<https://webaim.org/resources/contrastchecker/>
- Vue a11y 指南：<https://vuejs.org/guide/best-practices/accessibility.html>
