# 微前端与模块联邦

> 当单体前端膨胀到数十个业务域、团队互相阻塞时，微前端把"一个应用"拆成"多个可独立开发/部署的子应用"。本文对比主流方案，并给出 Vue 接入 Module Federation 的实操。

## 一、什么时候才需要微前端

- 多团队并行、技术栈异构（Vue + React 共存）。
- 子业务需**独立部署**、互不干扰发布节奏。
- 老系统（jQuery/AngularJS）要渐进式重构，又不能一次性重写。

> 单体应用千万别硬上微前端——带来的复杂度（通信、样式隔离、依赖去重）远超收益。Monorepo + 分包（见 `frontend-engineering.md`、`vite.md`）通常就够了。

## 二、主流方案对比

| 方案 | 隔离性 | 技术栈 | 部署 | 复杂度 |
| --- | --- | --- | --- | --- |
| **Module Federation（Vite/Webpack）** | JS 作用域隔离 | 多栈 | 运行时远程加载 | 中 |
| **iframe** | 最强（完全隔离） | 任意 | 独立 | 低（但通信/路由割裂） |
| **qiankun（single-spa）** | JS 沙箱 + 样式沙箱 | 多栈 | 构建期打包 | 中高 |
| **Web Components** | 原生封装 | 多栈 | 独立 | 中 |

## 三、Module Federation（推荐 Vite 栈）

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
- **JS**：Module Federation 走模块作用域天然隔离；qiankun 用 `Proxy` 沙箱隔离 `window`；iframe 天然隔离但通信麻烦。
- **全局状态**：跨应用共享用事件总线或主应用下发的 props/store，避免子应用直接读写彼此状态。

## 五、通信方式

| 方式 | 适用 |
| --- | --- |
| Props / 路由参数 | 主→子单向传参 |
| 全局事件总线（mitt） | 轻量发布订阅 |
| 主应用 store 下发 | 共享登录态/主题 |
| 自定义事件 / postMessage | iframe 跨域 |

## 六、坑位清单

- **依赖重复**：`shared` 没配或版本不一致 → 打包两份 Vue，组件 `inject` 取不到。务必共享运行时。
- **路由冲突**：各子应用路由前缀隔离（如 `/cart/*`），主应用用 `micro-app`/路由守卫统一调度。
- **样式穿透**：子应用 `:deep()` 误伤主应用；统一用 `scoped` + 命名空间。
- **构建产物**：remote 的 `remoteEntry.js` 路径在主应用配置里要与实际部署一致。

## 七、小结

- 先评估是否真需要——多数场景 Monorepo + 分包即可。
- Vue 栈优先 **Module Federation**，共享 `vue`/`pinia` 是关键。
- 隔离靠作用域 + shared 依赖；通信靠 props/事件总线/主 store。

## 参考来源

- Vite Federation 插件：<https://github.com/originjs/vite-plugin-federation>
- Module Federation 官方：<https://module-federation.io/>
- qiankun 文档：<https://qiankun.umijs.org/>
- Web Components MDN：<https://developer.mozilla.org/zh-CN/docs/Web/API/Web_components>
