---
group: 浏览器原理与网络
order: 17
---

# 浏览器存储

> 适用场景：存 token、用户偏好、离线数据、大文件缓存。本文对比 Cookie / LocalStorage / SessionStorage / IndexedDB / Cache API，并给选型。
> 阅读前提：HTTP 基础（见 `http-network`）、Promise（见 `js-modern`）。

浏览器有五种主流存储，能力差异巨大。选错会踩坑（如把大 JSON 塞 LocalStorage 卡顿、敏感信息落本地泄露）。

## 一、五种存储对比

| 存储               | 容量       | 生命周期                  | 能否跨标签页   | 类型                   | 典型用途                 |
| ------------------ | ---------- | ------------------------- | -------------- | ---------------------- | ------------------------ |
| **Cookie**         | ~4KB       | 可设过期（或不超时=会话） | 是（同源）     | 字符串，随请求发服务端 | 会话标识、CSRF token     |
| **LocalStorage**   | ~5MB       | 永久（手动清）            | 是             | 字符串                 | 主题偏好、非敏感设置     |
| **SessionStorage** | ~5MB       | 标签页关闭即清            | 否（仅本标签） | 字符串                 | 表单草稿、单页临时态     |
| **IndexedDB**      | 数百 MB+   | 永久                      | 是             | 结构化（对象/二进制）  | 离线数据、缓存、大表     |
| **Cache API**      | 取决于磁盘 | 手动管理                  | 是             | 请求/响应（HTTP 缓存） | PWA 离线、Service Worker |

## 二、Cookie（与请求绑定）

```ts
// 读（前端只能读非 HttpOnly 的）
document.cookie // "token=abc; theme=dark"
// 写（注意属性）
document.cookie = 'theme=dark; max-age=31536000; path=/; SameSite=Lax'
```

> **HttpOnly** 的 Cookie 前端读不到（防 XSS 偷 token）；**SameSite** 防 CSRF（见 `web-security`）。VueChest 的会话若走 Cookie 必带这两个属性。

## 三、LocalStorage / SessionStorage

```ts
localStorage.setItem('theme', 'dark')
const t = localStorage.getItem('theme')
localStorage.removeItem('theme')
// 只能存字符串：对象要 JSON 序列化
localStorage.setItem('user', JSON.stringify({ id: 1 }))
```

> 坑：**同步 API**，主线程读写大对象会卡；**仅字符串**，对象要 JSON 化；**同源共享**，别存敏感信息（XSS 可读取，见 `web-security`）。VueChest 的主题/轻量偏好可落此处。

## 四、IndexedDB（结构化大容量）

```ts
// 用 promise 封装简化（原生回调较繁琐）
const db = await new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open('vc', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('kv', { keyPath: 'id' })
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})
const tx = db.transaction('kv', 'readwrite')
tx.objectStore('kv').put({ id: 'doc1', content: '...' })
```

> 适合：离线文档、草稿、大列表缓存、二进制（Blob/ArrayBuffer）。VueChest 的某些本地持久数据（如 API 管理器种子之外的用户自定义）即走 IndexedDB（见项目约定）。

## 五、Cache API（配合 Service Worker 做离线）

```ts
// Service Worker 里缓存静态资源
await caches.open('vc-v1').then((c) => c.addAll(['/index.html', '/app.js']))
const hit = await caches.match(request)
if (hit) return hit // 离线也能返回
```

> PWA 离线能力核心。普通业务页不一定要碰，但做「可安装/离线可用」站点（如 `vite-plugin-pwa`）必用。

## 六、选型决策树

```
要随每个请求发给服务端（会话）？ ──是──> Cookie（HttpOnly+SameSite）
        │否
仅本标签页临时态？ ──是──> SessionStorage
        │否
小字符串、永久、跨标签？ ──是──> LocalStorage
        │否
大/结构化/离线/二进制？ ──是──> IndexedDB
        │否
静态资源离线缓存？ ──是──> Cache API + Service Worker
```

> 黄金法则：**敏感信息别落前端存储**；大对象别塞 LocalStorage（同步卡顿）；需要查询/大容量用 IndexedDB。VueChest 的 token 持久化走 Pinia + 可选 localStorage（见 `pinia`），并受同源/XSS 防护约束。

## 七、容量、持久性与清理

表格中的容量只能作为数量级直觉，真实配额由浏览器、设备空间、站点活跃度和隐私模式决定。写入随时可能因配额、权限或磁盘失败；用 `navigator.storage.estimate()` 观察 usage/quota，需要重要离线数据时请求 persistent storage，但用户代理仍保留最终决定权。

缓存必须有预算和淘汰策略。记录 schema 版本、更新时间和近似体积，优先删除可重新下载的旧缓存；用户原创草稿与可重建接口缓存不能使用同一清理优先级。退出账号时清理或切换用户命名空间，防止共享设备串数据。

```ts
async function storageStatus() {
  const estimate = await navigator.storage?.estimate()
  const persisted = await navigator.storage?.persisted?.()
  return {
    usage: estimate?.usage ?? 0,
    quota: estimate?.quota ?? 0,
    persisted: persisted ?? false,
  }
}
```

## 八、IndexedDB 事务与迁移

对象仓库和索引只能在版本升级事务中修改。升级函数应是确定、短小的结构迁移；大批数据转换可在打开数据库后分批完成并记录迁移状态，避免阻塞其他标签。事务在事件循环控制权返回后可能自动提交，因此不要在事务中等待无关网络请求。

数据库被其他标签页占用时会触发 `blocked`，旧连接则收到 `versionchange`。应用要关闭旧连接并提示刷新，否则新版本可能永久卡住。业务写入把相关 store 操作放在同一 readwrite transaction，只有 `transaction.oncomplete` 后才向 UI 宣布成功。

## 九、多标签页一致性

LocalStorage 的 `storage` 事件只通知其他文档，不通知发起写入的当前页面；IndexedDB 也不会自动让内存状态更新。轻量状态可用 `BroadcastChannel` 广播“数据已变化”，接收方重新读取权威存储。消息只做通知，不要同时维护另一份完整数据副本。

```ts
const channel = new BroadcastChannel('workspace')
channel.addEventListener('message', (event) => {
  if (event.data?.type === 'changed') void reloadWorkspace()
})

async function saveWorkspace(value: Workspace) {
  await db.workspaces.put(value)
  channel.postMessage({ type: 'changed', id: value.id })
}
```

## 十、常见坑与安全边界

- **把 Cookie 容量和策略写死**：浏览器限制会变化，Cookie 还会增加请求体；只保存必要会话标识。
- **认为 HttpOnly 防所有攻击**：它降低 token 被 JS 读取的风险，但恶意脚本仍可能以用户身份发请求；还需 CSP、输出编码和 CSRF 防护。
- **缓存当数据库真源**：Cache API 命中不保证业务数据新鲜，必须设计版本和失效。
- **忽略序列化失败**：循环引用、BigInt、类实例和 schema 变化都可能破坏 JSON 恢复；读取后验证并迁移。
- **无界离线队列**：网络长期失败会持续占空间；设置条数、体积、重试次数和过期时间。
- **在 render 热路径读 LocalStorage**：同步 IO 会阻塞主线程；启动时一次读取到内存，后续批量落盘。

## 十一、上线检查清单

1. 按数据敏感性、容量、查询方式、生命周期和是否随请求发送选择存储。
2. 所有读取视为不可信输入，做 schema 校验、默认值和版本迁移。
3. 写入处理配额与权限失败；重要本地数据提供导出、恢复或云同步。
4. 多账号与多标签页有明确隔离和同步协议。
5. Cache/IndexedDB 有容量预算、淘汰和旧版本清理。
6. Cookie 明确 Secure、HttpOnly、SameSite、Path/Domain 和过期策略。

## 参考来源

- MDN Web Storage：<https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Storage_API>
- MDN IndexedDB：<https://developer.mozilla.org/zh-CN/docs/Web/API/IndexedDB_API>
- MDN Cookie：<https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Cookies>
- Cache API：<https://developer.mozilla.org/zh-CN/docs/Web/API/Cache>
- Storage API：<https://developer.mozilla.org/docs/Web/API/Storage_API>
- BroadcastChannel：<https://developer.mozilla.org/docs/Web/API/BroadcastChannel>
