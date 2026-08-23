---
group: 架构与设计
order: 27
---

# 微前端与模块联邦

> 当单体前端膨胀到数十个业务域、团队互相阻塞时，微前端把"一个应用"拆成"多个可独立开发/部署的子应用"。本文对比主流方案，并给出 Vue 接入 Module Federation 的实操。

## 一、什么时候才需要微前端

- 多团队并行、技术栈异构（Vue + React 共存）。
- 子业务需**独立部署**、互不干扰发布节奏。
- 老系统（jQuery/AngularJS）要渐进式重构，又不能一次性重写。

> 单体应用千万别硬上微前端——带来的复杂度（通信、样式隔离、依赖去重）远超收益。Monorepo + 分包（见 `frontend-engineering.md`、`vite.md`）通常就够了。

## 二、主流方案对比

| 方案                                  | 隔离性                     | 技术栈 | 部署                | 复杂度                |
| ------------------------------------- | -------------------------- | ------ | ------------------- | --------------------- |
| **Module Federation（Vite/Webpack）** | 无安全隔离，共享页面运行时 | 多栈   | 运行时远程加载      | 中                    |
| **iframe**                            | 最强（完全隔离）           | 任意   | 独立                | 低（但通信/路由割裂） |
| **qiankun（single-spa）**             | 运行时沙箱与样式约束       | 多栈   | 子应用独立构建/加载 | 中高                  |
| **Web Components**                    | 原生封装                   | 多栈   | 独立                | 中                    |

## 三、Module Federation（Vite 栈示例）

Vite 用 `@originjs/vite-plugin-federation`，主应用（host）远程消费子应用（remote）导出的模块。

```ts
// remote (子应用) vite.config.ts
import federation from '@originjs/vite-plugin-federation'
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remote_app',
      filename: 'remoteEntry.js',
      exposes: { './Cart': './src/components/Cart.vue' },
      shared: ['vue', 'pinia'],
    }),
  ],
})
```

```ts
// host (主应用) vite.config.ts
federation({
  name: 'host_app',
  remotes: { remote_app: 'http://localhost:5171/assets/remoteEntry.js' },
  shared: ['vue', 'pinia'],
})
```

```ts
// host 中按需加载远程组件
const Cart = defineAsyncComponent(() => import('remote_app/Cart'))
```

要点：`shared` 必须对齐主子应用版本，避免"两个 Vue 实例"导致上下文错乱；远程地址走配置/环境变量，方便切测试/生产。

## 四、样式与 JS 隔离

- **样式**：各子应用加作用域前缀（Vue `scoped`/`CSS Modules`/`tokens.css`），主应用用命名空间包裹；禁止全局 `reset` 互相污染。
- **JS**：模块作用域只避免变量名直接冲突，不是安全沙箱。Module Federation 的 remote 与 host 共享页面权限，可读 DOM、Cookie 和全局对象，只应加载受信任团队产物；qiankun 的 Proxy 主要解决运行时污染，也不能当成对恶意代码的隔离。真正低信任代码优先使用无 `allow-same-origin` 的 sandbox iframe，并通过能力桥通信。
- **全局状态**：跨应用共享用事件总线或主应用下发的 props/store，避免子应用直接读写彼此状态。

## 五、通信方式

| 方式                     | 适用            |
| ------------------------ | --------------- |
| Props / 路由参数         | 主→子单向传参   |
| 全局事件总线（mitt）     | 轻量发布订阅    |
| 主应用 store 下发        | 共享登录态/主题 |
| 自定义事件 / postMessage | iframe 跨域     |

## 六、坑位清单

- **依赖重复**：`shared` 没配或版本不一致 → 打包两份 Vue，组件 `inject` 取不到。务必共享运行时。
- **路由冲突**：各子应用路由前缀隔离（如 `/cart/*`），主应用用 `micro-app`/路由守卫统一调度。
- **样式穿透**：子应用 `:deep()` 误伤主应用；统一用 `scoped` + 命名空间。
- **构建产物**：remote 的 `remoteEntry.js` 路径在主应用配置里要与实际部署一致。

## 七、独立发布与契约治理

“能单独部署”不等于“可以随意发布”。Host 与 remote 之间的 props、事件、路由基座、共享依赖和设计 token 都是版本化契约。remoteEntry 应使用不可变版本 URL，发布后先做健康检查，再原子更新 manifest；线上故障时切回旧 URL，而不是覆盖同名文件让 CDN 状态不可预测。

共享依赖要说明 singleton、兼容范围和加载失败策略。强制共享可能让 remote 在未测试的新版本 Vue 上运行；完全不共享又增加体积，并可能破坏 provide/inject。最稳妥的做法是 CI 做 host × remote 兼容矩阵，并让宿主能拒绝不兼容 manifest。

```ts
interface RemoteManifest {
  name: string
  version: string
  entry: string
  apiVersion: 2
  integrity?: string
}

function isCompatible(remote: RemoteManifest) {
  return remote.apiVersion === 2 && new URL(remote.entry).protocol === 'https:'
}
```

## 八、路由、状态与可观测性

主应用拥有顶层 URL 和鉴权，子应用只管理分配给自己的路径前缀。跨应用通信优先稳定的领域事件，不共享可任意修改的巨大 store；事件定义 schema、版本和取消订阅。用户身份只下发最小视图，不把 token 作为普通 prop 广播。

日志、错误和性能事件统一带 host release、remote name/version、路由和 trace ID。远程加载失败要有超时、重试、错误边界和降级页面；一个子应用崩溃不能让整个壳白屏。部署看板同时展示 host/remote 版本组合，才能复现只在特定组合出现的问题。

## 九、常见坑与选型清单

- 因代码仓库大就引入微前端，但团队仍共用发布和排期；先用模块边界、Monorepo 和路由拆包。
- 把 Module Federation 当安全隔离，允许不可信 remote 在主页面执行。
- 用全局事件总线传所有状态，没有 schema、owner 和清理，最终形成隐式耦合。
- 每个子应用带一套 UI、埋点和认证，用户体验与基础设施重复建设。
- remote 覆盖同名 URL，CDN/浏览器缓存导致 host 拿到混合版本。

决策时依次确认：是否确实需要团队独立发布；业务边界能否稳定切分；允许的信任级别；首屏额外请求与运行时故障是否可接受；契约、兼容测试、灰度和回滚由谁负责。缺少这些条件时，模块化单体通常更可靠。

## 十、小结

- 先评估是否真需要——多数场景 Monorepo + 分包即可。
- Vue 栈优先 **Module Federation**，共享 `vue`/`pinia` 是关键。
- 隔离靠作用域 + shared 依赖；通信靠 props/事件总线/主 store。

## 参考来源

- Vite Federation 插件：<https://github.com/originjs/vite-plugin-federation>
- Module Federation 官方：<https://module-federation.io/>
- qiankun 文档：<https://qiankun.umijs.org/>
- Web Components MDN：<https://developer.mozilla.org/zh-CN/docs/Web/API/Web_components>
