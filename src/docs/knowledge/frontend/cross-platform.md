---
group: 架构与设计
order: 29
---

# 跨端开发选型

> 跨端的价值是复用业务能力和工程体系，不是承诺 100% 共用 UI。选型时应同时衡量目标端、体验上限、原生能力、团队技能、发布治理和长期维护成本。

## 一、先定义“复用什么”

跨端项目通常可以复用四层内容：

1. **领域核心**：类型、校验、计算规则、API client、状态机，最值得复用。
2. **设计系统**：token 和交互规范可以共享，具体组件实现未必共享。
3. **页面与组件**：取决于渲染模型和平台差异，复用率不应预先当 KPI。
4. **平台外壳**：权限、通知、文件、支付、后台任务、窗口与发布必须保留适配层。

合理架构通常是“共享核心 + 薄平台壳”，而不是在业务代码里散落大量 `if (ios)`。

## 二、主流方案地图

| 方案           | 主要语言/范式   | 目标端                  | UI 路径                 | 更匹配的场景                         |
| -------------- | --------------- | ----------------------- | ----------------------- | ------------------------------------ |
| React Native   | JS/TS + React   | iOS / Android           | 框架组件映射到平台视图  | React 团队、需要原生交互与原生模块   |
| Flutter        | Dart            | 移动 / Web / 桌面       | Flutter 引擎绘制        | 强品牌一致性、复杂自定义 UI 与动效   |
| Taro / uni-app | React/Vue 风格  | 多类小程序 / H5 / App   | 编译或运行到各平台能力  | 国内多小程序渠道、已有前端团队       |
| Electron       | Web + Node.js   | Windows / macOS / Linux | 自带 Chromium           | Web 生态依赖重、要求版本一致的桌面端 |
| Tauri          | Web + Rust 后端 | 桌面及其支持的平台      | 系统 WebView + 原生命令 | 重视安装体积与最小权限的桌面应用     |
| PWA            | Web 标准        | 支持现代浏览器的平台    | 浏览器 / 可安装 Web     | 链接分发、离线增强、迭代速度优先     |

表中的“更匹配”不是绝对性能排名。同一方案的列表实现、桥接频率、图片处理、设备能力与团队经验，往往比框架标签更影响真实体验。

## 三、移动端：React Native 与 Flutter

React Native 使用 React 声明 UI，并通过其新架构中的 Fabric、Turbo Native Modules 等机制与平台能力协作。它的优势是 JS/TS 和 React 生态可复用；代价是团队仍需理解 iOS/Android 生命周期、构建系统和原生调试。

Flutter 由框架和引擎控制大部分渲染，适合需要高度一致视觉和自绘能力的产品。Impeller 等渲染能力的实际启用范围应以目标平台和当前 Flutter 版本为准。它的代价不仅是学习 Dart，还包括插件质量、原生 SDK 集成和平台无障碍行为的验证成本。

二者都不是“无需原生工程师”。涉及支付、地图、蓝牙、推送、后台定位或复杂音视频时，应提前做最小原型，验证权限、生命周期和商店政策。

## 四、小程序与国内多端框架

Taro、uni-app 可以复用 Vue/React 心智，把应用编译或适配到多类小程序和 H5。主要挑战是各平台的组件、分包、隐私授权、登录、支付和审核规则不一致。

建议用能力矩阵管理差异：行是业务能力，列是微信、支付宝、H5、App；每格记录“原生支持、适配实现、降级方案、不可用”。条件编译只放在平台适配层，避免同一页面被宏判断切得难以测试。

## 五、桌面：Electron、Tauri 与 PWA

Electron 自带 Chromium 与 Node.js，渲染一致、Web/Node 生态丰富，但资源占用和更新包成本需要实际测量。安全设计必须保持 `contextIsolation`，通过受限 preload API 暴露能力，不能让远程内容直接获得 Node 权限。

Tauri 使用系统 WebView，并通过 command/capability 等边界调用 Rust 或原生能力。它通常能减少随应用分发的浏览器运行时，但不同系统 WebView 版本仍需要兼容测试；“用了 Rust”也不自动等于安全。

PWA 的分发成本最低，可提供安装、离线和推送等渐进增强能力，但可用 API、后台行为和商店入口受浏览器与操作系统限制。若核心需求依赖稳定的系统级能力，应先验证目标平台，而不是只看规范列表。

## 六、共享核心与能力适配器

业务层只依赖稳定接口，平台工程提供实现：

```ts
export interface FilePort {
  pickTextFile(): Promise<{ name: string; content: string } | null>
  saveTextFile(name: string, content: string): Promise<void>
}

export function createDocumentService(filePort: FilePort) {
  return {
    async importDocument() {
      const file = await filePort.pickTextFile()
      if (!file) return null
      return { title: file.name, body: file.content.trim() }
    },
    exportDocument(title: string, body: string) {
      return filePort.saveTextFile(`${title}.md`, body)
    },
  }
}
```

Web 实现可以使用 File System Access API 或 `<input type="file">` 降级；Electron 实现通过 preload 桥接；移动端实现调用平台插件。这样领域测试不需要启动真机，权限差异也集中在一处。

```ts
export const webFilePort: FilePort = {
  async pickTextFile() {
    const [handle] = await window.showOpenFilePicker({
      types: [{ accept: { 'text/plain': ['.txt', '.md'] } }],
    })
    const file = await handle.getFile()
    return { name: file.name, content: await file.text() }
  },
  async saveTextFile(name, content) {
    const handle = await window.showSaveFilePicker({ suggestedName: name })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  },
}
```

上例 API 并非所有浏览器都支持，生产代码必须做特性检测并提供下载兜底。这正是能力适配器存在的意义。

## 七、选型检查清单

在比较框架前先回答：

- [ ] 首发和两年内必须支持哪些系统、设备和商店？
- [ ] 哪些体验是核心壁垒：启动、滚动、动效、离线、后台还是系统集成？
- [ ] 必须接入哪些原生 SDK，它们是否有维护可靠的插件？
- [ ] 团队能否调试原生构建、签名、崩溃和性能问题？
- [ ] 是否允许热更新，审核政策和安全策略如何限制它？
- [ ] 设计系统需要视觉一致，还是更需要遵循各平台习惯？
- [ ] CI 是否覆盖多系统构建，真机和可访问性测试预算是否足够？
- [ ] 退出成本如何：共享核心能否脱离当前框架继续使用？

先为最高风险能力做 1～2 周技术验证，使用接近生产的数据量、最低支持设备和真实插件。不要用 Todo Demo 的流畅度做几年架构决策。

## 八、发布、更新与安全

跨端工程至少要管理以下边界：

- **版本协议**：客户端版本、服务端 API、数据迁移和灰度开关需兼容。
- **签名密钥**：证书和商店凭据只进入受控 CI，不写入仓库或前端包。
- **更新回滚**：桌面自动更新、移动商店版本和 Web 发布的节奏不同，要能暂停和回滚。
- **最小权限**：相机、文件、剪贴板、位置等只在使用时申请，并解释用途。
- **桥接安全**：Web 内容不能获得任意文件系统或 shell 能力；平台调用要校验参数和来源。
- **隐私合规**：SDK 清单、采集目的、用户同意和删除路径在每个平台逐项验证。

测试应形成金字塔：共享核心做单元测试，适配器做契约测试，关键平台流程做真机 E2E，性能在最低支持设备上建立基线。

## 九、常见坑与应对

- **追求虚假的 100% 复用率**：条件分支侵入业务，最终每个平台都难维护。
- **只比较包体或跑分**：忽略插件成熟度、招聘、构建稳定性和审核成本。
- **把 Web UI 原样搬到所有端**：桌面键盘、移动返回手势和小程序导航习惯不同。
- **平台 API 直接散落页面**：难以 mock、降级和替换，应收敛到 capability adapter。
- **只在旗舰机测试**：低端 Android、旧 WebView、弱网和大字体更容易暴露问题。
- **热更新越过审核边界**：能动态下发不等于平台政策允许，必须核对当前商店规则。
- **忽略无障碍**：自绘或跨端组件仍要验证语义、焦点、读屏和动态字体。

## 十、小结

跨端选型不是“哪个框架最快”，而是“哪个方案能以可控成本达到关键平台体验”。优先复用领域核心和设计约束，用适配器隔离平台能力；再通过风险原型、真机指标、发布治理和退出成本做决策。

## 参考来源

- React Native Architecture：<https://reactnative.dev/architecture/landing-page>
- Flutter Architecture：<https://docs.flutter.dev/resources/architectural-overview>
- Taro 官方文档：<https://docs.taro.zone/docs/>
- Electron Security：<https://www.electronjs.org/docs/latest/tutorial/security>
- Tauri Architecture：<https://v2.tauri.app/concept/architecture/>
- web.dev Progressive Web Apps：<https://web.dev/explore/progressive-web-apps>
