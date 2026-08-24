# VueChest（前端）

基于 **Vue 3 + TypeScript + Vite** 的单页应用，是 [VueChest](https://server.020201.xyz) 的「应用中心」前端。提供 AI 对话、股票分析、音乐、面试题库、API 管理、开发工具箱（42 个开发小工具）等内置工具，并内置可安装第三方应用的「应用市场」。

> 后端服务见同级目录 `../VueChestServer`，项目总览见根目录 [`README.md`](../README.md)。

## 技术栈

- **前端框架**: Vue 3.5 + TypeScript
- **构建工具**: Vite 7
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **Markdown**: marked + highlight.js + md-editor-v3
- **可视化 / 图形**: three（3D 赛车）、lightweight-charts（K 线）
- **本地存储**: IndexedDB（idb）
- **其它**: lunar-javascript（农历）、vuedraggable（拖拽排序）
- **代码质量**: ESLint + Prettier

## 推荐开发环境

- [VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)（请禁用 Vetur）
- Node.js: `^20.19.0 || >=22.12.0`

## 内置应用

源码位于 `src/apps/`，由 `src/router/index.ts` 挂载路由：

| 应用           | 路由                 | 说明                                                                                                                                                                                                                                                                                                          |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI 聊天        | `/ai-chat`           | 多平台模型（OpenRouter / 硅基流动 DeepSeek），服务端中转密钥，历史落库                                                                                                                                                                                                                                        |
| 股票研究工作台 | `/stock`             | 腾讯实时行情与 K 线；大盘、技术指标、估值、财务、公告、研究笔记与价格提醒                                                                                                                                                                                                                                     |
| B 站字幕       | `/bilibili-subtitle` | 提取 B 站视频字幕                                                                                                                                                                                                                                                                                             |
| 音乐           | `/music`             | 网易云音乐播放、收藏分组、持久队列、播放历史、相似推荐与睡眠定时                                                                                                                                                                                                                                              |
| 面试题库       | `/interview`         | 题目练习 + 知识文档（后台管理题库）                                                                                                                                                                                                                                                                           |
| API 管理       | `/api-manager`       | 免费接口目录、环境变量、请求集合、自动断言、导入导出与在线调试                                                                                                                                                                                                                                                |
| 开发工具箱     | `/dev-toolbox`       | 42 个开发小工具，分 8 类（编码解码 / 时间日期 / 格式化转换 / 加密生成 / 文本处理 / 前端网络 / 图片媒体 / 单位换算）：TOML/INI/Query/FormData、HTTP 状态码/Curl/JSON Schema、Punycode/Hex/Gzip、图片→Base64/主色调/占位图、单位换算等；侧边栏支持搜索、分组折叠、最近使用、?tool= 深链，右键可「置顶」常用工具 |
| 赛车游戏       | `/racing`            | 3D 赛车小游戏                                                                                                                                                                                                                                                                                                 |
| 贪吃蛇         | `/snake`             | 本地双人 / 人机对战                                                                                                                                                                                                                                                                                           |
| 游戏中心       | `/games`             | 汇总游戏入口、本机记录、每日挑战、赛车档案与成就                                                                                                                                                                                                                                                              |
| 帮助文档       | `/docs`              | Markdown 文档中心（`src/docs/`）                                                                                                                                                                                                                                                                              |

另含页面级模块：`/` 首页、`/market` 应用市场（可上传/安装 `market-apps/` 中的第三方应用）、`/login` `/register` 认证、`/admin` 后台管理（题库、分类、应用、用户）。

## 目录结构

```
src/
├── apps/        内置应用（每个子目录一个 App.vue 入口）
├── views/       页面级视图（首页 / 市场 / 后台 / 认证）
├── layouts/     布局（含 AdminLayout）
├── components/  common/ 通用组件 · business/ 业务组件
├── composables/ 组合式逻辑（含 useTheme、useChatStream 等）
├── config/      前端配置（API、AI 平台类型等）
├── lib/         有副作用的服务封装（markdown/db/storage/request/app-loader）
├── utils/       纯函数工具（clipboard/lunar/index 等）
├── docs/        文档中心 Markdown 源文件
├── router/      路由与导航守卫
├── stores/      Pinia 状态
├── styles/      全局样式与主题 tokens
└── types/       全局类型
```

> **约定**：`lib/` 放有单例/副作用的封装，`utils/` 放纯函数；通用 UI 优先使用 `components/common/` 下的封装组件（如 `CustomSelect`、`Toast`、`MarkdownView`）。

## 快速开始

### 安装依赖

```sh
pnpm install
```

### 开发环境

```sh
pnpm dev
```

默认启动在 `http://localhost:5173`，通过 `.env.development` 中的 `VITE_API_BASE_URL` 连接后端（默认 `http://localhost:3000`）。
启动前会自动扫描 Markdown 并更新文档懒加载目录，无需手动运行 `docs:catalog`。

### 生产构建

```sh
pnpm build
```

依次生成文档懒加载目录、执行 TypeScript 类型检查、Vite 构建和首屏体积预算检查。当前预算限制入口 gzip ≤30KB、首屏 JavaScript gzip 合计 ≤100KB，并阻止首页重新引入远程字体或过多预加载。产物输出到 `dist/`。

### 预览构建产物

```sh
pnpm preview
```

### 代码检查 / 格式化

```sh
pnpm lint      # eslint . --fix
pnpm format    # prettier --write src/
```

## 环境变量

| 文件               | 变量                | 说明                                             |
| ------------------ | ------------------- | ------------------------------------------------ |
| `.env.development` | `VITE_API_BASE_URL` | 开发后端地址（默认 `http://localhost:3000`）     |
| `.env.production`  | `VITE_API_BASE_URL` | 生产后端地址（默认 `https://server.020201.xyz`） |

## 市场应用构建 / 发布

```sh
pnpm build:market     # 构建 market-apps/ 到产物目录
pnpm publish:market   # 发布到后端 R2 存储
```

市场发布会为应用包计算 SHA-256，并把校验值写入 R2 对象元数据和版本记录。浏览器安装时会重新计算校验值；不一致的包不会进入本地缓存。

## 面试文档维护

```sh
pnpm interview:validate # 检查题目覆盖、所属章节和答案代码块语法
```

新增题目时，同时在 `niuke.md` 和对应的 `niuke-*-full-qa.md` 中写入相同题目文本与答案即可。答案文档以题目文本作为三级标题，不维护全局编号或源文件行号。

## A 股短线交易知识库

股票分析应用内置一个持续成长的「A 股短线交易知识库」（路由 `/stock/knowledge`，从股票分析页的「🧠 知识中心」进入）。知识以「原子（atom）」为单位组织，每条带分类、标签、可信度、引用与关联，支持分类/标签筛选、全文搜索、详情阅读与知识图谱浏览。

知识数据**不进前端仓库**：原始原子聚合后发布到 Cloudflare R2 公开桶，前端运行时直连 R2 拉取，更新知识库**无需重新构建前端**。

### 本地数据目录

`src/apps/stock/knowledge/data/`：

```
data/
├── raw/         源知识原子（输入）：每个 <domain>.json 是一个 KnowledgeAtom[] 数组
└── generated/   聚合产物（输出，由 build 生成）：atoms / index / graph 三个 JSON
```

> `data/` 整体已加入 `.gitignore`，不进版本控制；R2 为权威源。

### 脚本（scripts/knowledge/）

| 脚本                     | 作用                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `r2-kb.mjs`              | R2 共用助手：复用 `VueChestServer/.env` 的 R2 凭证与 `@aws-sdk`，提供 getR2 / 上传 / 列举 / 下载 / 删除 / 复制。前端不引 aws-sdk。                                                                                             |
| `kb-sync-raw.mjs`        | `--pull` 把 R2 的 `stock/knowledge/raw/*` 下载到本地 `data/raw/`；`--push` 把本地 `data/raw/*` 上传到 R2。                                                                                                                     |
| `build-knowledge.mjs`    | 聚合本地 `data/raw/*` → 产出 `atoms.json` / `index.json` / `graph.json`（写入 `data/generated/`），并发布到 R2 的 `stock/knowledge/generated/`。发布前校验本地 raw 是否覆盖 R2 全量（防止误覆盖成子集），可用 `--force` 跳过。 |
| `validate-knowledge.mjs` | 质量门禁：检查 raw 原子是否合规（必需小节 / category / confidence / citations）。                                                                                                                                              |

### npm 命令

```sh
pnpm kb:pull      # 拉取 R2 上的全部 raw 到本地（改 JSON 前先跑，避免覆盖他人改动）
pnpm kb:validate  # 只读自检 raw 是否合规
pnpm kb:publish   # 上传 raw 到 R2 → 聚合并发布 3 个产物到 R2（前端直连自动生效）
```

### R2 存储

- 桶：`vuechest`，公开基地址 `https://files.020201.xyz`（可用 `VITE_KB_R2_BASE` 覆盖）。
- 路径：`stock/knowledge/raw/*.json`（源原子）与 `stock/knowledge/generated/*.json`（聚合产物）。
- 前端 `loader.ts` 运行时拉取 `index.json` / `atoms.json` / `graph.json` 三个文件，并以 `index.generatedAt` 作为缓存版本号自动绕过 CDN / 浏览器缓存。
- R2 已配置 CORS，放行前端域名（`app.020201.xyz` / `localhost:5173` / `localhost:3000`）。

### 持续扩展

每周一 09:00 有一个自动化任务（`automation-1784654144242`）自动研究一个新子主题、写入 `data/raw/auto-YYYY-MM-DD.json`、推送并重新聚合发布，知识库因此持续成长。

## 部署

已配置 `vercel.json`：

- SPA 回退：未匹配路由重写到 `/`。
- 第三方代理重写：`/api/stock*` → 腾讯行情、`/meting-api` → 网易云音乐网关。

详见根目录 [`README.md`](../README.md#部署)。
