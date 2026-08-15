# 市场应用沙箱机制

本文档描述市场应用（第三方 bundle）在 VueChest 中的**安全隔离方案**。核心思路：应用包不再注入主页面执行，而是在带 `sandbox` 属性的 **iframe**（opaque origin）内运行，仅通过 `postMessage` 白名单桥访问受限能力。

> 阅读前提：先看 [应用包开发规范](./market-spec.md) 与 [可用能力](./market-capabilities.md)。

## 1. 为什么需要沙箱

旧方案把 bundle 作为 `<script>` 直接注入主站执行，与主站共享同一上下文：

- 可随意读写宿主任意存储键、调用宿主所有全局 API；
- 可访问 IndexedDB / localStorage，窃取或篡改其他应用乃至宿主数据；
- 可尝试注册 `/admin`、`/login` 等核心路由实施劫持；
- 可发起任意网络请求、播放广告、弹窗等。

一旦市场上出现恶意或带 bug 的第三方应用，主站与用户数据都会受影响。沙箱把第三方代码关进独立进程，使其"碰不到"主站。

## 2. 隔离边界

| 维度       | 旧方案（注入执行）                | 新方案（iframe 沙箱）                            |
| ---------- | --------------------------------- | ------------------------------------------------ |
| 执行环境   | 主站页面上下文                    | 独立 iframe，`sandbox="allow-scripts"`           |
| Origin     | 与主站同源                        | opaque（`null`），隔离 cookie / 存储 / 同源访问     |
| 主站 DOM   | 直接可碰                          | 完全隔离，仅通过 postMessage 通信                 |
| 存储       | 共享宿主 IndexedDB                | 按 `appId` 命名空间隔离，互不可见                 |
| 网络       | 任意                             | 默认拒绝，仅白名单域名放行                         |
| 路由注册   | bundle 自带 route，有劫持风险     | 路径由主机推导收束到 `/market-installed/:id`       |

> 关键点：**不开启 `allow-same-origin`**。开启后 iframe 会与父页面同源，能绕过沙箱读取父页面数据，因此我们刻意不开启。

## 3. 运行流程

```
宿主（VueChest 主站）                         沙箱 iframe（sandbox.html）
        │                                              │
 1. MarketAppSandbox 渲染 iframe                      │
        │─────────────── src=sandbox.html ───────────→│ 加载 Vue/Pinia 全局构建
        │                                              │ 建立受限 __VueChest__ 桥
        │←─────────────── post ready ─────────────────│
 2. 读取 bundle 代码 + 收集命名空间存储快照            │
        │─────── post bootstrap {bundle, storage} ───→│ 注入 bundle → 挂载组件
        │                                              │
 3. 应用调用 storage.set / fetch 等                    │
        │←──── post capability / fetch（带 id）────────│
        │────── post capability-response（带 id）─────→│ 结算 Promise
 4. 主题切换时推送                                      │
        │─────────────── post theme ─────────────────→│ 本地派发 theme.onChange
```

## 4. 消息协议

父 ↔ 沙箱统一走 `postMessage`，每条请求带 `id`，响应回带同一 `id`，沙箱据此结算 `Promise`。

**父 → 沙箱**

| kind                  | 内容                                                          |
| --------------------- | ------------------------------------------------------------- |
| `bootstrap`           | `{ appId, bundle, storage<快照>, theme }`                     |
| `theme`               | `{ isDark }`，主题切换时推送                                  |
| `capability-response` | `{ id, value \| error }`，能力请求的响应                       |
| `fetch-response`      | `{ id, status, statusText, headers, body(number[]) }`         |

**沙箱 → 父**

| kind          | 内容                                              |
| ------------- | ------------------------------------------------- |
| `ready`       | 沙箱脚本就绪，请求父侧注入 bootstrap              |
| `capability`  | `{ id, name, args }`：`storage.set` / `storage.remove` |
| `fetch`       | `{ id, url, options }`，网络代理请求              |

## 5. 能力白名单

宿主侧 `src/lib/sandbox-bridge.ts` 是唯一的能力出口，所有能力都经过校验：

- **存储**：父侧把应用数据写入 `sandbox:{appId}:{key}` 命名空间，应用之间互不可见；返回给应用的是去掉前缀的干净 key。
- **网络**：`handleSandboxFetch` 先校验 URL，仅当 `host` 命中 `allowNetwork` 白名单（支持 `*.example.com`）才放行，否则拒绝；单次请求有 15s 超时，防止挂起。
- **未授权能力**：一律返回 `未授权的能力: xxx` 错误。

> 沙箱默认拒绝一切网络（`allowNetwork: []`）。第三方应用如需联网，**必须**在应用元数据里显式声明域名白名单——该字段来自服务端 `market_apps.allowNetwork`，由开发者上传时声明、管理员审核时可修改，是受信任真源（**不由 bundle 自声明**，避免恶意应用自行开权限）。白名单命中规则见 [sandbox-bridge.ts](../../src/lib/sandbox-bridge.ts) 的 `hostAllowed`：`api.example.com` 精确匹配、`*.example.com` 通配其子域。

## 6. 兼容性

- 存储的**读**在沙箱内是同步的（基于 bootstrap 注入的快照），因此 `getStorage(key, def)` 的用法与旧版一致；**写**是异步落盘，`setStorage` 仅触发 postMessage，无返回值依赖。
- `theme.isDark`（同步）与 `theme.onChange(cb)`（同步订阅，宿主推送）用法不变。
- `fetch` 在沙箱内被包装为网络代理，返回标准 `Response`，但**仅白名单域名**可用。

## 7. 涉及文件

| 文件                                          | 作用                                       |
| --------------------------------------------- | ------------------------------------------ |
| `public/sandbox.html`                         | 沙箱宿主页：加载 Vue/Pinia + 受限运行桥    |
| `public/vendor/vue.global.prod.js`（构建复制） | 沙箱内 Vue 全局构建                        |
| `public/vendor/pinia.iife.prod.js`（构建复制） | 沙箱内 Pinia 全局构建                      |
| `src/components/MarketAppSandbox.vue`         | iframe 容器：渲染 iframe + 双向消息桥      |
| `src/lib/sandbox-bridge.ts`                   | 父侧能力桥：存储命名空间 + 网络白名单代理  |
| `src/stores/market.ts`                        | 市场 store：改为注册沙箱路由，不再执行 bundle |

## 相关文档

- [应用包开发规范](./market-spec.md)
- [市场应用可用能力](./market-capabilities.md)
- [主题变量与深色模式](./theme-variables.md)
- [注意事项](./market-notes.md)