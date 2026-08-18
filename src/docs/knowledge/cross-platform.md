# 跨端开发选型

> "一套代码多端运行"是长期诉求。但跨端方案各有代价：性能、体验、生态、团队技能不可兼得。本文横向对比主流方案，帮你按团队与目标选，而不是盲目追"大一统"。

## 一、方案地图

| 方案 | 技术 | 目标端 | 渲染 | 性能 | 适用 |
| --- | --- | --- | --- | --- | --- |
| **React Native** | JS/TS + React | iOS / Android | 原生组件 | 高 | 原生感强的 App |
| **Flutter** | Dart | iOS / Android / Web / 桌面 | 自绘 Skia | 很高 | 高度一致 UI、动效 |
| **小程序** | 各平台 DSL | 微信/支付宝等 | 平台 WebView | 中 | 国内流量入口 |
| **Taro / uni-app** | React/Vue → 小程序+App | 小程序/H5/App | 多端编译 | 中 | 国内多端业务 |
| **Electron / Tauri** | Web 技术 | 桌面（Win/Mac/Linux） | Chromium/系统 WebView | 中/高 | 桌面工具 |
| **PWA** | Web | 所有（装到桌面） | 浏览器 | 中 | 轻量"安装感" |

## 二、React Native（RN）

- 用 React 写 UI，映射到**原生组件**（非 WebView），体验接近原生。
- 生态成熟（Meta 背书），热更新（CodePush）方便；新架构（Fabric/JSI）打通 JS↔原生直接通信，性能更好。
- 代价：原生模块桥接成本高，复杂动效/平台差异仍需 native 补。

## 三、Flutter

- Dart + 自绘引擎（Skia/Impeller），**一套渲染跨端像素级一致**，动效强、性能好。
- 不依赖平台组件，UI 完全可控；Hot Reload 极佳。
- 代价：Dart 学习成本；包体偏大；平台原生能力靠 plugin，深度集成不如 RN 顺。

## 四、小程序与多端框架（国内）

- 国内业务常需微信/支付宝/抖音小程序 + H5 +  App 多端。
- **Taro**（React/Vue 语法编译到多端）、**uni-app**（Vue 语法）降低多端重复开发。
- 代价：各平台能力不齐，需用条件编译（`process.env.TARO_ENV`）补差异；性能受 WebView 制约。

## 五、桌面：Electron vs Tauri

- **Electron**：Chromium + Node，Web 技术直接搬，生态大；代价是包体大（~100MB+）、内存高。
- **Tauri**：Rust + 系统 WebView，包体小（~10MB）、安全好；代价是需 Rust、WebView 行为随系统略有差异。

## 六、选型决策

- 要做**强原生感 App** → RN（团队会 React）或 Flutter（要极致一致/动效）。
- **国内多端业务**（小程序为主）→ Taro / uni-app。
- **桌面工具** → Electron（快）或 Tauri（轻/安全）。
- **轻量可安装** → PWA，零额外打包。
- 团队是 Vue 栈 → Taro/uni-app/Electron 比 RN 更顺手。

## 七、通用坑

- **平台差异**：权限、字体、状态栏、刘海屏，多端都要单独适配。
- **性能误判**：WebView 类方案复杂列表易卡，需虚拟列表/原生组件兜底。
- **"一套代码"幻觉**：业务越复杂，条件编译与平台补丁越多，维护成本上升。
- **热更新合规**：应用商店对热更新有限制（尤其 iOS），需注意审核政策。

## 八、小结

- 没有"完美大一统"：体验/性能/生态/团队技能要权衡。
- RN（原生感）/ Flutter（一致动效）/ Taro·uni（国内多端）/ Electron·Tauri（桌面）。
- 跨端省的是"重复 UI 代码"，平台能力与体验差异仍需各自打磨。

## 参考来源

- React Native 文档：<https://reactnative.dev/>
- Flutter 文档：<https://docs.flutter.dev/>
- Taro 文档：<https://taro-docs.jd.com/>
- Tauri 文档：<https://tauri.app/>
- Electron 文档：<https://www.electronjs.org/docs>
