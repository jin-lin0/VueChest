# Docker 容器化部署

> 前端（Vue/Vite）和 Node 后端（VueChestServer）要稳定上线，容器化是当下最省心的交付方式。本文讲清镜像/容器概念、多阶段构建、前端静态托管 + 后端服务编排，以及常见部署坑，对应 VueChest 全栈栈。

## 一、镜像 vs 容器

- **镜像（Image）**：只读模板，包含运行所需的一切（代码、依赖、运行时、环境）。一次构建，处处运行。
- **容器（Container）**：镜像的运行实例，带可写层，互相隔离。一个镜像可起多个容器。

> 类比：镜像 = 类（class），容器 = 实例（instance）。

## 二、前端多阶段构建（Vue + Nginx）

```dockerfile
# 阶段1：构建
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build   # 产物在 dist/

# 阶段2：用 Nginx 托管静态文件
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback：所有未知路径返回 index.html（见 frontend-router.md）
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

```nginx
# nginx.conf —— history 模式必须配
location / { try_files $uri $uri/ /index.html; }
```

> 多阶段构建让最终镜像只剩 Nginx + 静态文件，体积小、无源码泄露。

## 三、Node 后端镜像

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

要点：`npm ci` 比 `npm install` 更快更确定；`--omit=dev` 去掉开发依赖；非 root 用户运行更安全（加 `USER node`）。

## 四、docker-compose 编排前后端 + 依赖

```yaml
# docker-compose.yml
services:
  web:
    build: ./VueChest
    ports: ["8080:80"]
  server:
    build: ./VueChestServer
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=mysql://...
      - REDIS_URL=redis://redis:6379
    depends_on: [mysql, redis]
  mysql:
    image: mysql:8
    environment: { MYSQL_ROOT_PASSWORD: "***" }
  redis:
    image: redis:7
```

一条 `docker compose up` 起整套环境，本地与生产一致，杜绝"我机器能跑"。

## 五、关键实践

- **.dockerignore**：排除 `node_modules`、`.git`、`.env`，加速构建、防泄露。
- **环境变量**：密钥走 `-e` / `.env`（不进镜像），R2/DB 凭证（见项目约定）务必外部注入。
- **健康检查**：`HEALTHCHECK` 探测 `/healthz`，编排器自动重启异常实例。
- **日志**：容器 stdout/stderr 由编排器收集，别写本地文件。

## 六、部署形态

| 形态 | 说明 |
| --- | --- |
| 云服务器 + Docker | 自建，灵活 |
| 容器服务（K8s/托管） | 自动扩缩容、滚动发布 |
| 静态托管 + Serverless | 前端扔 CDN，后端函数化 |

> VueChest 前端是纯静态，最适合 CDN/对象存储（R2）+ 边缘；后端 Node 用容器或 Serverless。CloudStudio 等也可直接部署静态产物。

## 七、常见坑

- **history 模式没配 fallback** → 刷新 404（见 `frontend-router.md`）。
- **把 .env 打进镜像** → 密钥泄露；用外部注入。
- **容器时区不对** → 显式设 `TZ` 或挂载 `/etc/localtime`。
- **没设资源限制** → 单容器吃满宿主内存拖垮全局；用 `--memory` 限制。

## 八、小结

- 镜像=模板、容器=实例；多阶段构建产出最小镜像。
- 前端 Nginx + `try_files` fallback；后端 `npm ci --omit=dev` + 非 root。
- compose 一键起全栈；密钥外部注入、加 `.dockerignore` 与健康检查。

## 参考来源

- Docker 官方文档：<https://docs.docker.com/>
- Dockerfile 最佳实践：<https://docs.docker.com/develop/dev-best-practices/>
- Nginx SPA fallback：<https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files>
