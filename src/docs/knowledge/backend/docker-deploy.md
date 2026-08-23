---
group: 部署与云原生
order: 1
---

# Docker 容器化部署

> 前端（Vue/Vite）和 Node 后端（VueChestServer）要稳定上线，容器化是当下最省心的交付方式。本文讲清镜像/容器概念、多阶段构建、前端静态托管 + 后端服务编排，以及常见部署坑，对应 VueChest 全栈栈。

## 一、镜像 vs 容器

- **镜像（Image）**：内容寻址的只读层与元数据，包含应用运行所需文件。可重复运行仍受 CPU 架构、宿主内核、运行时和外部依赖约束。
- **容器（Container）**：镜像的运行实例，带可写层，互相隔离。一个镜像可起多个容器。

> 类比：镜像 = 类（class），容器 = 实例（instance）。

## 二、前端多阶段构建（Vue + Nginx）

```dockerfile
# 阶段1：构建；Node 版本应与项目 CI 锁定值一致
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

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

> 多阶段构建不把构建工具和源码 COPY 到最终层，但构建产物仍可能包含 source map、内嵌环境变量或许可证信息，发布前要单独审计。

## 三、Node 后端镜像

```dockerfile
FROM node:20-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --chown=node:node . .
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "server.js"]
```

要点：项目使用 pnpm 时复制 lockfile 并执行 `--frozen-lockfile`，不能在文档里换成 npm 后假设依赖仍一致。最终镜像以非 root 用户运行；若有原生依赖，Alpine/musl 与 glibc 的兼容性要在构建平台验证。

## 四、docker-compose 编排前后端 + 依赖

```yaml
# docker-compose.yml
services:
  web:
    build: ./VueChest
    ports: ['8080:80']
  server:
    build: ./VueChestServer
    ports: ['3000:3000']
    environment:
      - DATABASE_URL=mysql://...
      - REDIS_URL=redis://redis:6379
    depends_on:
      mysql: { condition: service_healthy }
      redis: { condition: service_healthy }
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql_root_password
    secrets: [mysql_root_password]
    healthcheck:
      test: ['CMD-SHELL', 'mysqladmin ping -h localhost -p$$(cat /run/secrets/mysql_root_password)']
      interval: 5s
      timeout: 3s
      retries: 20
  redis:
    image: redis:7
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 20

secrets:
  mysql_root_password:
    file: ./secrets/mysql_root_password.txt # 本地文件也必须排除出 Git
```

Compose 很适合复现本地依赖拓扑，但不等于生产环境完全一致：TLS、云网络、托管数据库、容量和故障域仍不同。`depends_on` 只有配合健康条件才等待依赖就绪，应用本身仍要对数据库启动慢和重连做退避。

## 五、关键实践

- **.dockerignore**：排除 `node_modules`、`.git`、`.env`，加速构建、防泄露。
- **环境变量/Secrets**：密钥通过运行平台的 Secret/File 注入；普通 `.env` 只是配置便利，不是密钥管理系统。
- **健康检查**：`HEALTHCHECK` 暴露健康状态；是否自动重启由编排平台策略决定，Docker 本身不会仅因 unhealthy 自动重启容器。
- **日志**：容器 stdout/stderr 由编排器收集，别写本地文件。

## 六、部署形态

| 形态                  | 说明                   |
| --------------------- | ---------------------- |
| 云服务器 + Docker     | 自建，灵活             |
| 容器服务（K8s/托管）  | 自动扩缩容、滚动发布   |
| 静态托管 + Serverless | 前端扔 CDN，后端函数化 |

> VueChest 前端是纯静态，最适合 CDN/对象存储（R2）+ 边缘；后端 Node 用容器或 Serverless。CloudStudio 等也可直接部署静态产物。

## 七、常见坑

- **history 模式没配 fallback** → 刷新 404（见 `frontend-router.md`）。
- **把 .env 打进镜像** → 密钥泄露；用外部注入。
- **时区假设** → 服务端存 UTC，展示层转换；不要靠挂宿主 `/etc/localtime` 让不同环境产生隐式差异。
- **没设资源限制** → 单容器吃满宿主内存拖垮全局；用 `--memory` 限制。

## 八、可复现构建与供应链

镜像 tag 可变，部署应记录不可变 digest。CI 使用固定 Node/pnpm、lockfile 和受控基础镜像，开启 BuildKit cache 但不能让缓存掩盖依赖变化。发布链路建议生成 SBOM、扫描 OS/npm 漏洞、签名镜像并验证来源；扫描结果按可利用性与修复时限治理，不是看到 CVE 数量就阻塞所有构建。

多架构镜像要分别验证原生模块和浏览器依赖，不能只构建 manifest。基础镜像更新与应用发布解耦，定期重建以获得安全补丁；仅重启旧镜像不会自动包含新层。

构建参数与前端 `VITE_*` 会被固化进 JS 包，绝不能传 secret。后端 secret 只在运行时注入，并限制容器、CI 和运维人员的读取权限。

## 九、运行时可靠性

容器内应用应作为 PID 1 正确处理 `SIGTERM`：停止接新流量、等待进行中请求、关闭队列消费者和数据库连接，在终止宽限期内退出。使用 exec-form `CMD` 有助于信号直达 Node；不要用 shell 包裹导致信号丢失。

健康接口分层设计：liveness 只判断进程是否卡死，readiness 判断能否接新流量，startup 为慢启动留窗口。把所有下游依赖都塞进 liveness 会在数据库抖动时重启全部应用，放大故障。

文件系统默认临时，可写数据、上传和日志不要只留在容器层。root filesystem 可设只读，并为必要临时目录挂载受限 volume；同时移除多余 Linux capabilities、禁止提权并限制 CPU/内存/PID。

## 十、镜像验证与发布检查清单

- [ ] package manager、lockfile、Node 与基础镜像是否与 CI/项目约定一致？
- [ ] 最终镜像是否不含源码、dev dependency、`.env`、私钥和非必要 source map？
- [ ] 是否以 digest 部署，并保留 SBOM、签名、扫描与构建来源？
- [ ] 应用是否非 root、只读文件系统、最小 capability，并设置资源限制？
- [ ] SIGTERM、readiness、liveness、startup 与终止宽限期是否故障演练？
- [ ] 数据、上传、日志和密钥是否都在容器可写层之外？
- [ ] amd64/arm64、Alpine/musl 与原生模块是否在目标平台验证？
- [ ] 发布失败能否快速回到上一不可变镜像，数据库变更是否向后兼容？

## 十一、小结

- 镜像=模板、容器=实例；多阶段构建产出最小镜像。
- 前端 Nginx + `try_files` fallback；后端 `npm ci --omit=dev` + 非 root。
- compose 一键起全栈；密钥外部注入、加 `.dockerignore` 与健康检查。

## 参考来源

- Docker 官方文档：<https://docs.docker.com/>
- Dockerfile 最佳实践：<https://docs.docker.com/develop/dev-best-practices/>
- Nginx SPA fallback：<https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files>
