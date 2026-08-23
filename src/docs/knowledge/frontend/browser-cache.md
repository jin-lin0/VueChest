---
group: 浏览器原理与网络
order: 18
---

# 浏览器缓存机制

> 缓存策略的目标不是“尽可能缓存”，而是在正确性、更新速度、首屏性能和流量成本之间取舍。本文覆盖 HTTP 缓存、Service Worker、BFCache、CDN 与发版更新，并给出可落地的配置和排障清单。

## 一、先分清四类缓存

浏览器里并不存在业务可以依赖的固定“内存 → 磁盘”查找顺序。更准确的心智模型是：

1. **BFCache** 保存完整页面快照，用于前进/后退快速恢复；它不是 HTTP 资源缓存。
2. **Service Worker** 可以拦截作用域内的请求，并用 Cache Storage 自定义响应策略。
3. **HTTP cache** 按 HTTP 语义决定复用或重新验证；副本放在内存还是磁盘属于浏览器实现细节。
4. **应用数据缓存** 如 IndexedDB、localStorage、TanStack Query 缓存，由业务定义生命周期。

如果 Service Worker 最终调用 `fetch(request)`，请求仍可能继续使用浏览器 HTTP cache。CDN 则位于浏览器之外，是共享缓存的一部分。不要再把已经淡出浏览器实践的 HTTP/2 Push Cache 当作常规层级。

## 二、新鲜度与重新验证

HTTP 缓存先判断响应是否仍然 **fresh**：

- 新鲜：可以直接复用，通常不访问源站。
- 过期：不代表副本立刻删除，而是根据 `ETag` 或 `Last-Modified` 发起条件请求。
- 服务端确认未变化：返回 `304 Not Modified`，复用旧响应体并更新元数据。
- 已变化：返回 `200` 和新响应。

| 指令                        | 作用                                           |
| --------------------------- | ---------------------------------------------- |
| `max-age=3600`              | 浏览器可复用 3600 秒                           |
| `s-maxage=86400`            | 仅覆盖 CDN、代理等共享缓存的新鲜度             |
| `no-cache`                  | 可以存储，但复用前必须重新验证；它不是“不缓存” |
| `no-store`                  | 不应存储该响应，适合高度敏感内容               |
| `public` / `private`        | 是否允许共享缓存保存                           |
| `immutable`                 | 新鲜期内内容不会改变，适合带内容哈希的资源     |
| `must-revalidate`           | 过期后不能在未验证的情况下继续使用             |
| `stale-while-revalidate=30` | 可短暂使用旧响应，同时后台更新                 |

`Expires` 是绝对时间，受时钟影响；现代应用优先使用 `Cache-Control`。`Age` 能帮助判断响应在共享缓存中已停留多久。

## 三、验证器：ETag 与 Last-Modified

| 响应头          | 后续请求头          | 特点                                           |
| --------------- | ------------------- | ---------------------------------------------- |
| `ETag`          | `If-None-Match`     | 由服务端生成版本标识，可表达弱验证或强验证     |
| `Last-Modified` | `If-Modified-Since` | 实现简单，但时间精度和重新生成场景可能导致误判 |

同一响应同时提供两者时，客户端通常优先使用 ETag 条件。ETag 不要求一定是文件内容哈希，也不要假设分布式节点天然会生成相同值。

缓存键至少包含请求方法和 URI，`Vary` 指定还要纳入哪些请求头。例如按压缩格式返回不同内容时，应设置 `Vary: Accept-Encoding`。误用 `Vary: *` 或把高基数字段放进 `Vary`，会让共享缓存几乎无法命中。

## 四、静态资源与 HTML 的发版策略

推荐把“入口及时更新”和“不可变资源长缓存”配套设计：

| 资源                           | 建议策略                                              |
| ------------------------------ | ----------------------------------------------------- |
| `index.html`                   | `Cache-Control: no-cache`，每次复用前确认入口是否更新 |
| `app.内容哈希.js/css`          | `public, max-age=31536000, immutable`                 |
| 字体、图片等带内容哈希资源     | 长缓存；跨域字体同时检查 CORS                         |
| 公开且可容忍短暂旧值的 GET API | 短 `max-age` 或 `stale-while-revalidate`，明确 `Vary` |
| 个性化或敏感响应               | 通常 `private, no-cache`；极敏感内容考虑 `no-store`   |

下面是一个 Nginx 方向示例，具体语法仍要结合部署平台验证：

```nginx
location = /index.html {
  add_header Cache-Control "no-cache";
}

location ~* \.[0-9a-f]{8,}\.(js|css|png|svg|woff2)$ {
  add_header Cache-Control "public, max-age=31536000, immutable";
}
```

部署顺序也很重要：先上传新哈希资源，再切换 HTML，最后延迟清理旧资源。若立即删除旧 chunk，仍持有旧 HTML 的用户可能出现 `ChunkLoadError`。

## 五、CDN 与 API 缓存

CDN 是否缓存不仅由状态码决定，还受 `Cache-Control`、鉴权头、Cookie、平台规则和缓存键配置影响。排查时同时观察：

- 浏览器的 `Age`、`Cache-Control`、`ETag` 与平台特有命中头。
- CDN 缓存键是否包含 query、Host、协议、语言或设备字段。
- 源站更新与边缘失效顺序，是否存在部分节点尚未刷新。
- 个性化响应是否意外被标成 `public`，造成用户数据串读。

只有语义上允许复用的响应才应缓存。GET 通常可缓存，但“GET 就一定安全缓存”也是误区；带用户身份的 GET 仍需审查隔离策略。

## 六、Service Worker 的正确边界

Service Worker 适合离线外壳、静态资源和明确可降级的数据。不要对所有请求无差别执行 cache-first，否则登录态接口、错误响应和过期 HTML 都可能被永久保存。

```js
const STATIC_CACHE = 'static-v3'
const STATIC_PATHS = new Set(['/offline.html', '/assets/logo.svg'])

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !STATIC_PATHS.has(url.pathname)
  ) {
    return
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    }),
  )
})
```

新 Service Worker 默认会等待旧页面释放控制权。`skipWaiting()` 与 `clients.claim()` 能加速接管，却也可能让旧 HTML 搭配新缓存，形成混合版本；应根据应用能否原子升级决定，并给用户“发现新版本，点击刷新”的明确流程。

## 七、常见坑与排障

- **把 `no-cache` 当成不存储**：它要求重新验证；真正禁止存储是 `no-store`。
- **HTML 长缓存**：入口指向已删除的旧 chunk，发版后白屏。
- **资源 URL 不变却设置 `immutable`**：内容更新后用户长期拿旧文件。
- **错误使用 Service Worker**：缓存 401/500、非 GET 请求或用户私有数据。
- **忽略 `Vary`**：不同编码、语言或 Origin 的响应错误复用。
- **只在 DevTools 勾选 Disable cache 后测试**：该选项会改变真实行为，不能代表普通用户。
- **把刷新等同于清空所有缓存**：普通刷新、硬刷新、清站点数据与注销 Service Worker 的效果不同。

排障时先用无痕窗口确认是否只影响旧客户端，再查看 Network 中的响应来源、状态码和缓存头；若有 Service Worker，同时检查 Application 面板中的激活版本和 Cache Storage。最后再检查 CDN，而不是一上来让用户清全部浏览器数据。

## 八、策略检查清单

- [ ] HTML、哈希静态资源、API、用户私有数据是否分别定义策略？
- [ ] 新资源是否先于新入口发布，旧资源是否保留足够时间？
- [ ] `no-cache`、`no-store`、`private` 的语义是否用对？
- [ ] CDN 缓存键与 `Vary` 是否覆盖真正影响响应内容的维度？
- [ ] Service Worker 是否只处理白名单资源，并只缓存成功的 GET 响应？
- [ ] 是否测试普通刷新、硬刷新、前进后退、离线与跨版本升级？
- [ ] 敏感数据是否避免进入共享缓存和不可控的离线缓存？

## 九、小结

缓存设计的核心是“URL 版本化 + 明确新鲜度 + 可验证更新”。带内容哈希的静态资源可以放心长缓存，HTML 入口应及时验证；API 与 CDN 必须审查缓存键和用户隔离；Service Worker 是可编程代理，不是给全站套一个 `caches.match` 就结束。

## 参考来源

- HTTP Caching（RFC 9111）：<https://httpwg.org/specs/rfc9111.html>
- MDN HTTP 缓存：<https://developer.mozilla.org/docs/Web/HTTP/Caching>
- MDN Cache-Control：<https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Cache-Control>
- Service Worker API：<https://developer.mozilla.org/docs/Web/API/Service_Worker_API>
- web.dev BFCache：<https://web.dev/articles/bfcache>
