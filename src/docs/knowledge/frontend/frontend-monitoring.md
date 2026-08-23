---
group: 性能与监控
order: 22
---

# 前端监控与埋点

> 适用场景：线上出问题能告警、能定位、能看真实性能。本文讲错误监控、性能监控（Web Vitals）、埋点、Source Map、告警。
> 阅读前提：浏览器渲染（见 `browser-rendering`）、HTTP（见 `http-network`）。

「本地能跑」≠「线上没问题」。监控让你看到真实用户的报错与卡顿，把「用户投诉才知道」变成「告警先于投诉」。

## 一、错误监控

```ts
// 1) 全局 JS 错误
window.addEventListener('error', (e) =>
  report({ type: 'js', msg: e.message, stack: e.error?.stack }),
)
// 2) 未捕获 Promise 拒绝
window.addEventListener('unhandledrejection', (e) =>
  report({ type: 'promise', msg: String(e.reason) }),
)
// 3) Vue 错误
import { createApp } from 'vue'
app.config.errorHandler = (err, instance, info) => report({ type: 'vue', msg: err.message, info })
// 4) 资源加载失败（img/script 加载不出）
window.addEventListener(
  'error',
  (e) => {
    if (e.target !== window) report({ type: 'asset', src: e.target.src })
  },
  true,
)
```

> 监控要**全量捕获**：全局 error + unhandledrejection + 框架 errorHandler + 资源错误（capture 阶段）。上报时带 `userId / 路由 / UA / 版本号`，便于复现。

## 二、性能监控（Web Vitals）

核心指标（Google 定义）：

- **LCP**（最大内容绘制）：加载性能，<2.5s 优。
- **CLS**（累积布局偏移）：视觉稳定，<0.1 优。
- **INP**（交互到下次绘制，取代 FID）：交互响应，<200ms 优。
- **FCP / TTFB**：首屏/首字节。

```ts
import { onLCP, onCLS, onINP } from 'web-vitals'
onLCP((m) => report('lcp', m.value))
onCLS((m) => report('cls', m.value))
onINP((m) => report('inp', m.value))
```

> 优先盯 **第 75 百分位**用户（而非平均值），长尾体验才是真问题。与 `perf-frontend` / `browser-rendering` 协同：指标差 → 定位是网络/渲染/脚本 → 优化。

## 三、埋点（行为分析）

- **PV/UV**：页面访问量、独立访客。
- **埋点事件**：按钮点击、功能使用、停留时长。

```ts
track('click', { btn: 'publish', appId: 123 }) // 业务埋点
```

- 上报方式：1x1 图片（`<img src>` 最稳，不受 CORS 限）、`navigator.sendBeacon`（页面卸载也能发）、`fetch`。
- 注意：埋点别影响主流程；用 `sendBeacon` 或队列异步发，失败不阻塞用户。

## 四、Source Map 与错误还原

- 生产代码被压缩混淆，报错堆栈是 `app.a1b2.js:1:999` 看不懂。
- 构建时生成 `.map` 文件（见 `vite` 的 `build.sourcemap`），**map 文件别公开托管**（泄露源码）；传到错误监控平台做「反解」。
- 平台（Sentry 等）拿到 map 后把混淆堆栈还原成源码位置，定位到具体文件行号。

## 五、告警与分级

- **错误率突增**（如某版本上线后 5xx/JS 错翻倍）→ 立即告警。
- **性能指标劣化**（LCP 中位数升 30%）→ 预警。
- **关键路径失败**（支付/发布接口错）→ 高优。
- 分级：P0 阻断（页面白屏）→ 电话；P1 功能受损 → 群消息；P2 体验 → 日报。

## 六、隐私与合规

- 不上报 PII（手机号/身份证/ token）；必要字段脱敏（见 `agent-security` 思路）。
- 遵守合规（如 GDPR/个保法）：用户授权后再采集，提供退出机制。

## 七、事件模型、关联与采样

每条错误或性能事件至少包含：事件 ID、时间、应用版本、路由、环境、匿名会话 ID、设备/网络概况和 trace/request ID。版本号用于判断是否只影响新发布，trace ID 用于把前端错误与网关、后端和数据库链路关联。标签必须低基数；不要把完整 URL、用户输入或随机 ID 当成指标 label，否则会导致成本和查询性能失控。

高流量站点通常要采样，但关键错误不能与普通性能样本使用同一比例。可对正常 trace 概率采样，对异常、关键交易和慢请求提高保留率；采样决策和采样率也要随事件上报，聚合时才能正确解释。浏览器端 OpenTelemetry 能生成 trace，但其浏览器 instrumentation 仍有实验性部分，选型前要确认兼容性和数据量。

```ts
interface TelemetryEvent {
  eventId: string
  release: string
  route: string
  traceId?: string
  level: 'info' | 'warning' | 'error'
  sampleRate: number
  context: Record<string, string | number | boolean>
}

function scrub(event: TelemetryEvent): TelemetryEvent {
  const { token: _token, password: _password, ...safe } = event.context
  return { ...event, context: safe }
}
```

## 八、常见坑与排障

- **错误被重复上报**：框架 handler、window error 和请求拦截器可能捕获同一异常。用事件指纹、cause 链和短时间窗口去重。
- **只收 message 不收上下文**：没有 release、路由、操作轨迹和 sourcemap，海量 `TypeError` 仍无法定位。
- **公开 Source Map**：可以生成 hidden sourcemap 并只上传监控平台；上传成功后不把 `.map` 部署到公网。
- **监控 SDK 影响主流程**：初始化失败、上报失败和队列爆满都必须降级；批量发送、限制 payload，并在低端设备测量 SDK 开销。
- **把平均值当用户体验**：性能按 P50/P75/P95、设备和路由分组；错误同时看受影响用户数与事件数。
- **记录敏感数据**：URL 查询、请求 body、DOM 录制和 breadcrumb 都要经过 allowlist 脱敏，不能依赖事后清洗。

## 九、从告警到闭环

告警要描述“谁受影响、从何时开始、相对基线变化、可能版本”，并链接到看板和 runbook。处理流程是确认影响面、关联发布、止血/回滚、定位根因、补测试和监控，最后记录恢复时间。每个告警都应有 owner，并通过静默窗口和聚合避免同一故障刷屏。

## 十、上线检查清单

- [ ] release、environment、route、trace ID 等上下文可关联
- [ ] 错误去重、采样、批量、重试和离线队列有上限
- [ ] Source Map 私有上传且与 release 精确匹配
- [ ] PII 使用 allowlist 采集并支持用户同意/退出
- [ ] Web Vitals 按页面、设备和 P75 聚合，关键操作有业务成功率
- [ ] 告警有阈值、owner、runbook、恢复通知和复盘入口

## 十一、落地清单

- [ ] 全局 error / unhandledrejection / 资源错误 全捕获
- [ ] Vue errorHandler 接入
- [ ] Web Vitals 采集（LCP/CLS/INP，盯 P75）
- [ ] 业务埋点（点击/功能/时长），异步上报不阻塞
- [ ] Source Map 上传监控平台，源码不公开
- [ ] 错误率/性能突增告警分级

> VueChest 若要上监控，Sentry（错误+性能一体）是最快起步；自建则按上面五块各实现一个上报端点即可。

## 参考来源

- Web Vitals：<https://web.dev/articles/vitals>
- web-vitals 库：<https://github.com/GoogleChrome/web-vitals>
- Sentry：<https://docs.sentry.io/>
- MDN 错误事件：<https://developer.mozilla.org/zh-CN/docs/Web/API/Window/error_event>
- sendBeacon：<https://developer.mozilla.org/zh-CN/docs/Web/API/Navigator/sendBeacon>
- OpenTelemetry JavaScript：<https://opentelemetry.io/docs/languages/js/>
- OpenTelemetry 采样：<https://opentelemetry.io/docs/languages/js/sampling/>
