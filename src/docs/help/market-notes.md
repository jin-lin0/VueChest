# 注意事项

在使用 VueChest 应用市场的过程中，请务必了解以下"易错 / 须知"事项。其中部分涉及**安全与技术规范**，请认真对待。

## 1. 文件格式与大小限制

- 应用包**必须是 `.js`（IIFE 格式）**，且**大小不能超过 10MB**。
- 前端会在提交前拦截超大文件或非 `.js` 文件：`if (file.size > 10 * 1024 * 1024) error = '应用包不能超过 10MB'`，文件框限制 `accept=".js"`。
- **服务端同样会强制校验**，且不止一处：
  1. 申请预签名 `POST /api/uploads/presign` 时校验 `contentType`（须为 JS 类型）与 `size`（整数、>0、≤10MB）。
  2. `POST /api/uploads/complete` 时用对象存储的实际大小再次核对 ≤10MB，超限会删除文件并报错。
  3. `POST /api/market/apps` 创建记录时，再次读取对象大小核对 ≤10MB。

> 结论：10MB 是**前后端双重强制约束**，无法通过绕过前端来提交超大包。

## 2. 安全性（非常重要）

> ✅ 市场应用的 JS 代码在运行时被加载进 **iframe 沙箱**（`sandbox="allow-scripts"`，opaque origin）内执行，与 VueChest 主站**完全隔离**。

这意味着市场应用无法直接访问主站 DOM、IndexedDB、localStorage 或同源资源，只能通过 `postMessage` 白名单桥使用受限能力（存储按命名空间隔离、网络默认拒绝）。即便如此，仍请注意：

- **请勿安装来源不明或不可信的应用**。沙箱能限制其"越权"，但应用展示的内容仍可能包含钓鱼 / 诱导信息。
- 沙箱机制详见 [沙箱机制](./market-sandbox.md)；能力边界见 [市场应用可用能力](./market-capabilities.md)。
- 仅从你信任的开发者或官方渠道安装应用；对"官方应用"（`isOfficial`）可相对更放心。

## 3. 必须正确导出定义

应用包必须正确导出 `default.{component, route, meta}`。校验分两个阶段：

- **上传解析阶段**（`extractMetaFromBundle`）：只要能取到 `meta` 即算解析成功、回填应用信息；取不到 `meta` 才提示"**无法解析应用包**"。也就是说，即便缺 `component / route`，只要有 `meta`，上传解析仍可能通过。
- **安装 / 恢复阶段**（`loadMarketApp`）：若缺少 `component / route / meta` 中任一项，会在控制台 `console.warn('Invalid market app definition')` 并**返回 `null`（不抛异常）**，导致应用无法注册路由、无法使用。

因此请务必三者齐全，避免"能上传却装不了"的情况。

## 4. Vue 必须外部化

- `vue` **必须外部化**，不能把 Vue 打进应用包里。
- 运行时 Vue 指向宿主：`window.__VueChest__.Vue`（通过 `output.globals: { vue: 'window.__VueChest__.Vue' }`）。
- 若把 Vue 一起打包，会与原站的 Vue 实例产生冲突，导致应用或主站异常。

> 提示：用到 pinia 时同理，应外部化为 `window.__VueChest__.Pinia`。

## 5. 上传后并非立即可见

- 上传成功仅代表进入**待审核**状态。
- 需要**管理员审核通过**后应用才会正式上架，其他用户才能看到并安装。
- 详情见 [审核与发布流程](./market-review.md)。

## 6. readme 当前以纯文本展示

- 应用详情页的 `readme` 当前**以纯文本展示，尚未渲染 Markdown**。
- 复杂排版（如表格、列表、代码块）建议在**应用内部**或描述字段中说明，不要依赖详情页的 Markdown 渲染。

## 7. 路由路径需全局唯一

- 应用导出的 `route` 路径需要**全局唯一**，避免与内置路由冲突。
- 建议统一以 **`/m/`** 开头（如 `/m/counter`），以降低冲突概率。
- 若路径与已有路由重复，可能导致路由覆盖或无法访问。

## 相关文档

- [应用包开发规范](./market-spec.md)
- [市场应用可用能力](./market-capabilities.md)
- [主题变量与深色模式](./theme-variables.md)
- [如何上传应用到市场](./market-upload.md)
- [安装与使用](./market-install.md)
- [常见问题 FAQ](./faq.md)
