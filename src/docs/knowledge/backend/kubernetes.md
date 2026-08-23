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
| **Ingress / Gateway**  | 声明七层入口路由，由 controller/实现真正代理流量                    |
| **ConfigMap / Secret** | 非敏感配置 / 敏感数据对象，与镜像解耦                               |
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
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  selector: { matchLabels: { app: vc-server } }
  template:
    metadata: { labels: { app: vc-server } }
    spec:
      containers:
        - name: server
          image: registry/vc-server@sha256:REPLACE_WITH_REAL_DIGEST
          ports: [{ containerPort: 3000 }]
          envFrom:
            - secretRef: { name: vc-secrets } # 密钥外部注入
          readinessProbe:
            httpGet: { path: /readyz, port: 3000 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /livez, port: 3000 }
            periodSeconds: 10
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { memory: 512Mi }
          securityContext:
            runAsNonRoot: true
            allowPrivilegeEscalation: false
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

- **滚动更新**：逐步用新 Pod 替换旧 Pod，`maxSurge`/`maxUnavailable` 控制节奏。只有容量、readiness、连接摘除和版本兼容都正确时才可能无感。
- **回滚**：`kubectl rollout undo` 可以回到保留的 Deployment revision，但不能自动回滚数据库、消息 schema、外部副作用或已删除配置。
- **就绪/存活探针**：`readinessProbe`（能接流量才进 Service）、`livenessProbe`（挂了重启），避免流量打到有问题的 Pod。

## 六、VueChest 上 K8s 的思路

- **前端**：静态产物走 Nginx 镜像（`docker-deploy.md`），Deployment + Service，Ingress 配域名与 `try_files` fallback（见 `frontend-router.md`）。
- **后端**：VueChestServer 多副本 Deployment，Secret 注入 R2/DB 凭证（见项目约定），Service 对内暴露。
- **配置外置**：`ConfigMap` 放环境配置，`Secret` 放密钥，镜像不含敏感信息。
- **弹性**：HPA 可按 CPU/内存和已接入的自定义/外部指标扩缩；QPS 不是默认就有，且扩容受镜像拉取、启动时间与下游容量约束。

## 七、常见坑

- **镜像 tag 可变**：同一 tag 指向不同内容，审计与回滚不可复现 → 生产优先不可变 tag 并记录 digest，关键环境直接用 digest。
- **探针配错**：就绪探针端口错 → Pod 永远不在 Service；存活探针太严 → 频繁重启。
- **资源没设 limit**：单 Pod 吃满节点，调度失衡 → 设 `resources.requests/limits`。
- **本地开发**：用 kind / minikube 起单节点集群验证 YAML，再上云。

## 八、调度、容量与可用性

`requests` 是调度和部分弹性计算依据，`limits` 是运行时上限；CPU limit 可能造成 throttling，内存超限会 OOMKill。先基于负载测试和历史指标设 request，再用 VPA 建议或持续观察调整，不能所有服务复制相同数值。

高可用不只看 `replicas: 3`：三个 Pod 可能被调度到同一节点/可用区。使用 topology spread constraints 或 anti-affinity 分散故障域，结合 PodDisruptionBudget 控制自愿中断期间的可用副本；同时保证节点池和依赖服务跨故障域。

优雅终止顺序是 readiness 先摘流量、应用收到 SIGTERM 停止接新请求、在 `terminationGracePeriodSeconds` 内完成/取消任务。长连接、队列 consumer 和 Agent 流式请求需要单独验证，不能只测短 HTTP。

## 九、配置、密钥与权限

Kubernetes Secret 的值通常只是 base64 编码，是否静态加密取决于集群配置。启用 etcd encryption at rest、RBAC 最小权限、审计，并考虑外部 Secret Manager/CSI；不要让所有 namespace 的默认 ServiceAccount 都能读 secrets。

ConfigMap/Secret 更新不会保证所有进程自动重载；环境变量需要重建 Pod，volume 更新也要应用支持 reload。发布应把配置版本纳入变更记录，避免新 Pod 与旧配置组合不可复现。

Pod Security Standards、NetworkPolicy、只读 root filesystem、seccomp 和最小 capabilities 共同缩小攻击面。NetworkPolicy 只有网络插件支持并真正实施时才有效。

## 十、存储与有状态工作负载

Deployment 适合无状态副本；数据库、队列等通常涉及 StatefulSet、PersistentVolume、稳定身份和专门备份/恢复。把 MySQL YAML 跑起来不等于具备生产数据库能力，托管数据库往往更合适。

PVC 只提供持久卷，不等于备份。必须测试 volume/zone 故障、快照一致性、恢复时长和跨集群灾备。应用上传应优先对象存储，避免请求落到不同 Pod 看不到本地文件。

## 十一、可观测性与排障

排障按层次：Deployment rollout/ReplicaSet → Pod phase/events → readiness/restarts → container logs → Service endpoints → Ingress/Gateway → NetworkPolicy/DNS。`kubectl describe` 的 events 往往比反复删 Pod 更能解释 Pending、ImagePullBackOff 和探针失败。

监控期望/可用副本、重启/OOM、调度失败、CPU throttling、内存、HPA、节点压力、API server 与 ingress 指标。集群组件健康不代表业务 SLO，必须与请求错误、延迟和核心任务成功率关联。

## 十二、架构决策清单

- [ ] 当前规模是否真的需要 Kubernetes，托管容器/Serverless 是否更简单？
- [ ] 镜像是否不可变、可验证，配置/Secret 版本是否可追溯？
- [ ] readiness/liveness/startup 与 graceful shutdown 是否按故障语义设计？
- [ ] requests/limits/HPA 是否由压测和下游容量驱动？
- [ ] 副本是否跨节点/区域，PDB 与节点维护是否演练？
- [ ] RBAC、Secret 加密、NetworkPolicy 与 Pod Security 是否实际生效？
- [ ] 数据迁移、消息 schema 与新旧 Pod 共存是否向后兼容？
- [ ] rollout 卡住、节点故障、依赖故障与集群灾难是否能恢复？

## 十三、小结

- K8s 管"一堆容器"：调度/自愈/扩缩/发布。
- 核心：Pod（最小单位）、Deployment（副本+发布）、Service（稳定入口）、Ingress（路由）。
- 滚动更新零停机、Secret 注入密钥；VueChest 前后端各一 Deployment + Ingress 即可。

## 参考来源

- Kubernetes 官方文档：<https://kubernetes.io/docs/home/>
- K8s 概念（Pod/Deployment/Service）：<https://kubernetes.io/docs/concepts/>
- 滚动更新：<https://kubernetes.io/docs/concepts/workloads/controllers/deployment/>
- Kubernetes Secrets：<https://kubernetes.io/docs/concepts/configuration/secret/>
- Pod Security Standards：<https://kubernetes.io/docs/concepts/security/pod-security-standards/>
