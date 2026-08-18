# 浏览器缓存机制

> 缓存是前端性能（见 `perf-frontend.md`）与网络（见 `http-network.md`）的交汇点。本文把"强缓存 / 协商缓存 / Service Worker / 内存与磁盘"讲透，让你既会配 CDN，也懂调试 304。

## 一、缓存位置与命中顺序

浏览器请求资源时，大致按此顺序查找：

1. **Service Worker Cache**（可编程，最灵活）
2. **Memory Cache**（内存，最快，随标签页关闭消失）
3. **Disk Cache**（磁盘，持久，容量大）
4. **Push Cache**（HTTP/2 推送，已渐弃用）

命中即返回，不再走网络。

## 二、强缓存（不发请求）

由响应头控制，命中后**完全不请求**服务器：

| 头 | 说明 |
| --- | --- |
| `Cache-Control: max-age=3600` | 相对时间（秒），优先级最高 |
| `Cache-Control: no-cache` | 走协商缓存（每次问服务端） |
| `Cache-Control: no-store` | 禁止任何缓存 |
| `Cache-Control: public/private` | 是否允许代理缓存 |
| `Expires: <GMT时间>` | 绝对时间，已被 `max-age` 取代（有时钟漂移问题） |

> 优先用 `Cache-Control: max-age`，别再依赖 `Expires`。

## 三、协商缓存（发请求，问"能不能用旧的"）

强缓存失效后，浏览器带条件头问服务端：资源变没变？

| 请求头 | 响应头 | 机制 |
| --- | --- | --- |
| `If-None-Match: <etag>` | `ETag` | 资源指纹（哈希），精确 |
| `If-Modified-Since: <时间>` | `Last-Modified` | 最后修改时间，精度到秒，易误判 |

- 没变 → 服务端返回 **304 Not Modified**，浏览器用缓存副本。
- 变了 → 200 + 新资源。

> `ETag` 优先级高于 `Last-Modified`；`Last-Modified` 对"秒级内多次改动"或"内容没变但重生成"会误判。

## 四、缓存策略实践

| 资源 | 推荐策略 |
| --- | --- |
| 带 hash 的静态资源（JS/CSS，`[hash].js`） | `Cache-Control: max-age=31536000, immutable`（永不过期，靠 hash 换文件名） |
| HTML（入口） | `no-cache` 或很短 max-age（保证拿到最新引用） |
| 接口数据 | `ETag` + 304，或前端自管（见 `browser-storage.md`） |

> Vite 构建产物默认带 content-hash（`main.a1b2c3.js`），正适合"长缓存 + 换名即新"。入口 `index.html` 要 `no-cache`，否则用户拿不到新 HTML、缓存旧 chunk。

## 五、Service Worker 缓存（PWA）

```js
// sw.js
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  )
})
```

- 适合离线可用、骨架屏秒开、API 响应缓存。
- 更新需 `skipWaiting` + `clients.claim`，否则旧 SW 卡住。VueChest 若要离线文档可引入。

## 六、调试与坑

- DevTools → Network 看 `Size` 列：`(memory)`/`(disk cache)` 是命中，`304` 是协商。
- **缓存击穿到生产**：HTML 被强缓存导致发版后用户看旧版 → 入口必须 `no-cache`。
- **CDN 与源站不一致**：清 CDN 缓存要先源站后边缘。
- 隐私模式/硬刷新（Cmd+Shift+R）会绕过强缓存，调试时别被误导。

## 七、小结

- 强缓存（max-age）不发请求最快；协商缓存（ETag）问"变没变"。
- 带 hash 资源长缓存，HTML 入口 `no-cache`。
- Service Worker 管离线/API 缓存；调试看 Network 的 Size 列。

## 参考来源

- MDN HTTP 缓存：<https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Caching>
- web.dev 缓存指南：<https://web.dev/articles/http-cache>
- Service Worker MDN：<https://developer.mozilla.org/zh-CN/docs/Web/API/Service_Worker_API>
