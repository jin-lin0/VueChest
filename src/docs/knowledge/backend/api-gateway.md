---
group: Node 与 API
order: 2
---

# API 网关与 Nginx

> 多服务、多端点的系统需要一道"统一门面"：路由、鉴权、限流、SSL。本文讲清 API 网关的职责、Nginx 实战配置，以及与 K8s Ingress（见 `kubernetes.md`）的关系，补运维架构视角（配合 `docker-deploy.md` / `serverless.md`）。

## 一、网关解决什么

没有网关时，客户端直连各微服务：地址散、鉴权重复、难限流、难观测。网关作为**统一入口**，集中处理横切关注点：

- **路由**：按路径/域名转发到后端服务。
- **反向代理**：隐藏真实后端，客户端只认网关。
- **负载均衡**：把请求分摊到多实例。
- **认证与粗粒度策略**：统一校验 Token/API Key、配额和来源；下游服务仍须执行资源级授权，不能“网关验过就全信”。
- **限流**：防刷、保护后端（见 `redis-cache.md` 的限流思路）。
- **TLS 终止**：集中管理公网证书；内部是否继续 TLS/mTLS 由网络信任模型和合规要求决定。

## 二、Nginx 反向代理实战

```nginx
upstream vc_server {
  server 10.0.0.1:3000;
  server 10.0.0.2:3000;
}
server {
  listen 443 ssl;
  server_name app.example.com;
  ssl_certificate     /etc/ssl/app.crt;
  ssl_certificate_key /etc/ssl/app.key;

  location /api/ {
    proxy_pass http://vc_server;
    proxy_set_header Host $host;
    proxy_set_header X-Request-Id $request_id;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 3s;
    proxy_read_timeout 60s;
  }
  location / { try_files $uri $uri/ /index.html; } # SPA fallback
}
```

> `try_files` 是这一种 Nginx 静态托管 history SPA 的回退方式。`proxy_pass` 是否保留 `/api/` 前缀受 location 与目标 URI 尾斜杠影响，改配置时必须用真实路径测试，避免请求被悄悄改写。

## 三、限流配置

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
location /api/ {
  limit_req zone=api burst=20 nodelay;
  proxy_pass http://vc_server;
}
```

`rate` 控制平均速率，`burst` 表示可容忍的突发区间；`nodelay` 让突发请求立即处理而非平滑排队。按 IP 限流只是粗粒度防护，移动网络/NAT 下会误伤共享出口，也挡不住分布式来源。登录、搜索、写操作应结合账号、租户、API key 和全局容量分层限流。

## 四、网关 vs K8s Ingress

- **Ingress** 是 Kubernetes API 对 HTTP(S) 入口路由的描述之一，由 Ingress controller 实现；Gateway API 是能力更明确、可扩展的另一条演进路径。
- **API 网关**（Kong / APISIX / Spring Cloud Gateway）在 Ingress 之后，提供更丰富的鉴权/限流/插件/可观测。
- 关系：Ingress 做"到哪"，网关做"怎么管"。小项目 Ingress(Nginx) 够用；复杂 API 治理上专业网关。

## 五、鉴权与 SSL

- 网关统一校验 JWT（`auth_request` 子请求调鉴权服务），通过才转发。
- 公网 TLS 可在入口终止；跨不可信网络、合规或零信任环境继续使用内部 TLS/mTLS。证书用 ACME/托管证书自动续期并监控到期时间。
- 敏感凭证（R2/DB）不进网关配置明文，走 Secret（见 `kubernetes.md`）。

## 六、常见坑

- **没配 SPA fallback**：前端 history 路由刷新 404（见 `frontend-router.md`）。
- **代理头丢失**：忘了 `proxy_set_header Host`，后端拿不到正确 host。
- **限流过严**：正常流量被拒 → `burst` 调大或按业务放宽。
- **单点网关**：网关挂全站瘫 → 网关本身也要高可用（多副本/多 AZ）。

## 七、超时、重试与流式请求

网关的超时必须与客户端和下游逐层收敛：客户端总 deadline 最大，网关为每一跳分配更小预算，下游数据库再更小。若各层都独立重试 3 次，流量会指数放大。

- 默认只对明确安全、幂等且请求体可重放的操作有限重试，并加入退避、抖动和总时限。
- POST 写操作若没有业务幂等键，不应由网关盲目重试。
- SSE/Agent 流式输出要关闭不合适的响应缓冲、延长 read timeout，并确保客户端取消能传到上游。
- WebSocket 需要正确处理 Upgrade/Connection 头、空闲超时和连接数上限。
- 上传接口设置 body 大小、内容类型与速率限制，大文件优先直传对象存储。

网关熔断用于快速失败和保护下游，但阈值应依据服务 SLO；熔断本身不能修复依赖故障，还要配合负载削减、队列与降级响应。

## 八、身份、信任与请求头

只信任由受控入口写入的身份头。网关应先删除客户端伪造的 `X-User-Id`、`X-Roles` 等内部头，再写入经过验证的身份上下文；下游还要验证来源或签名。客户端 IP 也只能从可信代理链解析，不能直接相信任意 `X-Forwarded-For`。

JWT 验证需检查签名、issuer、audience、过期和允许算法，并为 JWKS 缓存设计轮换与失败策略。授权不是“role=admin”一个判断：服务仍需确认用户是否能操作具体 tenant/resource。高风险内部服务可采用服务身份与 mTLS，避免任何能访问内网的人伪造网关流量。

## 九、可观测性与变更治理

入口生成或传播 request/trace ID，记录路由、上游、状态、耗时、重试、限流决策和响应大小；日志脱敏 Authorization、Cookie、query token 与 PII。指标至少包括各路由 QPS、4xx/5xx、P95/P99、upstream connect/read timeout、被限流数和活动连接。

配置变更要做语法校验、影子/预发布验证、渐进 reload 和快速回滚。动态路由与插件也属于生产代码，必须版本化、评审并限制管理面权限。

## 十、架构决策清单

- [ ] 单体/少量服务是否只需反向代理，而不是引入完整网关平台？
- [ ] 路由、认证、授权、限流分别在哪一层负责，是否存在空档或重复？
- [ ] `proxy_pass` 路径改写、客户端 IP 与内部身份头是否有自动化测试？
- [ ] 超时、重试、熔断和总 deadline 是否按调用链统一设计？
- [ ] SSE、WebSocket、上传和大响应是否有单独配置与容量上限？
- [ ] 网关是否多副本跨故障域，配置/证书/JWKS 失败能否回滚？
- [ ] 日志、trace 和指标能否定位到具体路由与上游且不泄密？
- [ ] Kubernetes 场景应使用 Ingress、Gateway API 还是专业 API Gateway，职责是否重叠？

## 十一、小结

- 网关 = 统一入口，集中路由/鉴权/限流/SSL 终止/负载均衡。
- Nginx `upstream` 做负载、`limit_req` 做限流、`try_files` 做 SPA fallback。
- Ingress 管"到哪"、API 网关管"怎么管"；小项目 Nginx 足够。

## 参考来源

- Nginx 官方文档：<https://nginx.org/en/docs/>
- Nginx 限流：<https://nginx.org/en/docs/http/ngx_http_limit_req_module.html>
- Kong 网关：<https://docs.konghq.com/>
- APISIX：<https://apisix.apache.org/docs/>
