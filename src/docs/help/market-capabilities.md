# 市场应用可用能力（运行时桥）

本章面向**开发者**，系统性地列出 VueChest 通过**运行时桥（Runtime Bridge）**向市场应用暴露的全部能力，以及如何正确使用它们。市场应用是被注入主页面执行的纯 JS（IIFE），它与宿主共享同一个页面上下文，因此可以直接复用宿主提供的这些运行时对象。

> 前置阅读：[应用包开发规范](./market-spec.md)。本章聚焦"运行时能提供什么"，规范章聚焦"包该怎么构建"。

## 1. 两个全局入口

宿主在应用启动时向 `window` 挂载了两个全局对象，市场应用可直接读取：

| 全局对象               | 用途                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `window.__VueChest__`  | 运行时桥主对象：Vue / Pinia / 存储 / 主题 / 常用 Vue API |
| `window.__APP_THEME__` | 主题订阅通道（`AppTheme`），供 app 跟随深色 / 浅色模式          |

> 注意：`window.MarketApp` 是**你的应用包自己**通过 IIFE 暴露的入口（宿主读取它来解析你的 `default.{component, route, meta}`），它不属于运行时桥。

## 2. `window.__VueChest__` 暴露的能力

以下字段在应用挂载时即可用：

| 字段                   | 类型     | 说明                                                          |
| ---------------------- | -------- | ------------------------------------------------------------- |
| `Vue`                  | 模块     | 宿主的 Vue（`import * as Vue`），**必须复用它**，不要自带 Vue |
| `VueRouter`            | —        | **不提供（恒为 `undefined`）**：沙箱内无内部路由能力，请勿依赖 vue-router |
| `Pinia`                | 模块     | 宿主的 Pinia 模块（含 `defineStore`），用于跨应用共享状态     |
| `storage`              | object   | 本地存储能力：`{ getStorage, setStorage }`（见下文）          |
| `theme`                | AppTheme | 主题对象，与 `window.__APP_THEME__` 指向**同一个实例**        |
| `defineComponent`      | fn       | Vue API 快捷再导出                                            |
| `defineAsyncComponent` | fn       | Vue API 快捷再导出                                            |
| `h`                    | fn       | Vue 渲染函数                                                  |
| `ref`                  | fn       | Vue 响应式 API                                                |
| `computed`             | fn       | Vue 响应式 API                                                |
| `reactive`             | fn       | Vue 响应式 API                                                |
| `watch`                | fn       | Vue 响应式 API                                                |
| `onMounted`            | fn       | Vue 生命周期                                                  |
| `onUnmounted`          | fn       | Vue 生命周期                                                  |

> 提示：这些 Vue API 既可以从 `window.__VueChest__` 上直接取用，也可以在你的源码里 `import { ref } from 'vue'` 并在构建时把 `vue` 外部化为 `window.__VueChest__.Vue`（推荐，写法更自然）。二者最终指向同一份宿主 Vue。

### 2.1 时序说明（重要）

`__VueChest__` 的字段**并非同一时刻全部就绪**：

- **首屏同步阶段**即可用：`Vue`、`theme` 以及上面列出的各类 Vue API 再导出（`VueRouter` 恒为 `undefined`，无路由能力）。
- **存储初始化完成后**才追加：`Pinia` 与 `storage`（它们在 `initStorage()` 完成后挂载）。

由于市场应用是在"用户安装 / 进入路由"时才加载的，此时宿主早已启动完毕，因此实际使用中 `Pinia` 与 `storage` 一般都已就绪。若你要在极早期访问，请做好判空。

## 3. 本地存储 `__VueChest__.storage`

宿主暴露的存储层封装于 IndexedDB 之上（同步读接口、异步落盘），适合保存应用自己的数据：

```js
const { getStorage, setStorage } = window.__VueChest__.storage

// 读取（第二个参数是默认值）
const list = getStorage('my-app:todos', [])

// 写入
setStorage('my-app:todos', [...list, { id: Date.now(), text: '新任务' }])
```

- **建议给 key 加上你自己的应用前缀**（如 `my-app:`），避免与宿主或其他应用的键名冲突。
- 该存储是**按浏览器 / 设备本地保存**的，不会自动云端同步。

## 4. 跨应用共享状态（Pinia）

宿主与所有市场应用**共用同一个 Pinia 实例**。这意味着多个应用可以通过 `defineStore` 定义 / 复用同一个 store，实现跨应用的状态同步：

```js
const { defineStore } = window.__VueChest__.Pinia

const useSharedStore = defineStore('shared-counter', {
  state: () => ({ count: 0 }),
  actions: {
    inc() {
      this.count++
    },
  },
})

// 任何应用里拿到的都是同一份状态
const store = useSharedStore()
store.inc()
```

> 若用到 Pinia，构建时同样应把 `pinia` 外部化为 `window.__VueChest__.Pinia`（详见 [应用包开发规范](./market-spec.md)）。

## 5. 主题能力

市场应用可以跟随站点的深色 / 浅色模式。主题能力有两条通道，指向同一个 `AppTheme` 对象：

- 直接用 `window.__APP_THEME__`
- 或 `window.__VueChest__.theme`

`AppTheme` 结构：

```ts
interface AppTheme {
  /** 当前是否深色（实时读取） */
  readonly isDark: boolean
  /** 订阅主题切换，返回取消订阅函数 */
  onChange(cb: (isDark: boolean) => void): () => void
}
```

- **样式颜色**：优先用 CSS 变量 `var(--xxx)`，它们会随主题自动切换，无需任何 JS。
- **JS 决定的颜色**（canvas / ECharts / 手写内联样式）：CSS 变量够不到，需要靠 `isDark` 判断当前主题，并用 `onChange` 在切换时重绘。

```js
const theme = window.__APP_THEME__

function paint() {
  ctx.fillStyle = theme.isDark ? '#0f172a' : '#ffffff'
  // ...重绘
}
paint()

// 切换主题时重绘；组件卸载时记得取消订阅
const off = theme.onChange(() => paint())
// onUnmounted(() => off())
```

主题变量的完整清单与用法，见 [主题变量与深色模式](./theme-variables.md)。

## 6. 使用建议与边界

- **不要自带 Vue / Pinia**：务必外部化，复用宿主实例，否则会与主站冲突。
- **key 加前缀**：本地存储的键名带上应用前缀，避免冲突。
- **订阅要清理**：`onChange` 返回的取消函数应在应用卸载时调用，避免内存泄漏。
- **安全须知**：市场应用运行在 **iframe 沙箱**（`sandbox="allow-scripts"`，opaque origin）内，与主站彻底隔离。存储按应用命名空间隔离，网络默认拒绝（需白名单放行）。详见 [沙箱机制](./market-sandbox.md)。

## 相关文档

- [应用包开发规范](./market-spec.md)
- [主题变量与深色模式](./theme-variables.md)
- [如何上传应用到市场](./market-upload.md)
- [注意事项](./market-notes.md)
