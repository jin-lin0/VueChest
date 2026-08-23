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

## 七、落地清单

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
