---
group: 部署与云原生
order: 2
---

# Kubernetes 入门

> 当单容器不够（要扩容、自愈、灰度发布）时，Kubernetes（K8s）成为编排标准。本文讲清核心对象、与 Docker（见 `docker-deploy.md`）的关系、滚动发布，以及 VueChest 这类前后端如何上 K8s，补云原生视角。

## 一、K8s 解决什么

Docker 解决"单容器怎么跑"；K8s 解决"一堆容器怎么管"：自动调度、扩缩容、自愈（挂了重启）、服务发现、滚动发布、配置/密钥管理。

## 二、核心对象

| 对象                   | 作用                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| **Pod**                | 最小调度单位，含一个或多个共享网络的容器                            |
| **Deployment**         | 管理 Pod 副本数与版本，支撑滚动更新/回滚                            |
| **Service**            | 稳定访问入口，负载均衡到后端 Pod（ClusterIP/NodePort/LoadBalancer） |
| **Ingress**            | 七层路由（域名/路径 → Service），替代 Nginx 反向代理                |
| **ConfigMap / Secret** | 配置 / 密钥，与镜像解耦                                             |
| **Namespace**          | 逻辑隔离（dev/test/prod）                                           |

## 三、与 Docker 的关系

- Docker 构建出**镜像**；K8s 不生产镜像，只调度运行容器（底层容器运行时已从 dockershim 迁到 containerd）。
- Docker Compose 是单机编排；K8s 是集群编排，能力远超。

## 四、Deployment 示例

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: vc-server }
spec:
  replicas: 3
  selector: { matchLabels: { app: vc-server } }
  template:
    metadata: { labels: { app: vc-server } }
    spec:
      containers:
        - name: server
          image: registry/vc-server:1.0.0
          ports: [{ containerPort: 3000 }]
          envFrom:
            - secretRef: { name: vc-secrets } # 密钥外部注入
```

```yaml
apiVersion: v1
kind: Service
metadata: { name: vc-server-svc }
spec:
  selector: { app: vc-server }
  ports: [{ port: 80, targetPort: 3000 }]
```

## 五、滚动发布与回滚

- **滚动更新**：逐步用新 Pod 替换旧 Pod，`maxSurge`/`maxUnavailable` 控制节奏，零停机。
- **回滚**：`kubectl rollout undo deployment/vc-server` 一键回上一版。
- **就绪/存活探针**：`readinessProbe`（能接流量才进 Service）、`livenessProbe`（挂了重启），避免流量打到有问题的 Pod。

## 六、VueChest 上 K8s 的思路

- **前端**：静态产物走 Nginx 镜像（`docker-deploy.md`），Deployment + Service，Ingress 配域名与 `try_files` fallback（见 `frontend-router.md`）。
- **后端**：VueChestServer 多副本 Deployment，Secret 注入 R2/DB 凭证（见项目约定），Service 对内暴露。
- **配置外置**：`ConfigMap` 放环境配置，`Secret` 放密钥，镜像不含敏感信息。
- **弹性**：HPA（Horizontal Pod Autoscaler）按 CPU/QPS 自动扩缩容。

## 七、常见坑

- **镜像 tag 用 `latest`**：K8s 默认不拉新镜像，发布不生效 → 用固定版本号 + `imagePullPolicy: Always` 或显式 digest。
- **探针配错**：就绪探针端口错 → Pod 永远不在 Service；存活探针太严 → 频繁重启。
- **资源没设 limit**：单 Pod 吃满节点，调度失衡 → 设 `resources.requests/limits`。
- **本地开发**：用 kind / minikube 起单节点集群验证 YAML，再上云。

## 八、小结

- K8s 管"一堆容器"：调度/自愈/扩缩/发布。
- 核心：Pod（最小单位）、Deployment（副本+发布）、Service（稳定入口）、Ingress（路由）。
- 滚动更新零停机、Secret 注入密钥；VueChest 前后端各一 Deployment + Ingress 即可。

## 参考来源

- Kubernetes 官方文档：<https://kubernetes.io/docs/home/>
- K8s 概念（Pod/Deployment/Service）：<https://kubernetes.io/docs/concepts/>
- 滚动更新：<https://kubernetes.io/docs/concepts/workloads/controllers/deployment/>
