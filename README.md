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
| 音游实验室     | `/rhythm`            | 自动分析音乐节拍生成谱面的 4 键下落式音游                                                                                                                                                                                                                                                                     |
| 星渊幸存者     | `/neon-survivor`     | 六分钟霓虹肉鸽射击：双摇杆战斗、随机强化与三阶段 Boss                                                                                                                                                                                                                                                         |
| 游戏中心       | `/games`             | 汇总游戏入口、本机记录、每日挑战、赛车档案与成就                                                                                                                                                                                                                                                              |
| 帮助文档       | `/docs`              | Markdown 文档中心（`src/docs/`）                                                                                                                                                                                                                                                                              |

另含页面级模块：`/` 首页、`/market` 应用市场（含按下载量与评分排序的「热门榜」，可上传/安装 `market-apps/` 中的第三方应用）、`/login` `/register` 认证、`/admin` 后台管理（题库、分类、应用、用户）。

全局命令面板支持 `⌘/Ctrl + K` 唤起，可搜索内置应用、已安装应用、市场应用、页面、App 快捷操作，以及**帮助文档**（文档注册表体积较大，仅在输入 2 个及以上字符时才懒加载）。系统 App 通过各自目录下的 `commands.ts` 暴露操作命令，命令面板只负责搜索、排序和执行；目前已接入音乐控制、流水线预设、股票研究与模拟持仓、面试随机练习，以及 API 请求和集合运行。

登录后可在 `/settings/account` 选择性同步工作区布局、开发工具箱预设、面试进度、API 工作台、音乐设置或股票本地数据。未勾选的数据不会上传或下载；API 环境变量和股票持仓默认不勾选，并在界面中标记为可能含敏感数据。

## 目录结构

```
src/
├── apps/        内置应用（每个子目录一个 App.vue 入口）
├── views/       页面级视图（首页 / 市场 / 开发者中心 / 通知中心 / 后台 / 认证）
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

依次生成文档懒加载目录、执行 TypeScript 类型检查、Vite 构建、首屏预算和路由级预算检查。当前首屏预算限制入口 gzip ≤31KB、JavaScript 合计 ≤100KB；路由预算根据 Vite manifest 统计首次进入的静态依赖闭包，并显式纳入首帧必触发的动态组件，覆盖股票、API、面试、赛车和题目编辑器。产物输出到 `dist/`。

> **入口预算为何从 30KB 调到 31KB**：新增「通知中心」时入口已贴到 30663 / 30720，只剩 57 字节余量，
> 而单是注册一条懒加载路由的固定开销就超过它（35 条路由记录都写在 `router/index.ts` 里，全算入口成本）。
> 通知 store 已改为动态导入（见 `src/App.vue`）。**后续入口增长仍应优先靠「把非关键逻辑移出入口」解决。**

### 预览构建产物

```sh
pnpm preview
```

### 代码检查 / 格式化

```sh
pnpm lint      # 只检查 ESLint，不修改文件
pnpm lint:fix  # 自动修复可安全处理的 ESLint 问题
pnpm format    # 使用 Prettier 格式化 src/
pnpm check     # 完整质量检查：lint、测试、文档校验、主应用与市场应用构建预算
```

## 环境变量

| 文件               | 变量                | 说明                                             |
| ------------------ | ------------------- | ------------------------------------------------ |
| `.env.development` | `VITE_API_BASE_URL` | 开发后端地址（默认 `http://localhost:3000`）     |
| `.env.production`  | `VITE_API_BASE_URL` | 生产后端地址（默认 `https://server.020201.xyz`） |

## 通知中心

- **入口**：首页顶栏铃铛（`components/business/NotificationCenter.vue`），未读角标同时写入 favicon 与
  Badging API（`lib/app-badge.ts`）。完整列表在 `/notifications`（`views/Notifications.vue`）。
- **状态**：`stores/notifications.ts`。登录后由 `App.vue` 调用 `bootstrapNotifications()`（拉一次未读数 +
  每 60s 轮询，后台标签页自动跳过），退出登录清空角标。
  注意 `App.vue` 里用的是**动态 `import()`** 而不是顶层 import：入口 gzip 预算贴着上限，
  通知 store 连带展示层约 3.5KB，放进首屏关键路径会顶破预算；角标晚几百毫秒出现无感。
- **乐观更新**：标记已读 / 删除都先改本地再发请求，失败则回滚到服务端状态并重新拉取，
  不会出现「界面说已读、刷新又变未读」的错觉。
- **纯函数拆分**：类型→图标映射、相对时间、站内跳转白名单（`lib/notification-format.ts`）
  与 favicon 角标（`lib/app-badge.ts`）都是无副作用函数，可直接单测。

> ⚠️ **本项目不使用 Service Worker。** `main.ts` 启动时会主动注销所有已注册的 Service Worker。
> 因此没有浏览器系统级推送，通知只做站内投递。

## 开发者数据看板

`/developer`（`views/DeveloperCenter.vue`）顶部新增数据看板，数据来自后端 `GET /api/developer/analytics`：

- 四块指标：应用数 / 上架数 / 待审版本 / 窗口内下载量
- 下载趋势（面积图）与评论趋势（柱状图），共用 `components/common/TrendChart.vue`
- 应用维度表格：窗口内下载、评论数、平均评分，以及 32px 迷你走势
- 评分分布 1~5 星条形图、平均审核耗时

`TrendChart` 是手写 SVG（`components/common/trend-chart.ts` 负责几何计算，纯函数），
没有引入图表库：`viewBox` + `preserveAspectRatio="none"` 做自适应拉伸，
`vector-effect="non-scaling-stroke"` 保证线宽不被拉伸变形。

## 市场应用构建 / 发布

```sh
pnpm build:market              # 构建 market-apps/ 下全部应用到产物目录
pnpm publish:market            # 构建并发布**全部**应用（每个都会重新上传）
pnpm publish:market ai-notes   # 只发布指定应用（改了哪个发哪个，推荐）
```

发布脚本会：登录后端 → 构建 → 计算应用包 SHA-256 → 直传 R2 → 创建/更新应用记录 → 自动过审。

- **重复发布是更新而不是新建**：服务端按「同名 + 同作者」判定为同一应用，版本记录按
  「appId + version」`findOrCreate`，所以重复执行不会产生重复应用或重复版本。
- 凭据从 `.env` 读取：`MARKET_USER`（缺省 `admin`）与 `MARKET_PASS`；
  发布目标取 `.env.production` 的 `VITE_API_BASE_URL`（缺省 `https://server.020201.xyz`）。
- 浏览器安装时会重新计算 SHA-256 并与 R2 对象元数据比对，不一致的包不会进入本地缓存。
- `meta.json` 的 `permissions` 会随包一起提交；**漏了它应用就一个能力都拿不到**（服务端会静默存成 `[]`）。

`market-apps/` 目录：`ai-notes`（AI 速记，演示云端同步 + AI + 通知 + 剪贴板）、`bookmark`、`counter`、`expense`、`notes`、`pomodoro`、`special-days`、`todo`。

## 市场应用能力与权限

市场应用运行在 `public/sandbox.html` 的 iframe 沙箱（`sandbox="allow-scripts"`，**不开启** `allow-same-origin`）内，宿主通过 `src/lib/sandbox-bridge.ts` 按白名单代理其能力请求。

| 能力       | 权限键 / 开关                     | 说明                                                     |
| ---------- | --------------------------------- | -------------------------------------------------------- |
| 本地存储   | 默认开放                          | 按 `appId` 命名空间隔离，读写自己的数据                  |
| 主题       | 默认开放                          | 跟随站点深浅色                                           |
| 网络请求   | `allowNetwork` 域名白名单         | 默认拒绝一切域名，按域名逐个放行（15s 超时）             |
| 站内通知   | `notify`                          | 弹宿主 Toast                                             |
| 剪贴板     | `clipboard`                       | 读写系统剪贴板                                           |
| 账号信息   | `profile`                         | 只读用户名与头像（需登录）                               |
| 云端存储   | `cloud`                           | 按「用户 + 应用」隔离的云端 KV（需登录）                 |
| AI 生成    | `ai`                              | 受控调用站内 AI 中转（需登录）                           |
| 文件上传   | `files`                           | 上传附件到 R2（需登录，单文件 ≤4MB）                     |

应用在应用包 `meta.permissions` 里声明所需能力，上传时写入服务端并随版本审核；安装（或更新时新增权限）会弹出授权确认，未确认不写入本地。运行时 `window.__VueChest__.permissions` 返回本次实际授予的权限，应用可据此降级到本地存储。

授权闸门放在 `src/stores/market.ts` 的 `ensureConsent` 里（**fail-closed**），弹窗是挂在 `App.vue` 上的全局组件 `MarketPermissionDialog`。这样从市场列表、应用详情、工作区模板恢复、跨设备同步等任何入口安装 / 更新都必然经过确认，新增入口也不会漏；声明 0 权限的应用不打扰用户，更新时只对**新增**的权限再次确认。后台自动更新无人值守，走 `consent: 'skip'`，遇到新增权限就跳过并记入 `updateErrors`，绝不静默授权。

> 后端配套接口：`/api/app-data`（云端 KV，按 userId + appId 隔离）与 `/api/app-ai`（受控 AI 代理，要求应用已声明 `ai` 权限）。开发者文档见 `src/docs/help/market-capabilities.md`。

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
