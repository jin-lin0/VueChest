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

## 八、小结

- 低代码 = Schema（JSON）驱动渲染，配置即页面。
- 渲染器递归映射 `type→组件`，属性面板改 Schema 即所见即所得。
- 适合中后台/表单类，不适合强交互；用项目组件库做物料、tokens 做主题。

## 参考来源

- 阿里低代码引擎（LowCode Engine）：<https://lowcode-engine.cn/>
- 美团装修式搭建实践：<https://tech.meituan.com/>
- Schema 驱动 UI 理念：<https://www.smashingmagazine.com/>
