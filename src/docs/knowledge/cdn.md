# CDN 原理与静态加速

> 用户在全球，服务器在一地，CDN 让内容"就近送达"。本文讲清 CDN 工作原理、边缘缓存与回源、与浏览器缓存（见 `browser-cache.md`）的协作，以及 VueChest 静态资源如何借 CDN 提速（配合 `docker-deploy.md` / `serverless.md`）。

## 一、CDN 是什么

CDN（内容分发网络）把静态资源（JS/CSS/图片/视频）缓存到**全球边缘节点**，用户从最近的节点取，而非跨半个地球打到源站。核心收益：降延迟、减源站压力、抗突发/防 DDoS。

## 二、请求流程

```
用户 → 本地 DNS → CDN 调度（返回最近边缘 IP）→ 边缘节点
  ├─ 命中缓存 → 直接返回（快）
  └─ 未命中 → 回源站取 → 缓存后返回（慢一次）
```

- **调度**：靠 DNS 或 Anycast，把用户导向最近/最闲节点。
- **回源（Origin Pull）**：边缘没缓存时去源站（对象存储/服务器）取，并缓存。

## 三、缓存策略（与浏览器缓存协作）

- **边缘缓存 TTL**：CDN 按 `Cache-Control` / 自身规则缓存；带 hash 的资源（见 `vite.md`）可长缓存。
- **分层**：浏览器缓存（Memory/Disk）→ CDN 边缘 → 源站，逐层拦截。
- **刷新/ purge**：发版后旧资源若被 CDN 缓存，需主动 purge 或靠 hash 换名自动失效（`index.html` 不缓存，见 `browser-cache.md`）。
- **注意事项**：HTML 入口通常**不缓存或短缓存**，避免用户拿到旧 HTML 引用旧 chunk。

## 四、与对象存储（R2）搭配

- 静态产物（dist/）传对象存储（VueChest 用 R2），前面挂 CDN 加速。
- 对象存储当"源站"，CDN 回源拉取；大文件/视频走 CDN 分发降源站带宽成本。

## 五、VueChest 落地

- 前端 `npm run build` 产物 → 上传 R2 → CDN 域名访问。
- history 模式需 CDN/边缘配 SPA fallback（`try_files` / 边缘函数重写，见 `frontend-router.md` / `docker-deploy.md`）。
- AI 对话的静态资源（图标/字体）同样走 CDN，首屏更快。

## 六、常见坑

- **缓存旧版**：发版后用户看旧 JS → HTML 不缓存 + 资源带 hash + 必要时 purge。
- **忽略 query 串**：默认 CDN 把 `?v=1` 当不同资源，误配会击穿缓存 → 明确缓存键规则。
- **回源风暴**：缓存同时失效大量请求打源站 → 用请求合并/锁（single-flight）或预热。
- **HTTPS**：CDN 需配证书（ACME 自动续期，见 `api-gateway.md`）。

## 七、小结

- CDN = 边缘缓存，就近返回，降延迟/抗峰/防 DDoS。
- 流程：调度到最近节点 → 命中即返，未命中回源缓存。
- 与浏览器缓存分层；HTML 短缓存 + 资源 hash + 必要时 purge；配 SPA fallback。

## 参考来源

- Cloudflare CDN 原理：<https://www.cloudflare.com/learning/cdn/what-is-a-cdn/>
- MDN Cache-Control：<https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Caching>
- R2 对象存储：<https://developers.cloudflare.com/r2/>
