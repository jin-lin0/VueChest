# 可观测性与链路追踪

> 系统上线后才出问题？可观测性让你"看得见"运行状态。本文讲清日志/指标/链路三大支柱、OpenTelemetry 标准，以及和前端监控（见 `frontend-monitoring.md`）如何打通，补全栈观测视角（配合 `agent.md` 的 Agent 可观测性）。

## 一、可观测性三支柱

| 支柱 | 回答 | 工具 |
| --- | --- | --- |
| **Logs（日志）** | 发生了什么（离散事件） | ELK / Loki |
| **Metrics（指标）** | 系统健康度（聚合数值） | Prometheus / Grafana |
| **Traces（链路）** | 一次请求经过了哪些服务/耗时 | Jaeger / Tempo |

三者互补：指标发现"慢了"，链路定位"哪段慢"，日志查明"为什么慢"。

## 二、Metrics：Prometheus 模型

- 拉模型：Prometheus 定时从 `/metrics` 抓取；指标类型：`Counter`（累计）、`Gauge`（瞬时）、`Histogram`（分位数，如 P99 延迟）、`Summary`。
- 关键 SLO 指标：错误率、延迟（P99）、饱和度（CPU/队列）、流量（QPS）。
- Grafana 做可视化与告警。

```prometheus
# 示例：HTTP 请求数（Counter）
http_requests_total{path="/api/chat",status="200"} 1234
```

## 三、Traces：一次请求的全景

分布式链路追踪用 **TraceID** 串起一次请求跨服务的所有 span：

```
请求 → [网关 span] → [API span] → [DB span]
                       └→ [Cache span]
```

- 每个 span 记录起止时间、服务、操作、状态。
- 跨服务传递靠 `W3C Trace Context`（HTTP header `traceparent`）。
- 前端到后端的全链路：前端在请求头注入/透传 TraceID，后端续接（前后端观测打通）。

## 四、OpenTelemetry（OTel）

- **厂商中立的观测标准**：一套 SDK 采集 traces/metrics/logs，导出到任意后端（Jaeger/Prometheus/商业 APM）。
- 价值：不被某家 APM 锁定；前后端、多语言统一语义。
- 自动埋点 + 手动埋点结合；Agent 类应用（见 `agent.md`）尤其需要 trace 看清"思考过程"与工具调用。

## 五、与前端监控的衔接

- 前端错误/Web Vitals（见 `frontend-monitoring.md`）是"用户侧"指标；后端 metrics/traces 是"服务侧"。
- 同一用户操作，前端报错 + 后端 trace 用同一 `TraceID`/`userId` 关联，定位"用户看到的慢是哪段服务导致的"。
- 告警分级：P0 全站错误率飙升 → 自动触发回滚（见 `release-strategy.md`）。

## 六、常见坑

- **只打日志不建指标**：海量日志难聚合，无法快速判断趋势 → 补 metrics。
- **链路断点**：跨服务没传 TraceID → 串不起来，务必统一透传。
- **采样不当**：全量 trace 成本高，生产按头采样（如 10%）+ 错误全采。
- **告警疲劳**：阈值太敏 → 一直响没人看；按 SLO 设错误预算。

## 七、小结

- 三大支柱：Logs（什么）、Metrics（多健康）、Traces（经过哪）。
- OpenTelemetry 统一采集、避免锁定；TraceID 串起跨服务调用。
- 前端监控 + 后端 trace 用统一 ID 关联，告警驱动回滚。

## 参考来源

- OpenTelemetry 文档：<https://opentelemetry.io/docs/>
- Prometheus 文档：<https://prometheus.io/docs/>
- W3C Trace Context：<https://www.w3.org/TR/trace-context/>
