---
group: 可靠性与可观测
order: 2
---

# 可观测性与链路追踪

> 系统上线后才出问题？可观测性让你"看得见"运行状态。本文讲清日志/指标/链路三大支柱、OpenTelemetry 标准，以及和前端监控（见 `frontend-monitoring.md`）如何打通，补全栈观测视角（配合 `agent.md` 的 Agent 可观测性）。

## 一、可观测性三支柱

| 支柱                | 回答                        | 工具                 |
| ------------------- | --------------------------- | -------------------- |
| **Logs（日志）**    | 发生了什么（离散事件）      | ELK / Loki           |
| **Metrics（指标）** | 系统健康度（聚合数值）      | Prometheus / Grafana |
| **Traces（链路）**  | 一次请求经过了哪些服务/耗时 | Jaeger / Tempo       |

三者互补：指标发现"慢了"，链路定位"哪段慢"，日志查明"为什么慢"。

## 二、Metrics：Prometheus 模型

- 拉模型：Prometheus 定时从 `/metrics` 抓取；指标类型包括 `Counter`、`Gauge`、`Histogram`、`Summary`。Histogram 记录 bucket，可在服务端聚合后估算分位数；Summary 通常在客户端计算 quantile，跨实例聚合受限。
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
- 前端到后端的全链路：浏览器 SDK 按 W3C Trace Context 注入受控 `traceparent`，后端继续 span；跨域需允许相应 header。服务端仍要限制不可信 baggage，并可为安全边界创建新 trace/link。

## 四、OpenTelemetry（OTel）

- **厂商中立的观测标准**：一套 SDK 采集 traces/metrics/logs，导出到任意后端（Jaeger/Prometheus/商业 APM）。
- 价值：不被某家 APM 锁定；前后端、多语言统一语义。
- 自动埋点覆盖 HTTP/数据库等通用库，手动 span 描述业务阶段。Agent 应记录模型/工具/状态事件、证据与策略结果，不依赖或持久化隐藏思维链。

## 五、与前端监控的衔接

- 前端错误/Web Vitals（见 `frontend-monitoring.md`）是"用户侧"指标；后端 metrics/traces 是"服务侧"。
- 同一用户操作可用 trace/span ID 或短期 request ID 关联前后端。稳定 user ID 属于敏感高基数字段，不应直接做 metric label；在受控日志/trace 中也要散列、脱敏和限制访问。
- 告警分级：P0 全站错误率飙升 → 自动触发回滚（见 `release-strategy.md`）。

## 六、常见坑

- **只打日志不建指标**：海量日志难聚合，无法快速判断趋势 → 补 metrics。
- **链路断点**：跨服务没传 TraceID → 串不起来，务必统一透传。
- **采样不当**：纯 head sampling 在请求开始时还不知道最终是否错误；要保留“错误全采”通常需 Collector tail sampling、明确强制采样信号或错误日志到 trace 的关联。
- **告警疲劳**：阈值太敏 → 一直响没人看；按 SLO 设错误预算。

## 七、SLI、SLO 与错误预算

先从用户可感知目标定义 SLI：请求成功率、任务完成率、延迟分布、数据新鲜度等。SLO 是一个窗口内的目标，例如“28 天内 99.9% 合格请求成功”，错误预算是允许的不合格比例。它用于平衡发布速度和可靠性，不是给个人绩效打分。

可用性分母要排除哪些请求必须写清：客户端参数错误是否算、健康检查是否算、部分降级是否成功。延迟 SLI 应统计成功且有效的请求，并按关键 endpoint/任务分组。只看服务器 5xx 会漏掉返回 200 但业务失败的情况。

告警采用 burn rate 观察错误预算消耗速度，短窗口捕捉快速事故，长窗口避免噪声。每个告警都要有 owner、runbook、影响说明和可执行动作；无动作的图表不是告警。

## 八、语义、基数与隐私

指标 label 必须是有界集合，例如 route template、method、status class；不能放完整 URL、user ID、request ID、SQL 或 prompt。高基数会让 Prometheus/后端内存与费用失控。具体请求细节放 trace/log，通过 exemplar 或 trace ID 关联。

日志使用结构化字段和稳定错误码，异常堆栈保留在受控后端，面向用户只返回追踪编号。Authorization、Cookie、密钥、PII、模型 prompt/tool result 默认不记录或按字段脱敏；“为了排障全量记录”会制造新的数据泄露面。

OTel semantic conventions 能统一 HTTP、数据库和 RPC 命名，但自动埋点升级可能改变属性。仪表盘和告警要跟 SDK/collector 版本一起回归。

## 九、Collector 与采样架构

应用把 OTLP 数据发送给本地/网关 Collector，由 Collector 做批处理、内存限制、重试、过滤、脱敏、tail sampling 和多后端导出。Collector 是可观测链路的关键依赖，需要自身指标、队列持久化取舍和容量规划；后端故障时不能无限缓存拖垮业务节点。

采样策略按风险分层：保留错误、慢请求、特定关键业务与稀有属性，对大量健康流量概率采样。采样决策要在跨服务传播，否则父 span 被丢、子服务全采会造成残缺和成本不可控。

Metrics、logs、traces 的保留期不同：指标保留趋势，trace 适合样本级诊断，日志满足审计/排障。用查询频率和合规要求制定热/冷存储，而不是所有遥测永久保存。

## 十、排障方法

收到“接口慢”告警时：先确认 SLI/受影响范围 → 按版本、区域、租户类型和 route 切片 → 从 exemplar/trace 找慢 span → 查对应结构化日志与下游指标 → 与最近发布/配置变更对齐 → 验证修复。不要从随机日志关键词开始漫游。

可观测性也要测试：在预发布注入 500、慢 SQL、队列积压和 trace header 丢失，验证指标出现、告警触发、runbook 有效且 trace 连贯。没有演练的面板常在真正事故时才发现字段为空。

## 十一、常见坑补充

- **Histogram bucket 不匹配 SLO**：无法准确估算关键延迟阈值，只能重发新指标。
- **metric label 放用户/URL**：基数爆炸导致观测系统先于业务故障。
- **只装自动埋点**：能看到 HTTP 慢，却不知道业务处于哪个阶段。
- **前端自造可信身份 baggage**：攻击者可污染 trace 或日志，后端必须校验/清理。
- **Collector 无背压上限**：导出端故障把业务节点内存耗尽。
- **只保留成功 trace 样本**：事故与长尾恰好被 head sampling 丢弃。

## 十二、落地决策清单

- [ ] 是否从用户旅程定义 SLI/SLO，而不只是 CPU 和 5xx？
- [ ] metric 名称、单位、route 与 label 基数是否有规范和测试？
- [ ] trace context 是否跨浏览器、网关、队列和 worker 正确传播？
- [ ] 日志/trace 是否默认脱敏，敏感 Agent 数据是否有独立策略？
- [ ] head/tail sampling 是否满足错误、慢请求与成本目标？
- [ ] Collector 故障、队列上限、重试与多后端导出是否压测？
- [ ] 每个高优告警是否有 owner、runbook、阈值依据和演练？
- [ ] 发布是否带版本标记，能否在一次查询中关联指标、trace、日志与变更？

## 十三、小结

- 三大支柱：Logs（什么）、Metrics（多健康）、Traces（经过哪）。
- OpenTelemetry 统一采集、避免锁定；TraceID 串起跨服务调用。
- 前端监控 + 后端 trace 用统一 ID 关联，告警驱动回滚。

## 参考来源

- OpenTelemetry 文档：<https://opentelemetry.io/docs/>
- Prometheus 文档：<https://prometheus.io/docs/>
- W3C Trace Context：<https://www.w3.org/TR/trace-context/>
- Google SRE Workbook — Alerting on SLOs：<https://sre.google/workbook/alerting-on-slos/>
- OpenTelemetry Sampling：<https://opentelemetry.io/docs/concepts/sampling/>
