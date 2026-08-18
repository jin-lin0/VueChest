# API 网关与 Nginx

> 多服务、多端点的系统需要一道"统一门面"：路由、鉴权、限流、SSL。本文讲清 API 网关的职责、Nginx 实战配置，以及与 K8s Ingress（见 `kubernetes.md`）的关系，补运维架构视角（配合 `docker-deploy.md` / `serverless.md`）。

## 一、网关解决什么

没有网关时，客户端直连各微服务：地址散、鉴权重复、难限流、难观测。网关作为**统一入口**，集中处理横切关注点：

- **路由**：按路径/域名转发到后端服务。
- **反向代理**：隐藏真实后端，客户端只认网关。
- **负载均衡**：把请求分摊到多实例。
- **鉴权**：统一校验 Token/API Key，后端免各自实现。
- **限流**：防刷、保护后端（见 `redis-cache.md` 的限流思路）。
- **SSL 终止**：在网关卸 TLS，后端走内网明文，省 CPU。

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
    proxy_set_header X-Real-IP $remote_addr;
  }
  location / { try_files $uri $uri/ /index.html; } # SPA fallback
}
```

> `try_files` 是 history 模式 SPA 必备（见 `frontend-router.md`）；`upstream` 块即负载均衡。

## 三、限流配置

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
location /api/ {
  limit_req zone=api burst=20 nodelay;
  proxy_pass http://vc_server;
}
```

`rate` 限制速率、`burst` 允许突发排队，防单 IP 打爆后端。

## 四、网关 vs K8s Ingress

- **Ingress** 是 K8s 的七层路由（域名/路径 → Service），常由 Nginx/云 LB 实现，偏"流量入口"。
- **API 网关**（Kong / APISIX / Spring Cloud Gateway）在 Ingress 之后，提供更丰富的鉴权/限流/插件/可观测。
- 关系：Ingress 做"到哪"，网关做"怎么管"。小项目 Ingress(Nginx) 够用；复杂 API 治理上专业网关。

## 五、鉴权与 SSL

- 网关统一校验 JWT（`auth_request` 子请求调鉴权服务），通过才转发。
- SSL 终止在网关，后端内网用 HTTP（或 mTLS 加强）；证书用 ACME 自动续期。
- 敏感凭证（R2/DB）不进网关配置明文，走 Secret（见 `kubernetes.md`）。

## 六、常见坑

- **没配 SPA fallback**：前端 history 路由刷新 404（见 `frontend-router.md`）。
- **代理头丢失**：忘了 `proxy_set_header Host`，后端拿不到正确 host。
- **限流过严**：正常流量被拒 → `burst` 调大或按业务放宽。
- **单点网关**：网关挂全站瘫 → 网关本身也要高可用（多副本/多 AZ）。

## 七、小结

- 网关 = 统一入口，集中路由/鉴权/限流/SSL 终止/负载均衡。
- Nginx `upstream` 做负载、`limit_req` 做限流、`try_files` 做 SPA fallback。
- Ingress 管"到哪"、API 网关管"怎么管"；小项目 Nginx 足够。

## 参考来源

- Nginx 官方文档：<https://nginx.org/en/docs/>
- Nginx 限流：<https://nginx.org/en/docs/http/ngx_http_limit_req_module.html>
- Kong 网关：<https://docs.konghq.com/>
- APISIX：<https://apisix.apache.org/docs/>
