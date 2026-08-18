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
if (ok) { /* 执行删除 */ }

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

## 九、组件库发布思考

若要把 `src/components` 抽成独立 npm 包：用 `vite build --lib` 模式构建、peerDependencies 声明 `vue`、`defineExpose` 暴露实例方法、配好类型声明（`.d.ts`）。VueChest 目前是站内复用，未独立发包，但遵循上面的「统一出口 + 单一职责」能让未来抽包成本最低。

## 参考来源

- Vue 组件基础：<https://vuejs.org/guide/components/registration.html>
- Props：<https://vuejs.org/guide/components/props.html>
- 插槽：<https://vuejs.org/guide/components/slots.html>
- Teleport：<https://vuejs.org/guide/built-ins/teleport.html>
- provide/inject：<https://vuejs.org/guide/components/provide-inject.html>
- defineModel：<https://vuejs.org/api/sfc-script-setup.html#definemodel>
