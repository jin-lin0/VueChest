---
group: Vue 生态
order: 10
---

# Vue 组件库开发

> 适用场景：抽可复用组件、搭内部组件库。本文讲 Props、v-model、插槽、Teleport、provide/inject 与组件设计原则，并结合 VueChest 现有 `src/components` 的真实范式。
> 阅读前提：Vue 3 组合式 API（见 `vue3-composition`）、Pinia（见 `pinia`）。

VueChest 的 `src/components` 已沉淀一批通用组件（common/ 下的 Collapse、ConfirmDialog、CopyButton、CustomSelect、Drawer、EmptyState、MarkdownView、Modal、Toast、Tooltip；business/ 下的 LoginDropdown、MusicPlayer）。本文把这些组件的公共范式提炼成可复用的写法。

## 一、Props（带类型与默认值）

```ts
<script setup lang="ts">
interface Props {
  title: string
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}
// withDefaults 给可选 prop 提供默认值（推荐 TS 项目）
const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  loading: false,
})
</script>
```

> **坑**：props 是单向数据流，子组件**不能直接改 props**（会告警）。要改请 `emit` 事件让父组件改，或用 `v-model`。

## 二、v-model / modelValue

父子双向绑定。Vue 3 标准做法：接收 `modelValue` prop + 抛出 `update:modelValue` 事件。

```vue
<!-- 子组件 Modal.vue -->
<script setup lang="ts">
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
function close() {
  emit('update:modelValue', false)
}
</script>

<!-- 父组件 -->
<Modal v-model="show" />
```

**Vue 3.4+ 推荐 `defineModel`**（语法糖，免去手写 props+emit）：

```ts
const model = defineModel<boolean>()
model.value = false // 直接赋值即触发 update:modelValue
```

> 多个 v-model：`v-model:title`、`v-model:visible`，对应 `defineModel('title')`。VueChest 的 Dialog/Drawer 就常用 `v-model:visible` 控制开关。

`defineModel({ default })` 需要谨慎：父组件没有传值时，子组件可能已有默认值而父级 ref 仍是 `undefined`，形成初始不同步。公共组件更适合要求父级显式提供 model，或清楚定义受控/非受控模式，不能同时维护两份“当前值”。

## 三、插槽（Slot）

```vue
<!-- 默认插槽 -->
<slot />
<!-- 具名插槽 -->
<slot name="header" />
<!-- 作用域插槽：把子组件内部数据传出去 -->
<slot name="item" :row="row" :index="i" />
```

```vue
<!-- 使用 -->
<MyList>
  <template #header> 标题 </template>
  <template #item="{ row, index }">
    {{ index }}. {{ row.name }}
  </template>
</MyList>
```

> 作用域插槽是「列表/表格型」组件的核心：组件管数据，使用者管渲染。VueChest 的 `CustomSelect` 就通过插槽让调用方自定义选项外观。

## 四、Teleport（传送门）

把内容渲染到 DOM 其他位置（通常是 `body`），**绕过父级 `overflow/transform/z-index` 限制**——弹窗、Toast、下拉必备：

```vue
<Teleport to="body">
  <div class="modal-mask">
    <slot />
  </div>
</Teleport>
```

> VueChest 的 `Modal`/`Drawer`/`Tooltip`/下拉都用 Teleport 挂到 `body`，避免被祖先的 `overflow:hidden` 或 `transform` 裁切。

## 五、provide / inject（跨层传值）

祖孙组件通信，不必一层层 prop 透传：

```ts
// 祖先
import { provide, ref } from 'vue'
const theme = ref('light')
provide('theme', theme) // key 用字符串或 Symbol

// 后代（任意深度）
import { inject } from 'vue'
const theme = inject('theme', ref('light')) // 第二参是默认值
```

> 用 **Symbol 作 key** 避免命名冲突（推荐抽成 `keys.ts` 导出）。VueChest 用 `provide/inject` 做主题与跨组件状态桥接。`provide` 的值若是 `ref`，后代 inject 后仍是响应式的。

## 六、Teleport + z-index 集中管理（VueChest 范式）

层级组件（Drawer/Modal/Select/Confirm/Toast）的 z-index 极易冲突。VueChest 的约定：**所有层级值集中在 `tokens.css`**，组件不得硬编码：

```css
/* tokens.css —— 层级唯一出处 */
--z-drawer: 1000;
--z-modal: 1100;
--z-custom-select: 2000;
--z-confirm: 3000;
--z-toast: 9999;
```

> 组件内 `z-index: var(--z-modal)` 引用，**自定义 z 不得 ≥ 3000**（会压过 Confirm/Toast）。这条已写进项目约定，新增弹层组件务必遵守。

## 七、替代 window.alert / confirm（VueChest 范式）

项目**禁止 `window.alert/confirm`**，统一用组件化方案：

```ts
// 替代 window.confirm —— ConfirmDialog + useConfirm()
import { useConfirm } from '@/components'
const { confirm } = useConfirm()
const ok = await confirm('确定删除？')
if (ok) {
  /* 执行删除 */
}

// 替代 window.alert —— Toast
const toastRef = ref()
toastRef.value.addToast('success', '保存成功')
```

> 这套范式的好处：UI 风格统一、可主题化、不阻塞、可在移动端正常显示。任何新交互组件都应复用而非调原生弹窗。

## 八、组件设计原则（沉淀自 VueChest）

1. **单一职责**：一个组件只解决一类问题（CopyButton 只管复制，EmptyState 只管空态）。
2. **受控优先**：开关/值类状态尽量由父组件 v-model 控制（Modal 的 visible、Select 的 value），组件自身少埋私有状态。
3. **可组合**：用插槽把「数据」与「渲染」解耦，而不是写死内部结构。
4. **层级集中**：z-index 一律走 `tokens.css`，不散落硬编码。
5. **禁用原生弹窗**：alert/confirm 全部组件化。
6. **统一出口**：对外 `import { X } from '@/components'`，内部文件结构对使用者透明。

## 九、透传属性与原生能力

包装原生 `<button>`、`<input>` 时，应保留 `id`、`aria-*`、`data-*`、键盘和表单属性。单根组件会自动 fallthrough，多根或外层有装饰 wrapper 时则要 `inheritAttrs: false`，把 `$attrs` 绑定到真正交互元素，否则 label、disabled 或事件可能落错节点。

```vue
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
defineProps<{ label: string; error?: string }>()
</script>

<template>
  <label class="field">
    <span>{{ label }}</span>
    <input v-bind="$attrs" :aria-invalid="Boolean(error)" />
    <span v-if="error" role="alert">{{ error }}</span>
  </label>
</template>
```

组件事件也属于公共 API。声明 `emits`、稳定 payload 类型，不把内部 DOM Event 无选择地泄漏给业务；需要原生语义时明确透传。方法调用优先用 props/events 表达，只有聚焦、滚动等命令式能力才通过模板 ref 和 `defineExpose` 暴露最小接口。

## 十、无障碍、样式与测试

组件库比页面更适合一次解决 a11y：按钮保留原生语义，Modal 管焦点进入/循环/归还，Select 实现对应键盘模型，表单统一 label/error 关联。颜色、间距、圆角和 z-index 消费语义 token；不要为了可配置暴露任意 class 让调用方依赖内部 DOM。

测试按契约编写：props 边界、emits payload、v-model 同步、键盘路径、焦点、slot fallback、Teleport 清理和暗色主题。Storybook/演示页覆盖交互状态，视觉回归覆盖不同内容长度。不要只做快照，快照很难证明焦点和事件行为正确。

## 十一、发布与兼容

独立发包时 Vue 放 `peerDependencies`，输出 ESM、类型声明和样式入口，`exports` 明确公开子路径。组件、类型、CSS token、slot 名和事件都是版本化 API；删除前给弃用警告和迁移文档。构建产物验证 tree shaking，避免入口文件副作用导致使用一个按钮也打入整个库。

## 十二、组件设计检查清单

1. 能否用现有组件组合解决？抽象是否至少有两个稳定场景，而不是预想复用。
2. props 描述数据，events 描述意图，slot 承担结构定制；避免几十个互斥布尔值。
3. 明确受控状态、默认值、错误态、loading、disabled 和空内容行为。
4. `$attrs` 是否落在正确原生元素，键盘、焦点和 ARIA 是否符合模式。
5. 样式只消费 token 并允许必要的外部尺寸控制，不泄漏内部选择器。
6. 单测、交互示例、类型声明、变更日志和迁移策略是否齐全。

### 常见坑

- 用十几个布尔 props 组合模式，产生互相冲突状态；改用明确 variant 或拆分组件。
- 为了“灵活”透传任意对象并在内部展开，导致类型、DOM 与安全边界不可控。
- 弹层只处理 z-index，不处理滚动锁、焦点归还、嵌套弹层和卸载清理。
- 组件内部复制 prop 到本地后不再同步，形成两个事实来源。
- 直接依赖业务 store、路由或全局单例，使通用组件无法独立测试和复用。

## 十三、组件库发布思考

若要把 `src/components` 抽成独立 npm 包：用 `vite build --lib` 模式构建、peerDependencies 声明 `vue`、`defineExpose` 暴露实例方法、配好类型声明（`.d.ts`）。VueChest 目前是站内复用，未独立发包，但遵循上面的「统一出口 + 单一职责」能让未来抽包成本最低。

## 参考来源

- Vue 组件基础：<https://vuejs.org/guide/components/registration.html>
- Props：<https://vuejs.org/guide/components/props.html>
- 插槽：<https://vuejs.org/guide/components/slots.html>
- Teleport：<https://vuejs.org/guide/built-ins/teleport.html>
- provide/inject：<https://vuejs.org/guide/components/provide-inject.html>
- defineModel：<https://vuejs.org/api/sfc-script-setup.html#definemodel>
- 属性透传：<https://vuejs.org/guide/components/attrs.html>
- Vue 无障碍最佳实践：<https://vuejs.org/guide/best-practices/accessibility.html>
