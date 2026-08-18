---
group: 浏览器原理与网络
order: 17
---

# 浏览器存储

> 适用场景：存 token、用户偏好、离线数据、大文件缓存。本文对比 Cookie / LocalStorage / SessionStorage / IndexedDB / Cache API，并给选型。
> 阅读前提：HTTP 基础（见 `http-network`）、Promise（见 `js-modern`）。

浏览器有五种主流存储，能力差异巨大。选错会踩坑（如把大 JSON 塞 LocalStorage 卡顿、敏感信息落本地泄露）。

## 一、五种存储对比

| 存储 | 容量 | 生命周期 | 能否跨标签页 | 类型 | 典型用途 |
|------|------|----------|--------------|------|----------|
| **Cookie** | ~4KB | 可设过期（或不超时=会话） | 是（同源） | 字符串，随请求发服务端 | 会话标识、CSRF token |
| **LocalStorage** | ~5MB | 永久（手动清） | 是 | 字符串 | 主题偏好、非敏感设置 |
| **SessionStorage** | ~5MB | 标签页关闭即清 | 否（仅本标签） | 字符串 | 表单草稿、单页临时态 |
| **IndexedDB** | 数百 MB+ | 永久 | 是 | 结构化（对象/二进制） | 离线数据、缓存、大表 |
| **Cache API** | 取决于磁盘 | 手动管理 | 是 | 请求/响应（HTTP 缓存） | PWA 离线、Service Worker |

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

## 参考来源

- MDN Web Storage：<https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Storage_API>
- MDN IndexedDB：<https://developer.mozilla.org/zh-CN/docs/Web/API/IndexedDB_API>
- MDN Cookie：<https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Cookies>
- Cache API：<https://developer.mozilla.org/zh-CN/docs/Web/API/Cache>
