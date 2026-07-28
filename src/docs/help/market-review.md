# 审核与发布流程

本章说明应用上传到 VueChest 应用市场之后，是如何从"待审核"变为"已上架"的。核心结论先放在这里：**用户上传的应用并不会立即可见，需等待管理员审核通过后才会正式上架。**

## 整体流程

```
用户上传应用(.js)
      │
      ▼
  [待审核]  status = pending
      │   管理员在后台查看
      ├──────────────► [已拒绝] status = rejected
      │                 POST /api/market/apps/:id/reject
      ▼
  [审核通过]  status = approved
      │   POST /api/market/apps/:id/approve
      ▼
  [已上架]  出现在市场中，其他用户可浏览 / 安装
```

> 应用状态共有三种：`pending`（待审核）/ `approved`（已通过、上架）/ `rejected`（已拒绝）。

## 1. 上传后：进入待审核状态

当用户在 `/market/upload` 成功提交应用后（参见 [如何上传应用到市场](./market-upload.md)），应用记录会被创建，并处于**待审核**状态。此时页面会提示：

> "发布成功！…… 等待管理员审核"

处于待审核状态的应用**不会**出现在公开的市场列表 / 详情接口中，普通用户暂不可见。

## 2. 管理员审核

管理员在后台对提交的应用进行人工审核，主要检查：

- 应用包是否为有效的市场应用（能解析出 `default.{component, route, meta}`，见 [应用包开发规范](./market-spec.md)）。
- 应用内容是否合规、是否可正常运行。
- 分类、名称、描述等基本信息是否合理。

## 3. 审核通过（approve）

管理员确认无误后，调用审核通过接口：

```
POST /api/market/apps/:id/approve
```

> 注意：该接口受 `adminOnly` 中间件保护，需要 `admin` / `super_admin` 角色。普通用户无权限调用。同理，拒绝（`/reject`）、更新（`PUT /apps/:id`）、删除（`DELETE /apps/:id`）也都是管理员接口。

审核通过后，应用的 `status` 更新为已上架（公开可用），随后：

- 应用会进入公开列表接口 `GET /api/market/apps`（按分类 / 关键词 / 分页查询）。
- 应用详情接口 `GET /api/market/apps/:id` 对外可见。
- 其他用户可以通过 `GET /api/market/apps/:id/download` 获取 bundle 地址并安装（见 [安装与使用](./market-install.md)）。

## 4. status 与 approve 流程小结

| 阶段               | 状态 / 操作               | 可见性                      |
| ------------------ | ------------------------- | --------------------------- |
| 用户上传成功       | 进入**待审核**状态        | 仅提交者 / 管理员可见       |
| 管理员审核         | 人工核查                  | 仍不可见                    |
| 调用 `:id/approve` | 状态变为 `approved`、上架 | 对所有用户可见、可安装      |
| 调用 `:id/reject`  | 状态变为 `rejected`       | 不上架；提交者 / 管理员可见 |

> 提示：如果你上传的应用长时间未上架，请耐心等待审核；如确有必要，可联系管理员确认。审核时长请参见 [常见问题 FAQ](./faq.md)。

## 5. 官方应用的发布路径

平台维护者如需发布官方应用，可绕过普通上传流程，使用开发者脚本直接构建并发布上架：

- `npm run build:market` —— 构建市场 app（`scripts/build-market-apps.mjs`）。
- `npm run publish:market` —— 发布到 R2 并调用 `approve` 上架（`scripts/publish-market-apps-r2.mjs`）。

## 相关文档

- [如何上传应用到市场](./market-upload.md)
- [应用包开发规范](./market-spec.md)
- [安装与使用](./market-install.md)
- [常见问题 FAQ](./faq.md)
