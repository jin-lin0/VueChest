---
group: 架构与设计
order: 31
---

# 低代码与可视化搭建

> "拖拽生成页面"背后是 Schema 驱动渲染。本文讲清低代码平台的核心原理、Schema 协议、动态渲染与 Vue 集成，以及它的适用边界，补前端工程化视角（配合 `component-library.md` / `design-token.md`）。

## 一、低代码是什么

低代码（Low-Code）用**可视化 + 配置**替代手写的重复性 UI 开发：拖组件、配属性、绑数据，产出可运行页面。核心是"用数据描述 UI"。

## 二、核心原理：Schema 驱动

页面被描述成一份 **Schema（JSON）**，渲染器把它翻译成组件树：

```json
{
  "type": "Form",
  "props": { "title": "登录" },
  "children": [
    { "type": "Input", "field": "username", "label": "用户名" },
    { "type": "Button", "action": "submit", "text": "提交" }
  ]
}
```

渲染器递归遍历 Schema，按 `type` 映射到真实组件并注入 `props`，实现"配置即页面"。

## 三、渲染器（Vue 示例）

```vue
<template>
  <component :is="compMap[node.type]" v-bind="node.props">
    <SchemaNode v-for="c in node.children" :node="c" />
  </component>
</template>
<script setup>
import { Input, Button, Form } from '@/components'
const compMap = { Input, Button, Form }
</script>
```

- `compMap` 注册可用组件（与项目组件库对齐，见 `component-library.md`）。
- 属性面板改 Schema → 渲染器响应式重渲染，所见即所得。

## 四、关键模块

- **物料（Materials）**：可被拖入的组件，需统一协议（props/事件/数据源）。
- **画布（Canvas）**：拖拽 + 选中 + 属性编辑，常基于 `dnd`（拖放）库。
- **Schema 编辑器 / 出码**：导出 JSON，或"出码"生成标准 Vue/React 源码。
- **数据源绑定**：组件字段绑定 API/变量（见 `http-network.md`）。

## 五、与 VueChest 的衔接

- 现有 `src/components`（common/business）即天然"物料库"，统一 `import {X} from '@/components'` 便于低代码注册。
- `tokens.css` 提供主题变量，搭建出的页面天然支持暗色（见 `design-token.md`）。
- 市场 App 的某些配置化场景（如应用信息表单）可用 Schema 描述，降低重复开发。

## 六、适用与边界

- **适合**：中后台 CRUD 表单、活动页、配置化面板——结构规整、重复度高。
- **不适合**：强交互/复杂动效/独特业务逻辑（如游戏、编辑器），硬上低代码反而更慢。
- **陷阱**：被平台绑定难导出；过度灵活导致"配置比写代码还复杂"；生成的代码可读性差。
- 折中：**Pro-Code + 低代码混合**，固定复杂部分手写、可变部分搭建。

## 七、常见坑

- **物料协议不统一**：属性命名各异，渲染器难通用 → 定统一组件契约。
- **Schema 失控膨胀**：一个页面 JSON 上万行，难维护 → 拆分/模板化。
- **出码质量差**：生成代码无类型/无规范 → 设代码规范与格式化。

## 八、Schema 不是任意 JSON

生产级 Schema 必须有稳定 ID、版本、组件白名单、属性 schema 和迁移协议。编辑器保存前做结构校验，渲染器仍要防御未知 type、无效 props、过深树和循环引用。组件版本升级时，通过逐版本 migration 把旧文档转换到当前结构，不能要求所有历史页面一起重做。

```ts
interface PageSchema {
  schemaVersion: 2
  id: string
  root: SchemaNode
}

interface SchemaNode {
  id: string
  type: 'Form' | 'Input' | 'Button'
  props: Record<string, unknown>
  children?: SchemaNode[]
}

function migratePage(input: unknown): PageSchema {
  const parsed = validateKnownSchema(input)
  return parsed.schemaVersion === 1 ? migrateV1ToV2(parsed) : parsed
}
```

节点 ID 用于选中、拖拽、评论和增量更新，不能依赖数组下标。Schema 中保存声明式意图，不保存组件实例、函数或 DOM；否则无法序列化、审计和跨端渲染。

## 九、表达式与安全边界

低代码常需要条件显示、字段联动和数据转换，但绝不能把配置字符串直接交给 `eval`/`new Function`。表达式语言应有受限语法树、变量作用域、函数 allowlist、执行超时和复杂度上限。远程 Schema、富文本、URL 和组件 props 都是不可信输入，渲染前要校验和清洗。

数据源凭证不能进入页面 Schema。浏览器只请求宿主提供的受控连接器，后端执行鉴权、字段过滤、限流和审计。发布权限、预览权限与数据权限分开设计；“能编辑页面”不等于“能读取任意业务 API”。

## 十、编辑器状态与发布链路

拖拽过程适合命令模式：每个操作记录 apply/undo，支持撤销重做和批量事务。大 Schema 不要每次改动都深拷贝整棵树，可用规范化节点表、结构共享或 patch。自动保存带 revision，服务端用乐观锁检测多人覆盖。

发布采用“草稿—校验—预览—不可变版本—上线指针”流程。线上运行固定版本，编辑器继续修改草稿不会影响用户；出现故障只需把指针切回上一版本。运行时监控应带 page/schema/component 版本，才能定位某个物料升级造成的批量问题。

## 十一、平台选型清单

1. 页面是否高度重复且能被有限物料描述？若主要是独特交互，保留 Pro-Code。
2. 先定义 Schema、物料和事件契约，再做拖拽 UI；编辑器不能成为协议本身。
3. 明确表达式、数据源、上传和自定义代码的信任边界，默认拒绝危险能力。
4. 设计 schema/component 版本、迁移、预览、灰度和回滚链路。
5. 验证大页面的编辑性能、运行性能、无障碍和移动端适配。
6. “出码”要明确目标：可读源码、运行产物或平台锁定的 Schema，三者权衡不同。

## 十二、小结

- 低代码 = Schema（JSON）驱动渲染，配置即页面。
- 渲染器递归映射 `type→组件`，属性面板改 Schema 即所见即所得。
- 适合中后台/表单类，不适合强交互；用项目组件库做物料、tokens 做主题。

## 参考来源

- 阿里低代码引擎（LowCode Engine）：<https://lowcode-engine.cn/>
- 美团装修式搭建实践：<https://tech.meituan.com/>
- Schema 驱动 UI 理念：<https://www.smashingmagazine.com/>
- JSON Schema：<https://json-schema.org/specification>
- Vue 动态组件：<https://vuejs.org/guide/essentials/component-basics.html#dynamic-components>
- OWASP 输入验证：<https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html>
