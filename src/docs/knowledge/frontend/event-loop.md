---
group: JavaScript 基础
order: 4
---

# 事件循环与宏微任务

> 适用场景：理解「为什么 setTimeout 比 Promise.then 晚」、避免微任务死循环卡 UI。本文配合 `js-modern` 的并发章节。
> 阅读前提：Promise、async/await（见 `js-modern`）。

浏览器页面中的 JavaScript 主线程通常一次只执行一个调用栈，但网络、计时和其他线程可以并行工作；完成后的回调由**事件循环（Event Loop）**安排回主线程。Web Worker 拥有自己的线程与事件循环，因此“JS 单线程”是对单个执行代理的简化，不是整个浏览器只有一个线程。

## 一、核心组成

```
┌─────────────────────────────────────────────┐
│                  调用栈 (Call Stack)          │  ← 同步代码、函数调用，后进先出
│                                               │
│   任务队列 (Task Queues)                       │  ← setTimeout / UI 事件等不同任务源
│   微任务队列 (Microtask Queue)                 │  ← Promise.then / queueMicrotask / async 后续
└─────────────────────────────────────────────┘
                       ▲
                 事件循环：执行任务 → microtask checkpoint → 可能渲染 → 下一任务
```

## 二、一次循环的节奏

1. 执行**当前宏任务**（如一段同步脚本，或某个 `setTimeout` 回调）。
2. 该宏任务跑完后，**把微任务队列一次性清空**（所有 `Promise.then`/`queueMicrotask` 按入队顺序执行）。
3. 微任务清空后，浏览器在合适的 rendering opportunity **可能渲染**，不是每个任务后都必然绘制。
4. 取**下一个宏任务**，重复。

> 在同一段同步脚本中已排入的 Promise reaction 通常会在后续 timer task 前执行；但不同 task source 的选择、I/O 和跨环境顺序不能只背一句“微任务优先级更高”。规范术语是 task，macrotask 是教学中的常用叫法。

## 三、经典排序题

```js
console.log('1 同步')
setTimeout(() => console.log('4 setTimeout(宏)'), 0)
Promise.resolve().then(() => console.log('3 Promise(微)'))
console.log('2 同步')
// 输出：1 → 2 → 3 → 4
```

解析：同步代码先跑（1、2）；同步结束后清空微任务（3）；再取下一个宏任务（4）。

## 四、async/await 本质

`async` 函数里的 `await` 之后的代码，等价于包进 `Promise.then`（即一个微任务）：

```js
async function f() {
  console.log('a')
  await null // 以下变微任务
  console.log('c')
}
console.log('x')
f()
console.log('y')
// 输出：x → a → y → c
```

> `await` 让出线程，后面的 `c` 排进微任务队列，所以在 `y` 之后才跑。

## 五、微任务死循环（真实坑）

```js
// ❌ 危险：微任务里又塞微任务，永远清空不完 → 宏任务(含渲染)饿死 → 页面卡死
function loop() {
  Promise.resolve().then(loop)
}
loop()
```

```js
// ✅ 改成宏任务：每轮让出，渲染/事件有机会执行
function loop() {
  setTimeout(loop, 0)
}
loop()
```

> 教训：**别在微任务里无限产生微任务**。需要「持续调度」用 `setTimeout`/`requestAnimationFrame` 这类宏任务，给渲染和用户输入留空隙。

## 六、与渲染/性能的关系

- 浏览器大致「每 16.7ms（60fps）渲染一帧」，渲染发生在宏任务之间。
- 一段超长同步代码（长任务）会阻塞调用栈 → 期间无法处理用户输入、无法渲染 → 页面「假死」。
- 对策：见 `perf-frontend` —— 用 `requestIdleCallback`、分片、Web Worker 把重活移出主线程。
- `queueMicrotask` 适合「在当前任务结束前、渲染前」做轻量收尾；重活别塞微任务。

`setTimeout(fn, 0)` 也不是立即执行：它只表示达到最小延迟后具备排队资格，主线程忙、后台标签节流和嵌套 timer 最小延迟都会让它更晚。需要下一帧改视觉状态用 `requestAnimationFrame`；非关键后台工作可考虑 `requestIdleCallback` 并提供兼容回退；CPU 密集且可独立的数据处理放 Worker。

```js
function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function processInChunks(items, processItem, chunkSize = 200) {
  for (let start = 0; start < items.length; start += chunkSize) {
    const chunk = items.slice(start, start + chunkSize)
    chunk.forEach(processItem)
    await yieldToMain() // 给输入、渲染和其他任务机会
  }
}
```

分片不会减少总 CPU，只降低单次阻塞；每片大小应以 trace 中的任务时长和设备能力调节。若计算仍很重，Worker 才能真正移出主线程。

## 七、Node 与浏览器的差异

- Node 的事件循环有 timers、poll、check 等阶段，`process.nextTick` 还有独立队列，通常会在 Promise microtask 前被处理；递归 nextTick 同样可能饿死 I/O。
- 浏览器只有「宏任务 / 微任务 / 渲染」三层模型，相对简单。
- 不要把某次 Node 实验的 `setTimeout`/`setImmediate` 顺序推广到所有上下文；从主模块和 I/O 回调发起时可能不同，还会受 Node 版本实现影响。

## 八、常见坑与排障

- 在微任务中递归排微任务，页面长期没有渲染和输入机会。
- 认为 `await` 会把 CPU 计算移到后台；只有等待真正异步资源时才释放调用栈，`await Promise.resolve()` 仍是微任务。
- 用大量 `setTimeout(0)` 保证精确顺序；timer 只保证不早于延迟，不保证执行时刻。
- 测试混用 fake timers 和真实 Promise，却只推进 timer 队列，导致断言时机错误。
- 在 rAF 回调中先写 DOM 再读布局，仍触发布局抖动；一帧内也要分离读写。

## 九、调度选型清单

1. 当前调用结束前必须保持顺序的轻量收尾 → `queueMicrotask`。
2. 下一帧视觉更新 → `requestAnimationFrame`，回调内避免重计算。
3. 允许延后且有超时兜底的非关键任务 → idle 调度。
4. 长任务可分片 → 每片主动 yield；可独立 CPU 计算 → Web Worker。
5. 需要取消时显式传 `AbortSignal` 或任务 ID，调度 API 本身不解决竞态。
6. 用 Performance trace 验证任务、微任务和渲染时序，不用日志顺序猜性能。

## 参考来源

- MDN 并发模型与事件循环：<https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Event_loop>
- HTML 规范事件循环：<https://html.spec.whatwg.org/multipage/webappapis.html#event-loop>
- Jake Archibald《Tasks, microtasks, queues》：<https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/>
- Node.js 事件循环：<https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick>
