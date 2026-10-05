# 市场应用可用能力（运行时桥）

本章面向**开发者**，系统性地列出 VueChest 通过**运行时桥（Runtime Bridge）**向市场应用暴露的全部能力，以及如何正确使用它们。

> ⚠️ **执行环境**：市场应用**不再**被注入主页面执行。bundle 运行在带 `sandbox="allow-scripts"` 的 **iframe**（opaque origin）内，与宿主页面彻底隔离 —— 碰不到宿主 DOM，也没有同源存储 / cookie。宿主在 iframe 文档里挂载 `window.__VueChest__` 等对象，应用只能通过**受限的运行时桥**访问宿主能力；越权调用会被拒绝。隔离机制详见 [沙箱机制](./market-sandbox.md)。

> 前置阅读：[应用包开发规范](./market-spec.md)。本章聚焦"运行时能提供什么"，规范章聚焦"包该怎么构建"。

## 1. 两个全局入口

沙箱文档加载时会向 `window` 挂载两个全局对象，市场应用可直接读取：

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
| `storage`              | object   | 本地存储能力：`{ getStorage, setStorage, removeStorage }`（见下文） |
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

沙箱文档的引导脚本是**同步执行**的，因此 `__VueChest__` 上的字段在 bundle 开始执行时就已经全部挂载完毕：`Vue`、`Pinia`、`storage`、`theme` 及各类 Vue API 再导出都可直接使用（`VueRouter` 恒为 `undefined`，无路由能力）。

唯一需要注意的是**数据的时序**：`storage.getStorage` 读的是宿主在 `bootstrap` 消息里注入的**快照**，该快照在 bundle 执行前已写入，所以首屏即可同步读到已持久化的值；而 `setStorage` 是**异步落盘**到宿主的，调用后不要立刻假设宿主侧已写完（应用内的同步读走的是本地缓存，立即读回没问题）。

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

## 5. 需授权能力（`meta.permissions`）

除本地存储外，以下能力**默认关闭**：应用必须在应用包的 `meta.permissions` 里声明，安装（或更新时新增）时由用户确认后才生效。未声明或用户未确认的调用会被宿主桥直接拒绝（返回 rejected 的 Promise）。

```js
export default {
  component: App,
  route: '/m/notes',
  meta: {
    name: '云笔记',
    icon: '📝',
    description: '本地优先、可跨设备同步的笔记',
    version: '1.0.0',
    // 声明需要的能力；未列出的能力调用会被拒绝
    permissions: ['cloud', 'notify'],
  },
}
```

| 权限键      | 对应 API                                    | 说明                                                             | 需登录 |
| ----------- | ------------------------------------------- | ---------------------------------------------------------------- | ------ |
| `notify`    | `__VueChest__.notify({ body, level })`      | 弹宿主 Toast；`level` ∈ `success` / `error` / `warning` / `info` | 否     |
| `clipboard` | `__VueChest__.clipboard.write(txt)` / `.read()` | 读写系统剪贴板                                               | 否     |
| `profile`   | `__VueChest__.user.profile()`               | 读取当前用户 `{ id, username, avatar }`                          | 是     |
| `cloud`     | `__VueChest__.cloud.get/set/remove/list`    | 云端键值存储，跨设备同步（按「用户 + 应用」双重隔离）            | 是     |
| `ai`        | `__VueChest__.ai.chat(messages, { model })` | 调用站内 AI 模型，返回 `{ content, model }`                      | 是     |
| `files`     | `__VueChest__.files.upload(file)`           | 上传附件到站内存储，返回 `{ key, url, size, contentType }`       | 是     |

运行时可用 `window.__VueChest__.permissions` 读取**本次实际被授予**的权限数组，据此做能力降级：

```js
const { cloud, permissions } = window.__VueChest__

if (permissions.includes('cloud')) {
  await cloud.set('draft', { text: '...' }) // 跨设备保存
} else {
  // 未授权：降级为本地 storage
  window.__VueChest__.storage.setStorage('draft', { text: '...' })
}
```

**边界与配额**

- `cloud`：单个 key ≤ 120 字符，单条 value 序列化后 ≤ 200,000 字符；
- `ai.chat`：每次最多 20 条消息、单条 ≤ 8000 字符，服务端非流式返回；
- `files.upload`：单文件 ≤ 4MB，仅放行常见图片 / 文档 / 压缩包类型；
- `cloud` 与 `ai` 均按登录用户计量，未登录调用会直接失败。

> ⚠️ **权限变更需重新授权**：新版本若新增了权限，更新时会提示「本次新增权限」并要求用户确认，未确认不会写入本地。
> 授权确认由 `market` store 统一把关（`ensureConsent`），不依赖具体页面，因此从市场列表、应用详情、工作区模板恢复、跨设备同步等任何入口安装 / 更新都会弹窗；用户点「取消」时抛出 `PermissionCancelledError`，不会留下错误状态。
> **后台自动更新（`updateAll`）不会弹窗**：它走 `consent: 'skip'`，遇到新增权限直接跳过该应用并写入 `updateErrors`，等用户手动更新 —— 绝不会静默授权。

## 6. 主题能力

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

> ✅ **市场 app 零暗色代码**：宿主 `sandbox.html` 注入 `./tokens.css`，与主工程 `index.html` 共用**同一份** `public/tokens.css`（含 `:root` 浅色与 `:root.dark` 深色两套 token）。沙箱会随主题在 `<html>` 上切换 `dark` class，于是 `var(--bg-card)` 等变量**自动**取对应深浅值。市场应用只需用 `var(--xxx)` 取色，无需任何 `:global(html.dark)` 覆盖。

- **样式颜色（推荐）**：所有背景 / 文字 / 边框 / 强调色都用 token 变量，跟随主题全自动切换：

  ```css
  .card { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border); }
  /* 无需暗色覆盖：dark 下 --bg-card 等已由 tokens.css 的 :root.dark 给出 */
  ```

  ⚠️ token 的**唯一可编辑源**是 `public/tokens.css`（主工程与沙箱共用）；改 token 只改这一处，不要在 `src/` 另存副本。改完照常 `build:market` + `publish:market` 即可。

- **JS 决定的颜色**（canvas / ECharts / 手写内联样式）：CSS 够不到，需要靠 `isDark` 判断当前主题，并用 `onChange` 在切换时重绘。

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

## 7. 网络能力（fetch 白名单代理）

沙箱是 opaque origin，应用**无法直接 `fetch`**（会被 CORS 拦截）。宿主的引导脚本重写了沙箱内的 `window.fetch`，把它转成经宿主代理的请求：

```js
// 用法与标准 fetch 完全一致，返回标准 Response
const res = await fetch('https://api.example.com/quote?symbol=600519')
const data = await res.json()
```

放行规则：

- 只有命中应用声明的**域名白名单**（`allowNetwork`）才会放行，其余域名一律拒绝，`fetch` 会 reject；
- 白名单支持精确域名（`api.example.com`）与通配子域（`*.example.com`）；
- 单次请求超时 **15s**；代理回包会还原 `status` / `statusText` / `headers` / `body`，与原生 `Response` 行为一致。

> ⚠️ **白名单不由 bundle 自声明**，而是在你**上传应用时填写「联网域名白名单」**、经管理员审核后写入服务端 `market_apps.allowNetwork`。需要联网的应用请提前把域名列清楚，否则运行时 fetch 必然失败。

## 8. 使用建议与边界

- **不要自带 Vue / Pinia**：务必外部化，复用宿主实例，否则会与主站冲突。
- **key 加前缀**：本地存储的键名带上应用前缀，避免冲突。
- **订阅要清理**：`onChange` 返回的取消函数应在应用卸载时调用，避免内存泄漏。
- **按权限降级**：需要云端能力时先看 `__VueChest__.permissions`，未授权时退回本地存储，避免功能整体不可用。
- **安全须知**：市场应用运行在 **iframe 沙箱**（`sandbox="allow-scripts"`，opaque origin）内，与主站彻底隔离。存储按应用命名空间隔离，网络默认拒绝（需白名单放行），能力权限默认不授予（需声明 + 用户确认）。详见 [沙箱机制](./market-sandbox.md)。

## 相关文档

- [应用包开发规范](./market-spec.md)
- [主题变量与深色模式](./theme-variables.md)
- [如何上传应用到市场](./market-upload.md)
- [注意事项](./market-notes.md)
