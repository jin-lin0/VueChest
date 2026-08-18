# 前端工程化全链路

> 适用场景：从「能跑」到「能团队协作、能持续交付」。本文串起 Monorepo / pnpm / 规范提交 / ESLint+Prettier+Husky / CI-CD。
> 阅读前提：包管理器基础、Vite（见 `vite`）、Git。

一个人写代码看功能，一个团队写代码看「工程化」——它决定了多人协作不内耗、发布不翻车。

## 一、包管理器与 pnpm

- **pnpm**：硬链接 + 内容寻址存储，安装最快、最省磁盘、严格隔离（无幽灵依赖）。VueChest 用 pnpm。
- 幽灵依赖：npm/yarn 扁平化会把未声明的依赖也提到顶层，`import` 能用到但不安全；pnpm 的严格 `node_modules` 杜绝此问题。
- 锁文件（pnpm-lock.yaml）固定依赖树，保证「我本地能跑 = CI 能跑 = 线上能跑」。

```bash
pnpm install        # 安装
pnpm add vue        # 加依赖
pnpm -w add -D typescript  # workspace 根加 devDep
```

## 二、Monorepo（多包单仓）

- 一个仓库放多个包/应用，共享配置与依赖、原子提交、统一版本。
- 工具：pnpm workspace（轻量）、Turborepo/Nx（带任务编排与缓存）。
- VueChest 若拆出组件库/工具库，pnpm workspace + `packages/*` 即可起步。

```
repo/
├─ packages/ui/        # 组件库
├─ packages/utils/    # 工具
└─ apps/web/          # 主应用
```

## 三、代码规范：ESLint + Prettier + Husky

- **ESLint**：静态检查（未用变量、错误写法、Vue 规则）。
- **Prettier**：格式化（缩进、引号、换行），与 ESLint 分工（用 `eslint-config-prettier` 关掉冲突规则）。
- **Husky + lint-staged**：提交前对「改动文件」跑 lint/format，防止脏代码进库。

```jsonc
// .husky/pre-commit
npx lint-staged
// lint-staged 配置：只格式化暂存文件
{ "*.{ts,vue}": ["eslint --fix", "prettier --write"] }
```

## 四、规范化提交（Conventional Commits）

```
feat: 新增知识库校验脚本
fix: 修复 RouterView 过渡白屏
docs: 补充 Pinia 持久化示例
```

- 前缀：feat/fix/docs/refactor/test/chore/style/perf。
- 好处：自动生成 CHANGELOG、语义化版本（semver）、提交历史可读。
- 工具：`commitlint` 校验消息格式 + `commitizen` 交互式生成。

## 五、CI/CD

- **CI（持续集成）**：push/PR 自动跑 `lint` + `type-check` + `test` + `build`，不过不让合。
- **CD（持续交付/部署）**：通过后自动部署——VueChest 用 Vercel（推送即部署预览/生产）。
- 关键：CI 必须「快且真」——用缓存（node_modules/构建缓存）提速，但别跳过真实校验。

```
PR 提交 → 跑 lint/type/test/build（CI） → 通过 → 合并 → Vercel 自动部署（CD）
```

## 六、质量门禁清单

- [ ] 依赖用 pnpm + 锁文件
- [ ] ESLint + Prettier 全量覆盖，Husky 提交前拦截
- [ ] 提交消息走 Conventional Commits
- [ ] CI 跑 lint/type/test/build，失败阻断合并
- [ ] CD 自动部署 + 预览环境
- [ ] 重大变更有 CHANGELOG / 文档同步

> 工程化的目的不是「流程多」，而是把「正确的事」变成「默认发生的事」。VueChest 当前已具备 pnpm + Vercel 部署，可逐步补 Husky/commitlint/CI 校验。

## 参考来源

- pnpm 文档：<https://pnpm.io/>
- Conventional Commits：<https://www.conventionalcommits.org/>
- Husky：<https://typicode.github.io/husky/>
- Turborepo：<https://turbo.build/repo/docs>
- Vercel：<https://vercel.com/docs>
