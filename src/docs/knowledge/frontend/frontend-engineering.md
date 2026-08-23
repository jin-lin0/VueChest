---
group: 工程化与构建
order: 13
---

# 前端工程化全链路

> 适用场景：从「能跑」到「能团队协作、能持续交付」。本文串起 Monorepo / pnpm / 规范提交 / ESLint+Prettier+Husky / CI-CD。
> 阅读前提：包管理器基础、Vite（见 `vite`）、Git。

一个人写代码看功能，一个团队写代码看「工程化」——它决定了多人协作不内耗、发布不翻车。

## 一、包管理器与 pnpm

- **pnpm**：内容寻址存储配合链接复用包文件，通常能节省磁盘与安装时间；默认依赖布局比传统扁平 node_modules 更严格。VueChest 使用 pnpm。
- 幽灵依赖：传统扁平布局可能让包偶然 import 到未声明依赖；pnpm 默认布局能显著减少这类问题，但 workspace/hoist 配置仍会影响可见性，每个包依旧必须声明自己直接使用的依赖。
- 锁文件（pnpm-lock.yaml）固定解析结果；CI 还要固定 Node/pnpm 大版本并使用 frozen lockfile，才能更接近可复现。

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

```bash
// .husky/pre-commit
pnpm exec lint-staged
```

```jsonc
// package.json
// lint-staged 配置：只格式化暂存文件
{
  "lint-staged": {
    "*.{ts,vue}": ["eslint --fix", "prettier --write"],
  },
}
```

本地 hook 可以提升反馈速度，但能被跳过，也可能因环境不同失效；真正门禁必须在 CI 重跑。自动修复只能处理确定性规则，类型、测试和安全检查不要塞进每次 pre-commit 让提交变得不可用。

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

## 六、任务图、缓存与制品

Monorepo 的任务需要声明依赖关系：build 依赖上游包 build，test 可能只依赖源码与配置。缓存 key 至少包含锁文件、Node/包管理器版本、相关源码和环境配置；缓存 miss 时任务必须仍能从零完成，不能把缓存当必需制品。

依赖缓存与构建 artifact 不同：前者可丢弃并重建，后者是一次受控构建的输出。推荐“build once, promote many”：测试通过后保存带 commit SHA 的不可变产物，预发和生产提升同一制品，避免两个环境各自重新构建出不同内容。

## 七、发布、回滚与数据库协作

前端静态资源使用内容哈希并长期缓存，HTML/manifest 保持可更新；部署先上传新资源再切入口，并保留旧 chunk，避免打开很久的页面动态 import 404。Source Map 私有上传并绑定 release。灰度期间同时观察错误率、Web Vitals 和核心业务成功率。

前后端不能假设同时上线。API 变更采用 expand/contract：先让服务端同时兼容新旧字段，再发布前端，确认旧客户端消失后才删除旧字段。故障时回滚前端不应要求数据库回滚；破坏性迁移必须单独设计恢复方案。

## 八、供应链与 CI 权限

CI 会执行依赖脚本和第三方 Action，权限往往高于开发机。锁定依赖和 Action 版本、最小化 `GITHUB_TOKEN` 权限、区分不可信 PR 与有 secrets 的部署 job。缓存可能被读取或投毒，不存凭证，只允许受信任触发器写入高权限流程会执行的缓存。

依赖升级 PR 同时审查新增传递依赖、许可证、安装脚本和 bundle 变化。漏洞扫描是信号，不是“零告警才安全”：结合可达性、暴露面和修复版本定优先级，并记录暂缓理由和期限。

## 九、常见坑与排障

- 只在本地 hook 跑检查，CI 没门禁，`--no-verify` 后问题直接合入。
- 缓存 key 不含锁文件或构建配置，恢复出过期产物并产生幽灵错误。
- Monorepo 所有变更全量构建，流水线随包数量线性变慢；根据任务图筛选 affected packages。
- 部署时覆盖旧 hash 资源或先删后传，旧页面加载异步 chunk 失败。
- CI 使用长期云密钥和默认写权限；改用环境保护、最小权限和短期 OIDC 凭证。
- 追求 100% 覆盖率，却没有权限、迁移、竞态和回滚的高风险测试。

## 十、工程化决策清单

1. 单仓单包先保持简单，出现多个独立包/应用和原子提交需求再引入 workspace。
2. 固定 Node、pnpm 和锁文件；CI 从干净环境用 frozen install 验证。
3. 格式化、lint、type、unit、E2E、build 按反馈速度分层，本地快检、CI 完整门禁。
4. 缓存可再生数据，artifact 保存待提升制品；二者都不含 secrets。
5. 发布具备预览、灰度、监控、不可变版本和一键回滚，前后端协议向后兼容。
6. 每条流程有 owner、失败提示和文档；删除长期无收益的仪式，保留可验证的风险控制。

## 十一、质量门禁清单

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
- GitHub Actions 缓存安全：<https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching>
- GitHub Actions 安全加固：<https://docs.github.com/en/actions/reference/security/secure-use>
