---
group: 部署与云原生
order: 4
---

# CDN 原理与静态加速

> 用户在全球，服务器在一地，CDN 让内容"就近送达"。本文讲清 CDN 工作原理、边缘缓存与回源、与浏览器缓存（见 `browser-cache.md`）的协作，以及 VueChest 静态资源如何借 CDN 提速（配合 `docker-deploy.md` / `serverless.md`）。

## 一、CDN 是什么

CDN（内容分发网络）把可缓存内容分发到边缘节点，调度系统综合网络拓扑、健康度、容量和策略选择节点，不保证物理距离最近。正确配置可降低延迟与源站压力、吸收突发流量；DDoS 防护能力取决于供应商套餐、规则和源站是否被绕过，不能仅因“用了 CDN”就默认安全。

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
- **分层**：浏览器 HTTP cache、CDN 边缘/上层缓存和源站共同决定复用；内存或磁盘属于浏览器实现细节，不是业务可依赖的固定顺序。
- **刷新/purge**：同 URL 内容必须紧急更新时可主动失效；日常发版优先内容哈希换名，避免依赖全球 purge 的完成时刻。
- **入口策略**：HTML 通常 `no-cache` 或短新鲜度；“不缓存”与 `no-cache` 语义不同，详见 `browser-cache.md`。

一套典型响应头方向是：

```http
# 带内容哈希、公开静态资源
Cache-Control: public, max-age=31536000, immutable

# SPA 入口：允许存储，但复用前验证
Cache-Control: no-cache
ETag: "entry-v42"

# 可短暂陈旧的公开 API（是否允许由业务决定）
Cache-Control: public, s-maxage=60, stale-while-revalidate=30
Vary: Accept-Encoding
```

## 四、与对象存储（R2）搭配

- 静态产物传对象存储，前面挂 CDN 加速。VueChest 服务端已集成 R2 能力，但前端产物是否切换为 R2/CDN 应以实际部署配置为准。
- 对象存储当"源站"，CDN 回源拉取；大文件/视频走 CDN 分发降源站带宽成本。

## 五、VueChest 落地

- 可选部署路径：前端构建产物 → 上传 R2 → 自定义 CDN 域名访问；当前环境先验证自动化、回滚与 SPA fallback。
- history 模式需 CDN/边缘配 SPA fallback（`try_files` / 边缘函数重写，见 `frontend-router.md` / `docker-deploy.md`）。
- AI 对话的静态资源（图标/字体）同样走 CDN，首屏更快。

## 六、常见坑

- **缓存旧版**：发版后用户看旧 JS → HTML 不缓存 + 资源带 hash + 必要时 purge。
- **忽略 query 串**：默认 CDN 把 `?v=1` 当不同资源，误配会击穿缓存 → 明确缓存键规则。
- **回源风暴**：缓存同时失效大量请求打源站 → 用请求合并/锁（single-flight）或预热。
- **HTTPS**：CDN 需配证书（ACME 自动续期，见 `api-gateway.md`）。

## 七、缓存键与内容变体

缓存键决定哪些请求共享一个副本，常见维度有 Host、path、query、协议与少量请求头。规则过少会串内容，过多会碎片化：

- 跟踪参数如 `utm_*` 通常不应影响静态资源内容，可规范化后再缓存。
- 图片缩放若由 query 控制，宽度、格式、质量必须进入缓存键，并限制允许范围防止攻击者制造无限变体。
- `Vary: Origin`、语言或设备字段会扩大变体数量；使用前测基数和命中率。
- 登录 Cookie/Authorization 参与的响应默认谨慎处理，个性化内容不得误设 `public`。
- 压缩、CORS 与 Range 响应要验证 CDN 是否按对应头正确区分和回源。

不要用 query token 暴露长期私有下载权限。私有资源使用短期签名 URL/cookie、边缘鉴权和不可预测但非安全边界的对象键；缓存命中时仍要保证授权策略不会跨用户复用。

## 八、回源保护与发布

边缘 miss、TTL 同时到期或热点内容首次出现会造成回源峰值。可使用 tiered cache、请求合并、stale-if-error、预热和源站限流；是否启用陈旧响应取决于内容能否容忍过期。支付状态、权限和库存不能为了命中率随意返回旧值。

静态发布顺序：先上传新 hash 资源并校验，再切换入口，最后延迟清理旧资源。这样即使边缘或浏览器仍持有旧 HTML，也能下载旧 chunk。回滚只需把入口指回旧版本，不依赖重新上传已经被删除的资源。

源站只允许 CDN 出口或使用 authenticated origin pull，避免攻击者绕过 WAF/限流直打公开 bucket/服务器。对象存储权限、CORS 与 CDN 签名各自独立验证。

## 九、可观测性与排障

重点指标包括 cache hit ratio、origin offload、按状态/路径的流量、TTFB P50/P95、回源错误、purge 延迟、字节命中率和热点分布。总体命中率可能被大图片掩盖，应按 HTML、JS、图片、API 和区域拆分。

排障时用响应的 `Age`、`Cache-Control`、`ETag`、`Vary` 与供应商缓存状态头判断命中层；用不同地区节点和携带/不携带 Cookie 的请求复现。先确认缓存键和规则版本，再执行 purge，避免“清了就好”掩盖错误配置。

## 十、架构决策清单

- [ ] 哪些内容可公开共享、可私有复用、必须实时或绝不能缓存？
- [ ] HTML 与内容哈希资源是否配套，旧产物是否保留到客户端自然淘汰？
- [ ] query、header、Cookie、Origin 中哪些维度真正影响响应？
- [ ] 私有对象在边缘命中时是否仍保持用户/租户隔离？
- [ ] 回源峰值是否有合并、分层缓存、限流或陈旧兜底？
- [ ] 源站能否被绕过 CDN，bucket 是否意外公开？
- [ ] 是否能按资源类型和区域观察命中率、回源、TTFB 与错误？
- [ ] purge、配置变更、证书和版本切换是否自动化且可回滚？

## 十一、小结

- CDN = 边缘缓存，就近返回，降延迟/抗峰/防 DDoS。
- 流程：调度到最近节点 → 命中即返，未命中回源缓存。
- 与浏览器缓存分层；HTML 短缓存 + 资源 hash + 必要时 purge；配 SPA fallback。

## 参考来源

- Cloudflare CDN 原理：<https://www.cloudflare.com/learning/cdn/what-is-a-cdn/>
- MDN Cache-Control：<https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Caching>
- R2 对象存储：<https://developers.cloudflare.com/r2/>
