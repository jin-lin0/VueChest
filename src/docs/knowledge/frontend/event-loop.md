---
group: JavaScript 基础
order: 4
---

# 事件循环与宏微任务

> 适用场景：理解「为什么 setTimeout 比 Promise.then 晚」、避免微任务死循环卡 UI。本文配合 `js-modern` 的并发章节。
> 阅读前提：Promise、async/await（见 `js-modern`）。

JS 是**单线程**的，但能「同时」处理网络、定时、渲染——靠的是**事件循环（Event Loop）**把「同步代码」和「异步回调」调度起来。

## 一、核心组成

```
┌─────────────────────────────────────────────┐
│                  调用栈 (Call Stack)          │  ← 同步代码、函数调用，后进先出
│                                               │
│   宏任务队列 (Macrotask Queue)                 │  ← setTimeout / setInterval / IO / UI 事件
│   微任务队列 (Microtask Queue)                 │  ← Promise.then / queueMicrotask / async 后续
└─────────────────────────────────────────────┘
                       ▲
                 事件循环 (Event Loop) 不断：取一个宏任务 → 清空所有微任务 → 渲染 → 再取下一宏任务
```

## 二、一次循环的节奏

1. 执行**当前宏任务**（如一段同步脚本，或某个 `setTimeout` 回调）。
2. 该宏任务跑完后，**把微任务队列一次性清空**（所有 `Promise.then`/`queueMicrotask` 按入队顺序执行）。
3. 微任务清空后，必要时**渲染一帧**（浏览器决定）。
4. 取**下一个宏任务**，重复。

> 关键：**微任务优先级高于下一个宏任务，且在渲染前执行完**。所以 `Promise.then` 总在 `setTimeout(0)` 之前跑。

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
  await null          // 以下变微任务
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

## 七、Node 与浏览器的差异

- Node 的宏任务更复杂（有 `process.nextTick` 队列 + `Timers/I/O/Check` 多个阶段）；`nextTick` 比微任务还优先。
- 浏览器只有「宏任务 / 微任务 / 渲染」三层模型，相对简单。
- 面试常问：浏览器下 `Promise` 微任务 vs `setTimeout` 宏任务排序；Node 下 `nextTick` vs `Promise`。

## 参考来源

- MDN 并发模型与事件循环：<https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Event_loop>
- HTML 规范事件循环：<https://html.spec.whatwg.org/multipage/webappapis.html#event-loop>
- Jake Archibald《Tasks, microtasks, queues》：<https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/>
