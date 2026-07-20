# 应用包开发规范

本规范面向**开发者**，描述如何把你的 Vue 应用打包成可被 VueChest 应用市场加载、安装的"市场应用包"。请严格按照以下规格开发，否则上传时会被判定为"无法解析应用包"。

> 核心要点：应用包是一个 **Vite 构建的 IIFE 格式 `.js` 文件**，全局暴露 `window.MarketApp`，入口 `export default { component, route, meta }`，且 **Vue 必须外部化**，运行时复用宿主的 Vue。

## 1. 构建格式

- 使用 **Vite** 的 `build.lib` 模式，输出格式为 **IIFE**。
- 全局变量名指定为 `MarketApp`（`name: 'MarketApp'`）。
- 产物文件名应为 `app.js`。
- **`vue` 必须外部化（external）**，运行时指向宿主提供的 Vue：`window.__VueChest__.Vue`。
  - 通过 `vite` 的 `output.globals` 配置：`{ vue: 'window.__VueChest__.Vue' }`。
  - 若你用到了 **pinia**，同样需外部化为 `window.__VueChest__.Pinia`。
- **不要把 Vue 打进包里**，否则会与原站 Vue 实例冲突。

## 2. 入口导出约定

入口文件必须 `export default` 一个包含以下三个字段的对象：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `component` | Vue 组件 | 应用安装后渲染的 Vue 组件 |
| `route` | string | 安装后的访问路径，如 `/m/counter` |
| `meta` | object | 应用元信息（见下表） |

`meta` 字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | **是** | 应用名称；缺失时服务端会拒绝创建（"名称、图标和应用文件不能为空"） |
| `icon` | string | **是** | 应用图标（如 emoji）；缺失时服务端拒绝创建 |
| `description` | string | 建议 | 应用描述；缺省时按空串 `''` 处理 |
| `version` | string | 否 | 版本号；缺省时回退为 `1.0.0` |

> 说明：上传页面**不提供**这些字段的输入框，它们全部从 `meta` 自动解析回填。因此 `name`、`icon` 实际上是"上传时的必填内容"（写在包里）。详见 [如何上传应用到市场](./market-upload.md)。

## 3. 类型定义参考

以下是推荐的类型定义，便于在开发时使用：

```ts
export interface MarketAppMeta {
  name: string
  icon: string
  description: string
  version?: string
}

export interface MarketAppDefinition {
  component: any // Vue 组件
  route: string
  meta: MarketAppMeta
}
```

## 4. 加载与校验机制（宿主侧）

VueChest 在运行时会按如下方式加载应用包：

1. 从 R2 下载应用包的文本。
2. 将代码作为 `<script>` 注入 `document.head` 执行，从而暴露全局 `window.MarketApp`。
3. 读取 `window.MarketApp`，取 `exports.default || exports`。
4. 校验其是否同时包含 `component && route && meta`。

- **上传解析阶段**用的是 `extractMetaFromBundle(code)`：只要能取到 `meta` 即视为解析成功、回填应用信息；取不到则返回 `null`，页面提示"无法解析应用包"。
- **安装 / 恢复阶段**用的是 `loadMarketApp(code)`：若缺少 `component / route / meta` 中任一项，会 `console.warn('Invalid market app definition')` 并**返回 `null`**（**不是抛出异常**），该应用将无法注册路由。

> 提示：也就是说，你的 IIFE 包必须把内容挂到 `window.MarketApp`，且 `MarketApp.default` 必须包含前面约定的三个字段。

## 5. 运行时桥（Runtime Bridge）

宿主通过 `window.__VueChest__` 向市场应用暴露运行环境。核心字段如下（完整清单、时序与示例见 [市场应用可用能力](./market-capabilities.md)）：

- `window.__VueChest__.Vue` —— 宿主的 Vue（务必复用，勿自带）
- `window.__VueChest__.VueRouter` —— 宿主的 vue-router 模块
- `window.__VueChest__.Pinia` —— 宿主的 Pinia 模块（含 `defineStore`，跨应用共享状态）
- `window.__VueChest__.storage` —— 本地存储能力 `{ getStorage, setStorage }`
- `window.__VueChest__.theme` —— 主题对象（`AppTheme`）
- 另外还再导出了常用 Vue API：`defineComponent` / `defineAsyncComponent` / `h` / `ref` / `computed` / `reactive` / `watch` / `onMounted` / `onUnmounted`
- `window.__APP_THEME__` —— 供市场 app 跟随深色模式（与 `__VueChest__.theme` 同一实例）

> 时序提醒：`Pinia` 与 `storage` 在宿主 `initStorage()` 完成后才追加，其余字段首屏即就绪。市场应用通常在宿主启动后才加载，一般无需担心；如需极早访问请判空。

## 6. 最小可运行示例

### 6.1 Vite 配置（`vite.config.js`）

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'MarketApp',
      formats: ['iife'],
      // 产物文件名固定为 app.js
      fileName: () => 'app.js'
    },
    rollupOptions: {
      // vue 必须外部化，运行时复用宿主 Vue
      external: ['vue'],
      output: {
        globals: {
          vue: 'window.__VueChest__.Vue'
        }
      }
    }
  }
})
```

### 6.2 入口文件（`src/index.js`）

```js
import { defineComponent, h } from 'vue'

// 应用组件：这里用一个最简单的计数器演示
const App = defineComponent({
  name: 'CounterApp',
  data() {
    return { count: 0 }
  },
  render() {
    return h(
      'button',
      { onClick: () => this.count++ },
      `点击了 ${this.count} 次`
    )
  }
})

// 入口必须 export default { component, route, meta }
export default {
  component: App,
  route: '/m/counter', // 安装后的访问路径，建议统一以 /m/ 开头
  meta: {
    name: '计数器',
    icon: '🔢',
    description: '一个最小可运行的市场应用示例',
    version: '1.0.0'
  }
}
```

构建后得到的 `dist/app.js` 即为可上传到市场的应用包。

## 7. 开发者手动发布官方应用

如果你是平台维护者，需要手动构建并发布官方应用，可使用以下脚本：

- `npm run build:market` —— 由 `scripts/build-market-apps.mjs` 构建市场 app。
- `npm run publish:market` —— 由 `scripts/publish-market-apps-r2.mjs` 发布到 R2，并调用 `approve` 接口上架。

## 8. 后端记录字段（MarketAppItem）

应用在市场后端以如下字段存储（供参考）：

| 字段 | 说明 |
| --- | --- |
| `id` | 应用唯一 ID |
| `name` | 名称 |
| `icon` | 图标 |
| `description` | 描述 |
| `version` | 版本 |
| `author` | 作者 |
| `category` | 分类 |
| `size` | 包大小 |
| `screenshots` | 截图（可选） |
| `readme` | 说明文档（可选） |
| `isOfficial` | 是否官方应用 |
| `downloads` | 下载 / 安装次数 |
| `status` | 状态（如待审核 / 已上架） |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

## 9. 相关 API 端点

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/market/categories` → `[{name,count}]` | 分类及数量（仅统计已通过） | 否 |
| GET | `/api/market/apps?category=&keyword=&page=&limit=` | 应用列表（公开只见已通过；管理员可见全部） | 可选 |
| GET | `/api/market/apps/:id` | 应用详情（非管理员 / 非上传者只能看已通过） | 可选 |
| GET | `/api/market/apps/:id/download` → `{name,version,fileUrl}` | 获取 bundle 地址（仅已通过，含下载计数） | 否 |
| POST | `/api/uploads/presign` `{kind:'app',contentType,size,name}` → `{key,uploadUrl,expiresIn}` | 申请预签名直传地址（校验类型 / 大小 ≤10MB） | 是 |
| PUT | `uploadUrl` | 用预签名 URL 直传文件到 R2 | 否 |
| POST | `/api/uploads/complete` `{kind:'app',key}` | 完成上传（再次校验文件大小） | 是 |
| POST | `/api/market/apps` `{name,icon,description,version,category,readme,fileKey,fileSize}` | 创建应用（`name`/`icon`/`fileKey` 必填，`fileKey` 须以 `apps/{userId}/` 开头，状态 pending） | 是 |
| POST | `/api/market/apps/:id/approve` | 审核通过（上架） | 管理员 |
| POST | `/api/market/apps/:id/reject` | 审核拒绝 | 管理员 |
| PUT | `/api/market/apps/:id` | 更新应用（名称 / 分类 / 状态 / 文件等） | 管理员 |
| DELETE | `/api/market/apps/:id` | 删除应用（同时删 R2 文件） | 管理员 |
| GET | `/api/auth/installed-apps` → `[id]` | 读取当前用户已安装应用 ID 列表 | 是 |
| PUT | `/api/auth/installed-apps` `{installedApps:[id]}` | 全量更新已安装应用 ID 列表（跨设备同步） | 是 |

> 鉴权列的"可选"表示接口对匿名开放，但携带管理员令牌时可见到更多内容（如未通过审核的应用）。"管理员"表示需要 `admin` / `super_admin` 角色。

API 基础地址默认 `http://localhost:3000`，生产为 `https://server.020201.xyz`（由 `VITE_API_BASE_URL` 决定）。请求封装 `api.get / post / put / delete` 统一返回 `{ success, data }`；需登录接口自动带 `Authorization: Bearer <token>`。

## 相关文档

- [市场应用可用能力](./market-capabilities.md)
- [主题变量与深色模式](./theme-variables.md)
- [如何上传应用到市场](./market-upload.md)
- [审核与发布流程](./market-review.md)
- [注意事项](./market-notes.md)
