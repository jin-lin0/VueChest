---
group: 架构与设计
order: 30
---

# WebAssembly 入门

> 当 JS 在图像/视频/加密/物理仿真等密集计算上吃力时，WebAssembly（Wasm）把 C/Rust/Go 编译成接近原生的字节码跑在浏览器。本文讲清它是什么、怎么和 JS 协作、何时该用。

## 一、Wasm 是什么

WebAssembly 是一种**可移植的二进制指令格式**，设计为高级语言（C/C++/Rust/Go…）的编译目标，在浏览器（或 Node/边缘运行时）中以接近原生速度执行。它不是用来替代 JS，而是**补足 JS 不擅长的密集计算**。

## 二、为什么快

- 二进制格式体积小、解析快。
- 静态类型 + 线性内存，JIT 友好，无 JS 的动态类型开销。
- 核心执行具有内存安全边界，宿主能力必须通过 import 暴露；在浏览器中仍遵循同源与权限策略。

Wasm 不保证一定比优化后的 JS 快。跨 JS/Wasm 边界、复制字符串/对象、启动编译和更大的下载都可能抵消计算收益。只有用真实输入定位 CPU 热点并做端到端 benchmark，才能证明值得迁移。

## 三、与 JS 的关系（互补，不是替代）

```text
JS 负责：DOM、UI、事件、网络、生态调用
Wasm 负责：CPU 密集计算（编解码、图像处理、加密、仿真）
```

二者通过 **线性内存（Linear Memory）** 和导入/导出函数通信：JS 把数据写入 Wasm 内存，调用导出函数，再读回结果。

## 四、一个最小例子（Rust → Wasm）

```rust
// lib.rs
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 { a + b }
```

```bash
wasm-pack build --target web
```

```js
// JS 侧
import init, { add } from './pkg/my_lib.js'
await init()
console.log(add(2, 3)) // 5
```

工具链：`Emscripten`（C/C++）、`wasm-pack` / `wasm-bindgen`（Rust）、`TinyGo`（Go）。

## 五、典型应用场景

| 场景                  | 说明                     |
| --------------------- | ------------------------ |
| 音视频/图像编解码     | ffmpeg.wasm、图像压缩    |
| 加密 / 哈希           | 高性能签名、区块链客户端 |
| 游戏 / 物理仿真       | Unity/Bevy 导出 Wasm     |
| 设计工具              | Figma（C++ 编译为 Wasm） |
| 边缘计算 / Serverless | 沙箱化、秒级启动         |

> VueChest 的 Canvas/WebGL 游戏类 App（见 `canvas-webgl.md`）若要做复杂物理/粒子计算，可考虑把热路径用 Wasm 实现。

## 六、何时**不**该用

- 主要瓶颈是 DOM 操作 / 网络延迟 → Wasm 帮不上（它碰不了 DOM）。
- 逻辑简单、一次性计算 → JS 足够，引入 Wasm 增加构建复杂度。
- 团队没有 C/Rust 经验 → 学习成本可能高于收益。

## 七、局限与现状

- 不能直接操作 DOM，必须经由 JS。
- Wasm 3.0 已纳入 GC、64 位地址空间、typed references 和 tail calls 等能力，但具体浏览器/运行时支持并不完全同步，发布前要 feature detect。
- 调试体验弱于 JS；包体、内存管理要自己把控。
- WASI 让 Wasm 跑在服务器端/边缘，超越浏览器。

## 八、加载、缓存与降级

服务器应以 `application/wasm` 返回模块，浏览器可用 `WebAssembly.instantiateStreaming()` 边下载边编译；MIME 配置错误时再回退到 ArrayBuffer。初始化、模块下载和业务调用分别记录耗时，避免只测核心函数。

```js
async function loadWasm(url, imports = {}) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  if (WebAssembly.instantiateStreaming) {
    try {
      return await WebAssembly.instantiateStreaming(response.clone(), imports)
    } catch {
      // MIME 或环境不支持时回退
    }
  }
  return WebAssembly.instantiate(await response.arrayBuffer(), imports)
}
```

文件名使用内容哈希做长期缓存，JS glue 与 wasm 必须来自同一版本。低端设备编译失败、缺少 SIMD/threads 或内存不足时提供 JS/服务端降级，而不是直接白屏。

## 九、内存与边界成本

线性内存本质是 ArrayBuffer。数字数组可用 TypedArray 建视图实现低复制交换；字符串、对象和错误需要 ABI/绑定层编码。`memory.grow()` 后旧 TypedArray 视图可能失效，应重新从 `memory.buffer` 创建。不要在小循环里频繁跨边界调用，把一批数据一次传入再一次取回。

Wasm 的内存边界保护浏览器不被模块随意读写，但模块拥有宿主显式传入的 import。若给它网络、文件或任意 JS 回调，它就获得相应能力；不可信模块仍需最小权限、超时/Worker 隔离、资源上限和来源完整性校验。Wasm 不是“下载任意二进制即可安全执行”的许可证。

线程通常依赖 SharedArrayBuffer，而 Web 页面使用 SharedArrayBuffer 需要跨源隔离相关响应头。多线程能加速可并行计算，也会增加构建、内存和调试成本；先确认单线程热点，再评估线程池。

## 十、常见坑与排障

- 只比较纯算法一次运行，忽略下载、初始化、数据复制和 warm-up。
- 把 DOM 密集逻辑搬进 Wasm，结果仍频繁回调 JS，边界成本更高。
- Rust/C++ 编译默认带入未使用运行时，产物比原 JS 更大；检查 release、LTO 和 size 工具。
- MIME、CSP、CORS 或 CDN 压缩配置错误导致 streaming instantiate 失败。
- 线性内存无限增长或忘记释放语言侧对象，长会话最终 OOM。
- 依赖 SIMD/threads/GC 却没有 feature detection 和 fallback。

## 十一、选型检查清单

1. Performance/Profiler 已证明瓶颈是可独立的 CPU 计算，而非网络、DOM 或 GPU。
2. 用代表性数据比较 JS 与 Wasm 的端到端延迟、内存、包体和低端设备表现。
3. 设计批量 ABI，减少字符串转换和频繁跨边界调用。
4. 明确工具链、调试符号、崩溃上报、feature detect 和降级路径。
5. 不可信模块的 imports、运行时间、内存和来源均受限制。
6. 只有收益超过构建与人才成本时才上线，保留可复现 benchmark。

## 十二、小结

- Wasm 是 JS 的"计算加速器"，不是替代品。
- 适用 CPU 密集、可脱离 DOM 的任务；通过线性内存与 JS 通信。
- 工具链选 Rust（wasm-pack）或 C/Emscripten；JS 负责 IO 与 UI。

## 参考来源

- MDN WebAssembly：<https://developer.mozilla.org/zh-CN/docs/WebAssembly>
- WebAssembly 官方：<https://webassembly.org/>
- WebAssembly 功能状态：<https://webassembly.org/features/>
- Wasm 3.0：<https://webassembly.org/news/2025-09-17-wasm-3.0/>
- Rust wasm-bindgen：<https://rustwasm.github.io/docs/wasm-bindgen/>
- WASI：<https://wasi.dev/>
