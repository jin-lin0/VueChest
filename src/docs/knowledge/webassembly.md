# WebAssembly 入门

> 当 JS 在图像/视频/加密/物理仿真等密集计算上吃力时，WebAssembly（Wasm）把 C/Rust/Go 编译成接近原生的字节码跑在浏览器。本文讲清它是什么、怎么和 JS 协作、何时该用。

## 一、Wasm 是什么

WebAssembly 是一种**可移植的二进制指令格式**，设计为高级语言（C/C++/Rust/Go…）的编译目标，在浏览器（或 Node/边缘运行时）中以接近原生速度执行。它不是用来替代 JS，而是**补足 JS 不擅长的密集计算**。

## 二、为什么快

- 二进制格式体积小、解析快。
- 静态类型 + 线性内存，JIT 友好，无 JS 的动态类型开销。
- 在独立沙箱（Wasm 虚拟机）中运行，与 JS 引擎隔离。

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

| 场景 | 说明 |
| --- | --- |
| 音视频/图像编解码 | ffmpeg.wasm、图像压缩 |
| 加密 / 哈希 | 高性能签名、区块链客户端 |
| 游戏 / 物理仿真 | Unity/Bevy 导出 Wasm |
| 设计工具 | Figma（C++ 编译为 Wasm） |
| 边缘计算 / Serverless | 沙箱化、秒级启动 |

> VueChest 的 Canvas/WebGL 游戏类 App（见 `canvas-webgl.md`）若要做复杂物理/粒子计算，可考虑把热路径用 Wasm 实现。

## 六、何时**不**该用

- 主要瓶颈是 DOM 操作 / 网络延迟 → Wasm 帮不上（它碰不了 DOM）。
- 逻辑简单、一次性计算 → JS 足够，引入 Wasm 增加构建复杂度。
- 团队没有 C/Rust 经验 → 学习成本可能高于收益。

## 七、局限与现状

- 不能直接操作 DOM，必须经由 JS。
- 垃圾回收接口（GC 提案）仍在演进，长期运行的对象管理需谨慎。
- 调试体验弱于 JS；包体、内存管理要自己把控。
- WASI 让 Wasm 跑在服务器端/边缘，超越浏览器。

## 八、小结

- Wasm 是 JS 的"计算加速器"，不是替代品。
- 适用 CPU 密集、可脱离 DOM 的任务；通过线性内存与 JS 通信。
- 工具链选 Rust（wasm-pack）或 C/Emscripten；JS 负责 IO 与 UI。

## 参考来源

- MDN WebAssembly：<https://developer.mozilla.org/zh-CN/docs/WebAssembly>
- WebAssembly 官方：<https://webassembly.org/>
- Rust wasm-bindgen：<https://rustwasm.github.io/docs/wasm-bindgen/>
- WASI：<https://wasi.dev/>
