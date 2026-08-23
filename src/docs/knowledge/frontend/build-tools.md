---
group: 工程化与构建
order: 12
---

# 现代构建工具对比

> 适用场景：新项目选型、老项目迁移、面试被问「为什么用 Vite」。本文对比 Vite / Webpack / esbuild / Rollup 的定位与取舍。
> 阅读前提：已了解 Vite（见 `vite`）、打包基本概念。

「构建工具」其实分两类角色：**bundler（打包器，决定模块怎么合并）** 和 **compiler/optimizer（编译优化器，只管转译/压缩）**。理清角色才不会被名字搞晕。

## 一、四种工具的角色

| 工具        | 角色                                 | 核心特点                                                |
| ----------- | ------------------------------------ | ------------------------------------------------------- |
| **Vite**    | 开发服务器 + 生产打包器（套 Rollup） | 开发期 ESM 免打包、秒级启动；生产用 Rollup              |
| **Webpack** | 全能 bundler                         | 生态最全、配置最重、速度偏慢                            |
| **esbuild** | 极速 compiler/optimizer（Go 写）     | 转译+压缩极快（比 JS 工具快 10–100×），不做「智能分包」 |
| **Rollup**  | 库/应用 bundler                      | 产物干净、Tree-shaking 强，适合库与公司级打包           |

> 一句话：**Vite 用 esbuild 做开发编译、用 Rollup 做生产打包**；Webpack 是上一代全能选手；esbuild 是「快」的代名词但通常不单独当完整打包器；Rollup 是 Vite 生产的心脏。

## 二、速度对比（直觉）

- **开发启动**：Vite（ESM 按需）≫ Webpack（全量打包）>> 冷启慢的 Webpack。
- **热更新（HMR）**：Vite 只编译改的文件，毫秒级；Webpack 大项目明显卡。
- **生产构建**：esbuild 最快（但产物优化弱）；Rollup/Vite 平衡「速度与产物质量」；Webpack 最慢但最可控。

> 为什么 Vite 开发快：浏览器原生支持 ESM，Vite 不打包，只按需编译请求到的文件（详见 `vite`）。Webpack 启动要把整图打包一遍，项目越大越慢。

## 三、生态与配置

- **Webpack**：loader/plugin 生态极其丰富，几乎「没有做不到，只有配不配」。代价：配置复杂、学习曲线陡、长期维护成本高。
- **Vite**：插件 API 兼容 Rollup 生态，现代库基本都支持；配置量远小于 Webpack。`vite.config.ts` 改改即用（见 `vite`）。
- **Rollup**：偏「库打包」心智，配置比 Webpack 简单，产物更利于 Tree-shaking。
- **esbuild**：几乎零配置，但高级分包/优化能力弱，多作为「别人工具里的引擎」。

## 四、产物质量（Tree-shaking）

- **Rollup / Vite**：基于 ES Module 的静态分析，Tree-shaking 最强，产物最小最干净——这是它胜任「生产打包」的根本原因。
- **Webpack**：也支持，但默认产出带更多运行时代码。
- **esbuild**：能摇但粒度/效果不如 Rollup，所以 Vite 生产仍选 Rollup 而非纯 esbuild。

> 这点解释了 Why：**Vite 不自己在生产期用 esbuild 打包**，因为 esbuild 的 Tree-shaking 不够好；它用 esbuild 做「快」的转译压缩，用 Rollup 做「优」的结构打包。

## 五、选型建议

```
新前端项目（Vue/React）？ ──是──> Vite（开发体验+产物质量都好）
        │否
要打一个 npm 库（干净 ESM 产物）？ ──是──> Rollup（或 Vite lib 模式）
        │否
老项目已重度依赖 Webpack 生态？ ──是──> 暂不迁移，按需优化（分包/缓存）
        │否
只想要「最快转译/压缩」嵌入自己流水线？ ──是──> esbuild
```

> 迁移现实：Webpack → Vite 在大项目上要处理 `require` 动态、特殊 loader 等坑，不是无脑换。VueChest 已用 Vite，享受其开发速度与 Rollup 产物质量。

## 六、与 VueChest 的关系

- 开发：`vite` + `@vitejs/plugin-vue`，秒级启动、HMR 顺滑。
- 生产：`vite build` → 底层 Rollup 做分包（`manualChunks` 把 three/echarts 单独拆，见 `vite`）。
- 资源：`?raw` 加载 markdown、`?url` 资源（见 `vite` 资源导入章）。
- 结论：对 Vue 3 项目，Vite 是当前（2025–2026）默认且无脑推荐的选择。

## 参考来源

- Vite 官方（为何快）：<https://vitejs.dev/guide/why.html>
- esbuild：<https://esbuild.github.io/>
- Rollup：<https://rollupjs.org/>
- Webpack：<https://webpack.js.org/>
- Vite vs Webpack 深度对比：<https://blog.logrocket.com/vite-vs-webpack/>
