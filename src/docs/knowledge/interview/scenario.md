---
group: 刷题
order: 49
---

# 前端场景题章节

## 概览与准备建议

- **场景题 = "给你一个需求，手写实现"**：防抖/节流、Promise 系、深拷贝、响应式原理、虚拟列表等是绝对高频，几乎必考其一。
- **考察重点不是"背答案"，而是"边界与权衡"**：防抖的 leading/trailing、深拷贝的循环引用与类型、并发控制的队列调度、响应式的依赖收集时机——这些才是区分度所在。
- **前端特色 = 贴近浏览器与框架**：图片懒加载（IntersectionObserver）、虚拟列表、拖拽、剪贴板、MutationObserver 等原生 API 题，考察你是否真的写过业务。
- **框架原理题越来越常见**：手写 mini 响应式、mini Redux、自定义 Hook（useDebounce/useFetch），本质是考察对"数据驱动 UI"的理解。

**优先级速查**

- **第一梯队（几乎必会，能手写到熟练）**：防抖、节流、call/apply/bind、new、深拷贝、Promise.all、并发控制、简易响应式、图片懒加载、虚拟列表。
- **第二梯队（高频，需能手撕 + 讲边界）**：Promise 系（race/allSettled/any/retry）、数组扁平化/去重/柯里化、JSONP、红绿灯交替打印、拖拽、复制到剪贴板、EventEmitter、简易 Redux、useDebounce/useFetch。
- **第三梯队（中频/加分）**：请求超时与取消、按序返回、无限滚动、MutationObserver、XSS 转义、URL 参数解析、DOM 转 JSON、mini diff、单例模式。

---

## 函数与数据工具

### 防抖 debounce

- **频率**：高（几乎必考）
- **核心思路**：事件触发后延迟执行，若在延迟内再次触发则重新计时（n 秒内只执行最后一次）。
- **易错点**：需支持 leading（立即执行）/ trailing（尾部执行）选项与 cancel 取消；注意 `this` 与参数透传。

**📌 原题**
实现一个 `debounce(fn, wait, options)`，返回防抖后的函数。`options.leading` 为 true 时在延迟开始前立即调用，`options.trailing` 为 false 时禁用尾部调用；返回的防抖函数需有 `cancel()` 方法取消待执行调用。

- 示例：搜索框输入停止 300ms 后才发请求；窗口 resize 停止后才重排。

**✅ 标准答案**

```js
function debounce(fn, wait, options = {}) {
  let timer = null
  let lastArgs, lastThis
  const { leading = false, trailing = true } = options
  function invoke() {
    if (lastArgs) {
      fn.apply(lastThis, lastArgs)
      lastArgs = lastThis = null
    }
  }
  function debounced(...args) {
    lastArgs = args
    lastThis = this
    const callNow = leading && !timer
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (trailing) invoke()
    }, wait)
    if (callNow) invoke()
  }
  debounced.cancel = () => {
    clearTimeout(timer)
    timer = null
    lastArgs = lastThis = null
  }
  return debounced
}
```

时间复杂度 O(1)（仅计时），空间复杂度 O(1)。

### 节流 throttle

- **频率**：高（几乎必考）
- **核心思路**：在固定时间窗口内最多执行一次（n 秒内只执行第一次或最后一次）。
- **易错点**：时间戳版（首调即执行）与定时器版（末次补执行）行为不同，可组合实现"头尾都触发"。

**📌 原题**
实现一个 `throttle(fn, wait)`，在 `wait` 毫秒内最多调用 `fn` 一次。要求既在开始时立即执行，又能在结束时补一次（leading + trailing 效果）。

- 示例：滚动加载、按钮连点防护、拖拽过程高频事件。

**✅ 标准答案**

```js
function throttle(fn, wait) {
  let last = 0,
    timer = null
  return function (...args) {
    const now = Date.now()
    const remaining = wait - (now - last)
    if (remaining <= 0) {
      // 超过间隔，立即执行
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      last = now
      fn.apply(this, args)
    } else if (!timer) {
      // 间隔内，末次补一次
      timer = setTimeout(() => {
        last = Date.now()
        timer = null
        fn.apply(this, args)
      }, remaining)
    }
  }
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

### 实现 call / apply

- **频率**：高
- **核心思路**：把函数挂到传入的 `thisArg` 上临时调用，执行后删除。
- **易错点**：`thisArg` 为 null/undefined 时指向全局（浏览器 window）；基本类型需转对象；处理参数列表。

**📌 原题**
不使用原生 `Function.prototype.call` / `apply`，手写 `myCall` / `myApply`，使 `fn.myCall(thisArg, ...args)` 的效果等同原生。

**✅ 标准答案**

```js
Function.prototype.myCall = function (thisArg, ...args) {
  thisArg = thisArg == null ? globalThis : Object(thisArg) // null/undefined -> 全局；基本类型装箱
  const fn = Symbol('fn')
  thisArg[fn] = this
  const res = thisArg[fn](...args)
  delete thisArg[fn]
  return res
}
Function.prototype.myApply = function (thisArg, argsArr) {
  thisArg = thisArg == null ? globalThis : Object(thisArg)
  const fn = Symbol('fn')
  thisArg[fn] = this
  const res = argsArr ? thisArg[fn](...argsArr) : thisArg[fn]()
  delete thisArg[fn]
  return res
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

### 实现 bind

- **频率**：中高
- **核心思路**：返回一个新函数，永久绑定 `this` 与部分参数；支持 new 调用时 `this` 不被绑定覆盖。
- **易错点**：用 `new` 调用绑定函数时，应作为普通构造函数执行（this 指向新实例）；需正确合并参数。

**📌 原题**
手写 `myBind(fn, thisArg, ...presetArgs)`，返回一个绑定了 `this` 与预设参数的新函数，且当用 `new` 调用该新函数时，`this` 应指向新创建的实例（而非绑定值）。

**✅ 标准答案**

```js
Function.prototype.myBind = function (thisArg, ...presetArgs) {
  const fn = this
  function bound(...args) {
    // 用 new 调用时，this 是实例（instanceof 为 true），不强制绑定 thisArg
    return fn.apply(this instanceof bound ? this : thisArg, [...presetArgs, ...args])
  }
  bound.prototype = Object.create(fn.prototype) // 维持原型链
  return bound
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

### 实现 new 操作符

- **频率**：中高
- **核心思路**：创建空对象 → 绑定原型 → 以该对象为 this 执行构造函数 → 若构造函数返回对象则用它，否则返回新对象。

**📌 原题**
不使用原生 `new`，手写 `myNew(Constructor, ...args)`，模拟 `new` 的行为。

**✅ 标准答案**

```js
function myNew(Constructor, ...args) {
  const obj = Object.create(Constructor.prototype) // 1. 新对象，原型为构造器 prototype
  const res = Constructor.apply(obj, args) // 2. 以 obj 为 this 执行
  return res !== null && typeof res === 'object' ? res : obj // 3. 返回对象则用之
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

### 深拷贝 deepClone

- **频率**：高
- **核心思路**：递归拷贝；用 `WeakMap` 记录已拷贝对象以解决循环引用；按类型处理 Date/RegExp/Map/Set/Array 等。
- **易错点**：循环引用栈溢出；函数一般直接引用（或不拷贝）；`typeof null === 'object'` 陷阱；正则/日期需用构造函数重建。

**📌 原题**
实现一个深拷贝函数 `deepClone(obj)`，能正确处理嵌套对象/数组、循环引用，并保留 Date、RegExp、Map、Set 等类型。

**✅ 标准答案**

```js
function deepClone(obj, cache = new WeakMap()) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj)
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags)
  if (cache.has(obj)) return cache.get(obj) // 解决循环引用
  const clone = Array.isArray(obj)
    ? []
    : obj instanceof Map
      ? new Map()
      : obj instanceof Set
        ? new Set()
        : {}
  cache.set(obj, clone)
  if (obj instanceof Map) {
    for (const [k, v] of obj) clone.set(deepClone(k, cache), deepClone(v, cache))
  } else if (obj instanceof Set) {
    for (const v of obj) clone.add(deepClone(v, cache))
  } else {
    for (const key in obj) if (obj.hasOwnProperty(key)) clone[key] = deepClone(obj[key], cache)
  }
  return clone
}
```

时间复杂度 O(n)（节点数），空间复杂度 O(n)（含缓存）。

### 数组扁平化 flatten

- **频率**：中
- **核心思路**：递归展开，按 `depth` 控制层数；`depth === Infinity` 全展开。
- 🔗 对标 `Array.prototype.flat`

**📌 原题**
实现 `flatten(arr, depth = 1)`，将嵌套数组按指定深度拍平。`depth` 为 `Infinity` 时完全拍平。

- 示例：`flatten([1,[2,[3,[4]]]], 1)` → `[1,2,[3,[4]]]`；`depth=Infinity` → `[1,2,3,4]`

**✅ 标准答案**

```js
function flatten(arr, depth = 1) {
  const res = []
  for (const item of arr) {
    if (Array.isArray(item) && depth > 0) {
      res.push(...flatten(item, depth - 1))
    } else res.push(item)
  }
  return res
}
```

时间复杂度 O(n)（总元素），空间复杂度 O(n)（递归栈）。

### 数组去重 unique

- **频率**：中
- **核心思路**：`Set` 最简单；对象/NaN 去重需用 `Map` + `typeof`/NaN 判断。
- 🔗 对标 `[...new Set(arr)]`

**📌 原题**
实现 `unique(arr)`，去除数组中的重复元素（保留首次出现）。需正确处理原始类型与 NaN。

- 示例：`unique([1,2,2,NaN,NaN])` → `[1,2,NaN]`

**✅ 标准答案**

```js
function unique(arr) {
  return [...new Set(arr)] // Set 天然去重，且 NaN === NaN 在 Set 中成立
}
// 若需按对象某 key 去重：
function uniqueBy(arr, key) {
  const seen = new Map()
  return arr.filter((item) => {
    const k = item[key]
    if (seen.has(k)) return false
    seen.set(k, true)
    return true
  })
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 实现柯里化 curry

- **频率**：中
- **核心思路**：返回一个函数，收集参数直到达到原函数参数个数再执行。
- **易错点**：参数个数用 `fn.length`；需支持连续调用与一次性传参。

**📌 原题**
实现 `curry(fn)`，把多参数函数转为可链式单参数（或任意参数）调用的柯里化版本。

- 示例：`const add = curry((a,b,c)=>a+b+c); add(1)(2)(3) === 6; add(1,2)(3) === 6`

**✅ 标准答案**

```js
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) return fn.apply(this, args) // 参数够了就执行
    return (...next) => curried.apply(this, [...args, ...next]) // 否则继续收集
  }
}
```

时间复杂度 O(1)（仅收集），空间复杂度 O(n)（闭包存参）。

### JSONP 实现

- **频率**：中
- **核心思路**：动态插入 `<script>` 标签，服务端返回 `callbackName(data)`，全局函数接收数据；用完移除标签、超时清理。
- **易错点**：回调名全局唯一（防冲突）；超时与错误处理；清理 DOM 与全局函数。

**📌 原题**
实现一个 `jsonp(url, options)`，返回 Promise，通过动态 script 标签跨域获取数据，支持超时与失败回调。

**✅ 标准答案**

```js
function jsonp(url, { timeout = 5000, params = {} } = {}) {
  return new Promise((resolve, reject) => {
    const cbName = 'jsonp_' + Date.now() + Math.floor(Math.random() * 1e4)
    const script = document.createElement('script')
    const clean = () => {
      delete window[cbName]
      script.remove()
    }
    const timer = setTimeout(() => {
      clean()
      reject(new Error('timeout'))
    }, timeout)
    window[cbName] = (data) => {
      clearTimeout(timer)
      clean()
      resolve(data)
    }
    const qs = Object.entries({ ...params, callback: cbName })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    script.src = url + (url.includes('?') ? '&' : '?') + qs
    script.onerror = () => {
      clearTimeout(timer)
      clean()
      reject(new Error('script error'))
    }
    document.body.appendChild(script)
  })
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

## Promise 与异步并发

### 实现 Promise.all

- **频率**：高
- **核心思路**：接收一个 Promise 数组，全部成功才 resolve（结果为按原序的数组）；任一 reject 则立即 reject。
- **易错点**：结果顺序必须与原数组一致（不能用 push，要用下标）；空数组直接 resolve `[]`。

**📌 原题**
实现 `myPromiseAll(promises)`，行为等同原生 `Promise.all`：所有成功返回按序结果数组，任一失败立即失败。

- 示例：`myPromiseAll([Promise.resolve(1), 2, Promise.resolve(3)])` → `[1,2,3]`

**✅ 标准答案**

```js
function myPromiseAll(promises) {
  return new Promise((resolve, reject) => {
    const arr = Array.from(promises)
    if (!arr.length) return resolve([])
    const res = new Array(arr.length)
    let count = 0
    arr.forEach((p, i) => {
      Promise.resolve(p).then((v) => {
        res[i] = v // 按下标存，保证顺序
        if (++count === arr.length) resolve(res)
      }, reject) // 任一失败立即 reject
    })
  })
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 实现 Promise.race

- **频率**：中高
- **核心思路**：哪个 Promise 最先 settle（成功或失败）就用它的结果。
- 🔗 对标 `Promise.race`

**📌 原题**
实现 `myPromiseRace(promises)`，返回第一个 settle 的 Promise 的结果。

**✅ 标准答案**

```js
function myPromiseRace(promises) {
  return new Promise((resolve, reject) => {
    for (const p of promises) Promise.resolve(p).then(resolve, reject)
  })
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 实现 Promise.allSettled

- **频率**：中
- **核心思路**：等待所有 Promise 完成（不论成败），返回每个的状态对象 `{status:'fulfilled'|'rejected', value|reason}`。
- 🔗 对标 `Promise.allSettled`

**📌 原题**
实现 `myAllSettled(promises)`，无论成功失败都等全部结束，返回结果数组。

**✅ 标准答案**

```js
function myAllSettled(promises) {
  return new Promise((resolve) => {
    const arr = Array.from(promises)
    const res = new Array(arr.length)
    let count = 0
    arr.forEach((p, i) => {
      Promise.resolve(p)
        .then(
          (v) => {
            res[i] = { status: 'fulfilled', value: v }
          },
          (r) => {
            res[i] = { status: 'rejected', reason: r }
          },
        )
        .finally(() => {
          if (++count === arr.length) resolve(res)
        })
    })
  })
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 实现 Promise.any

- **频率**：中
- **核心思路**：任意一个成功即 resolve；全部失败才 reject（AggregateError）。
- 🔗 对标 `Promise.any`

**📌 原题**
实现 `myPromiseAny(promises)`，返回第一个成功的 Promise 结果；全部失败则 reject。

**✅ 标准答案**

```js
function myPromiseAny(promises) {
  return new Promise((resolve, reject) => {
    const arr = Array.from(promises)
    if (!arr.length) return reject(new AggregateError([], 'empty'))
    const errs = new Array(arr.length)
    let count = 0
    arr.forEach((p, i) => {
      Promise.resolve(p).then(resolve, (e) => {
        errs[i] = e
        if (++count === arr.length) reject(new AggregateError(errs, 'all rejected'))
      })
    })
  })
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 实现 Promise.retry（失败重试）

- **频率**：中高
- **核心思路**：任务失败后按次数重试，可加固定/指数退避；全部失败才 reject。
- **易错点**：用递归或循环；记录剩余次数；重试间隔（退避）常被追问。

**📌 原题**
实现 `retry(fn, times, delay)`，最多重试 `times` 次，每次间隔 `delay` 毫秒，成功即返回，全部失败才 reject。

**✅ 标准答案**

```js
function retry(fn, times, delay = 0) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      fn()
        .then(resolve)
        .catch((err) => {
          if (n <= 0) return reject(err)
          setTimeout(() => attempt(n - 1), delay)
        })
    }
    attempt(times)
  })
}
```

时间复杂度 O(times)，空间复杂度 O(1)（递归栈 O(times)）。

### 实现并发控制 / 限制并发数

- **频率**：高
- **核心思路**：用一个计数器和等待队列，同时进行的任务不超过 `limit`；有任务完成才从队列取下一个。
- **易错点**：返回结果顺序需与原任务数组一致；所有任务完成（含排队）才算结束。

**📌 原题**
实现 `pLimit(tasks, limit)`，传入异步任务数组与最大并发数，控制同时执行的任务数不超过 `limit`，最终按原序返回所有结果。

- 示例：`pLimit([t1,t2,t3,t4,t5], 2)` 同时最多 2 个在跑。

**✅ 标准答案**

```js
function pLimit(tasks, limit) {
  return new Promise((resolve) => {
    const res = new Array(tasks.length)
    let idx = 0,
      done = 0
    const run = () => {
      if (idx >= tasks.length) return
      const cur = idx++
      Promise.resolve(tasks[cur]()).then((v) => {
        res[cur] = v
        if (++done === tasks.length) resolve(res)
        else run() // 完成一个再拉一个
      })
    }
    for (let i = 0; i < Math.min(limit, tasks.length); i++) run() // 启动 limit 个
  })
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 实现 sleep

- **频率**：中
- **核心思路**：`new Promise` 配合 `setTimeout` 延迟 resolve。
- 🔗 常用于 `await sleep(1000)` 控制节奏。

**📌 原题**
实现 `sleep(ms)`，返回一个在 `ms` 毫秒后 resolve 的 Promise。

**✅ 标准答案**

```js
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

### 实现请求超时与取消

- **频率**：中
- **核心思路**：用 `Promise.race` 竞速「请求」与「超时定时器」；取消用 `AbortController` 中断 `fetch`。
- **易错点**：超时后应在 `finally` 中清理定时器，避免泄漏。

**📌 原题**
封装 `fetchWithTimeout(url, ms)`，超时（如 5s）未响应则 reject；并支持通过 `AbortController` 主动取消。

**✅ 标准答案**

```js
function fetchWithTimeout(url, ms, options = {}) {
  const controller = new AbortController()
  const timeout = new Promise((_, reject) => {
    const t = setTimeout(() => {
      controller.abort() // 中止底层 fetch
      reject(new Error('timeout'))
    }, ms)
    options.signal = controller.signal
    clearTimeoutOnDone(t) // 占位：真实场景用 finally 清 timer
  })
  return Promise.race([fetch(url, options).then((r) => r.json()), timeout])
}
// 更稳妥写法（清理 timer）：
function fetchWithTimeout2(url, ms, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { ...options, signal: controller.signal })
    .then((r) => r.json())
    .finally(() => clearTimeout(timer))
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

### 交替打印 / 红绿灯问题

- **频率**：中
- **核心思路**：用两个相互 await 的 Promise（或 async 队列）让两个协程交替执行；红绿灯则用 `await sleep` 控制状态机。
- **易错点**：不能用空 `while(true)` 忙等；需真正让出事件循环。

**📌 原题**
用 async/await 实现两个函数 `A` 与 `B` 交替打印（如 A 打印 1 次后 B 打印 1 次，循环 N 次）。以及红绿灯：按 绿 3s → 黄 1s → 红 2s 循环打印状态。

**✅ 标准答案**

```js
// 交替打印：用两个开关 Promise
async function alternate(n) {
  let aTurn = Promise.resolve()
  for (let i = 0; i < n; i++) {
    await aTurn.then(() => console.log('A'))
    aTurn = aTurn.then(() => console.log('B')) // B 总在 A 之后
  }
}
// 红绿灯
async function trafficLight() {
  while (true) {
    console.log('🟢 绿灯')
    await sleep(3000)
    console.log('🟡 黄灯')
    await sleep(1000)
    console.log('🔴 红灯')
    await sleep(2000)
  }
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 并发请求按发起顺序返回结果

- **频率**：中
- **核心思路**：对一批异步请求，无论哪个先完成，最终按**发起顺序**收集结果（而非完成顺序）。
- 🔗 本质同 `Promise.all`（下标保证顺序），此处强调"顺序无关完成顺序"。

**📌 原题**
有若干异步任务（完成时间随机），要求并发执行但结果数组按**任务发起顺序**排列。

**✅ 标准答案**

```js
async function inOrder(tasks) {
  // Promise.all 已按下标保证顺序，天然满足
  return Promise.all(tasks.map((t) => t()))
}
// 若带并发控制且仍要保持顺序，可基于上面的 pLimit（其 res 按下标存）
```

时间复杂度 O(n)，空间复杂度 O(n)。

---

## DOM 与浏览器

### 图片懒加载

- **频率**：高
- **核心思路**：用 `IntersectionObserver` 监听图片是否进入视口，进入后才把 `data-src` 赋给 `src`；降级用滚动监听。
- **易错点**：observer 加载后及时 `unobserve`；`loading="lazy"` 是原生简化方案。

**📌 原题**
实现图片懒加载：图片初始 `data-src` 存真实地址，进入视口时才加载，加载完停止观察。

**✅ 标准答案**

```js
function lazyLoadImages(root = document) {
  const imgs = root.querySelectorAll('img[data-src]')
  if (!('IntersectionObserver' in window)) {
    imgs.forEach((img) => (img.src = img.dataset.src)) // 降级：直接加载
    return
  }
  const io = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target
          img.src = img.dataset.src
          img.removeAttribute('data-src')
          observer.unobserve(img) // 加载后停止观察
        }
      })
    },
    { rootMargin: '0px 0px 200px 0px' },
  ) // 提前 200px 预加载
  imgs.forEach((img) => io.observe(img))
}
```

时间复杂度 O(1)（观察事件驱动），空间复杂度 O(n)（observer 列表）。

### 虚拟列表

- **频率**：高
- **核心思路**：只渲染可视区 + 上下缓冲区的少量条目；监听滚动计算 startIndex，用顶部占位撑出总高度。
- **易错点**：缓冲项防白屏；滚动时 `transform` 偏移；定高可算偏移，变高需预估/测量。

**📌 原题**
给定大数据数组（如上万条），实现简易虚拟列表（固定行高 `itemHeight`），容器可视高度 `viewH`，只渲染可见项，滚动流畅。

**✅ 标准答案**

```js
function renderVirtualList(container, data, itemHeight, viewH) {
  const buffer = 3
  const totalH = data.length * itemHeight
  container.style.height = viewH + 'px'
  const inner = document.createElement('div')
  inner.style.height = totalH + 'px'
  inner.style.position = 'relative'
  container.appendChild(inner)
  const paint = () => {
    const scrollTop = container.scrollTop
    let start = Math.floor(scrollTop / itemHeight) - buffer
    start = Math.max(0, start)
    let end = Math.ceil((scrollTop + viewH) / itemHeight) + buffer
    end = Math.min(data.length, end)
    inner.innerHTML = ''
    for (let i = start; i < end; i++) {
      const el = document.createElement('div')
      el.textContent = data[i]
      el.style.position = 'absolute'
      el.style.height = itemHeight + 'px'
      el.style.transform = `translateY(${i * itemHeight}px)`
      inner.appendChild(el)
    }
  }
  container.addEventListener('scroll', paint)
  paint()
}
```

时间复杂度滚动 O(可视项数)，空间复杂度 O(可视项数)。

### 无限滚动

- **频率**：中
- **核心思路**：监听滚动到底部（滚动位置 + 视口 ≥ 内容高度 - 阈值）时加载下一页。
- **易错点**：加锁防重复加载；IntersectionObserver sentinel 更优雅。

**📌 原题**
实现无限滚动：页面滚动到底部附近时触发 `loadMore()` 加载下一页数据。

**✅ 标准答案**

```js
function infiniteScroll(container, loadMore, threshold = 100) {
  let loading = false
  container.addEventListener('scroll', async () => {
    const { scrollTop, scrollHeight, clientHeight } = container
    if (scrollTop + clientHeight >= scrollHeight - threshold && !loading) {
      loading = true
      try {
        await loadMore()
      } finally {
        loading = false
      }
    }
  })
}
// 更优：用底部哨兵元素 + IntersectionObserver
```

时间复杂度 O(1)（事件驱动），空间复杂度 O(1)。

### 拖拽实现

- **频率**：中
- **核心思路**：`mousedown` 记录起点 → `mousemove` 更新位置（用 `left/top` 或 `transform`）→ `mouseup` 结束；注意 `mousemove` 绑在 document 上避免丢失。
- **易错点**：移动逻辑要算偏移量；`mouseup` 后移除监听；可加 `user-select:none` 防选中。

**📌 原题**
实现一个可拖拽元素：按住鼠标可自由拖动，松手停止。

**✅ 标准答案**

```js
function makeDraggable(el) {
  let offsetX = 0,
    offsetY = 0,
    dragging = false
  el.addEventListener('mousedown', (e) => {
    dragging = true
    offsetX = e.clientX - el.offsetLeft
    offsetY = e.clientY - el.offsetTop
    e.preventDefault()
  })
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return
    el.style.left = e.clientX - offsetX + 'px'
    el.style.top = e.clientY - offsetY + 'px'
    el.style.position = 'absolute'
  })
  document.addEventListener('mouseup', () => {
    dragging = false
  })
}
```

时间复杂度 O(1)（事件驱动），空间复杂度 O(1)。

### 复制到剪贴板

- **频率**：中
- **核心思路**：优先 `navigator.clipboard.writeText`（需 HTTPS）；降级用 `textarea` + `document.execCommand('copy')`。
- **易错点**：clipboard API 在 http/非焦点下可能拒绝；降级方案需临时元素并清理。

**📌 原题**
实现 `copyText(text)`，将文本写入剪贴板，返回是否成功。

**✅ 标准答案**

```js
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {}
  }
  // 降级
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {}
  ta.remove()
  return ok
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

### 监听 DOM 变化

- **频率**：中
- **核心思路**：`MutationObserver` 观察子节点/属性变化，回调里拿到 `mutations` 记录。
- 🔗 常用于富文本、响应式 DOM 同步。

**📌 原题**
用 `MutationObserver` 监听某个容器内子节点的增删与属性变化，并在变化时打印变动。

**✅ 标准答案**

```js
function watchDom(target, onChange) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.type === 'childList') console.log('节点变动', m.addedNodes, m.removedNodes)
      if (m.type === 'attributes') console.log('属性变动', m.attributeName)
    })
    onChange && onChange(mutations)
  })
  observer.observe(target, { childList: true, attributes: true, subtree: true })
  return observer // 调用 observer.disconnect() 停止
}
```

时间复杂度 O(变动数)，空间复杂度 O(1)。

### HTML / XSS 转义

- **频率**：中
- **核心思路**：将 `< > & " '` 替换为 HTML 实体，防止注入；反向做 unescape。
- **易错点**：顺序——先转 `&` 再转其他；`'` 需用 `&#39;`（IE 兼容）。

**📌 原题**
实现 `escapeHtml(str)` 与 `unescapeHtml(str)`，防 XSS 注入。

**✅ 标准答案**

```js
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
function unescapeHtml(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 获取 URL 参数

- **频率**：中
- **核心思路**：优先 `URLSearchParams`；需兼容 hash 模式或手写解析。
- 🔗 对标 `new URLSearchParams(location.search)`

**📌 原题**
实现 `getQuery(key)`，从当前 URL 取出指定查询参数；支持返回全部参数对象。

**✅ 标准答案**

```js
function getQuery(key) {
  const params = new URLSearchParams(location.search)
  return key ? params.get(key) : Object.fromEntries(params)
}
// 手写解析（无 URLSearchParams 环境）：
function parseQuery(search = location.search) {
  const obj = {}
  search
    .replace(/^\?/, '')
    .split('&')
    .forEach((kv) => {
      if (!kv) return
      const [k, v = ''] = kv.split('=')
      obj[decodeURIComponent(k)] = decodeURIComponent(v)
    })
  return obj
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### DOM 转 JSON

- **频率**：低—中
- **核心思路**：递归遍历 DOM 节点，抽出 `tagName`、`attributes`、`children`、`text` 等，输出 JSON 树。
- **易错点**：跳过注释/空白文本；属性转对象。

**📌 原题**
实现 `domToJson(node)`，将 DOM 树序列化为 JSON 结构（含标签名、属性、子节点、文本）。

**✅ 标准答案**

```js
function domToJson(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim()
    return text ? { text } : null
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const attrs = {}
  for (const attr of node.attributes) attrs[attr.name] = attr.value
  const children = []
  for (const child of node.childNodes) {
    const json = domToJson(child)
    if (json) children.push(json)
  }
  return { tag: node.tagName.toLowerCase(), attrs, children }
}
```

时间复杂度 O(n)（节点数），空间复杂度 O(n)。

---

## 框架原理与手写

### 简易响应式（Proxy 版）

- **频率**：高
- **核心思路**：用 `Proxy` 拦截 `get` 收集依赖、`set` 触发更新；`effect` 执行时把自身设为当前活跃依赖。
- **易错点**：依赖收集需在 `get` 时、且只在有活跃 effect 时收集；`set` 后派发更新。

**📌 原题**
用 `Proxy` 实现一个极简响应式系统：`reactive(obj)` 在属性被读取时收集依赖，被修改时触发依赖重新执行（类似 Vue3 reactivity 核心）。

**✅ 标准答案**

```js
let activeEffect = null
function effect(fn) {
  activeEffect = fn
  fn()
  activeEffect = null
}
function reactive(obj) {
  const depsMap = new Map() // key -> Set(effect)
  const track = (key) => {
    if (activeEffect) {
      if (!depsMap.has(key)) depsMap.set(key, new Set())
      depsMap.get(key).add(activeEffect)
    }
  }
  const trigger = (key) => {
    depsMap.get(key)?.forEach((fn) => fn())
  }
  return new Proxy(obj, {
    get(target, key) {
      track(key)
      return target[key]
    },
    set(target, key, value) {
      target[key] = value
      trigger(key)
      return true
    },
  })
}
// 使用：
// const state = reactive({ count: 0 })
// effect(() => console.log('count =', state.count))
// state.count = 1  // -> 自动打印 count = 1
```

时间复杂度 get/set O(1)（均摊），空间复杂度 O(依赖数)。

### 简易发布订阅 / EventEmitter

- **频率**：中高
- **核心思路**：内部用 `Map<事件, Set<回调>>`，`on` 订阅、`emit` 触发、`off` 取消。
- **易错点**：`once` 只触发一次后自动 off；触发时拷贝列表防回调中增删导致问题。

**📌 原题**
实现一个 `EventEmitter` 类，支持 `on(event, cb)`、`emit(event, ...args)`、`off(event, cb)`、`once(event, cb)`。

**✅ 标准答案**

```js
class EventEmitter {
  constructor() {
    this.map = new Map()
  }
  on(event, cb) {
    if (!this.map.has(event)) this.map.set(event, new Set())
    this.map.get(event).add(cb)
    return this
  }
  off(event, cb) {
    if (this.map.has(event)) this.map.get(event).delete(cb)
    return this
  }
  once(event, cb) {
    const wrap = (...args) => {
      cb(...args)
      this.off(event, wrap)
    }
    return this.on(event, wrap)
  }
  emit(event, ...args) {
    const set = this.map.get(event)
    if (set) [...set].forEach((cb) => cb(...args)) // 拷贝后触发
    return this
  }
}
```

时间复杂度 on/off O(1)，emit O(订阅数)，空间复杂度 O(总订阅)。

### 简易 Redux

- **频率**：中高
- **核心思路**：单一 `state` + 纯函数 `reducer`；`dispatch(action)` 生成新 state；`subscribe` 注册监听，变化后通知。
- **易错点**：`dispatch` 中调用 `getState` 时要拿到最新 state；通知顺序与退订处理。

**📌 原题**
实现极简 `createStore(reducer)`，提供 `getState()`、`dispatch(action)`、`subscribe(listener)`，行为同 Redux 核心。

**✅ 标准答案**

```js
function createStore(reducer, preloadedState) {
  let state = preloadedState
  const listeners = new Set()
  const getState = () => state
  const dispatch = (action) => {
    state = reducer(state, action) // 纯函数产出新 state
    listeners.forEach((l) => l())
    return action
  }
  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener) // 返回退订函数
  }
  dispatch({ type: '@@INIT' }) // 初始化 state
  return { getState, dispatch, subscribe }
}
// 使用：const store = createStore((s = {n:0}, a) => a.type==='inc'?{n:s.n+1}:s); store.subscribe(()=>console.log(store.getState()))
```

时间复杂度 dispatch O(监听器数)，空间复杂度 O(监听器数)。

### 实现 useDebounce / useThrottle Hook

- **频率**：中高
- **核心思路**：用 `useEffect` + `setTimeout` 对值/回调做防抖；组件卸载清理 timer。
- **易错点**：依赖项正确；防抖的值是"延迟后的值"，回调要用 `useRef` 持有最新引用。

**📌 原题**
实现 `useDebounce(value, delay)` 返回防抖后的值；并实现一个 `useThrottledCallback(fn, delay)` 返回节流后的回调函数（React 风格 Hook）。

**✅ 标准答案**

```js
import { useState, useEffect } from 'react'
function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t) // 卸载/值变化先清
  }, [value, delay])
  return debounced
}
// 节流回调
function useThrottledCallback(fn, delay = 300) {
  const last = useRef(0)
  const timer = useRef(null)
  return useCallback(
    (...args) => {
      const now = Date.now()
      const remaining = delay - (now - last.current)
      if (remaining <= 0) {
        last.current = now
        fn(...args)
      } else if (!timer.current) {
        timer.current = setTimeout(() => {
          last.current = Date.now()
          timer.current = null
          fn(...args)
        }, remaining)
      }
    },
    [fn, delay],
  )
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

### 实现 useFetch Hook

- **频率**：中
- **核心思路**：`useEffect` 发起请求，维护 `{data, loading, error}`；用 `AbortController` 在卸载/依赖变化取消；防竞态（忽略过期响应）。
- **易错点**：竞态——后发请求先回要覆盖先发；卸载后 setState 告警。

**📌 原题**
实现 `useFetch(url)`，返回 `{ data, loading, error }`，支持加载态、错误态、组件卸载取消与竞态防护。

**✅ 标准答案**

```js
import { useState, useEffect } from 'react'
function useFetch(url) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    let ignore = false
    setLoading(true)
    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!ignore) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!ignore) {
          setError(e)
          setLoading(false)
        }
      })
    return () => {
      ignore = true
      controller.abort()
    } // 卸载/url 变化取消
  }, [url])
  return { data, loading, error }
}
```

时间复杂度 O(请求耗时)，空间复杂度 O(1)。

### 实现 mini 虚拟 DOM diff

- **频率**：中
- **核心思路**：对比两个 vnode（类型、props、children），返回 patch；同类型复用、不同类型替换、列表用 key 复用。
- **易错点**：列表 diff 用 key 而非索引；属性增删；文本节点特判。

**📌 原题**
实现一个极简 vnode diff：给定旧/新 vnode（含 `tag`、`props`、`children`），输出需要的更新操作（updateProps / replaceNode / updateText 等）。

**✅ 标准答案**

```js
function diff(oldV, newV) {
  const patches = []
  if (!oldV || oldV.tag !== newV.tag) {
    patches.push({ type: 'replace', newV }) // 类型不同，整体替换
  } else {
    // 属性 diff
    const props = {}
    const allKeys = [...Object.keys(oldV.props || {}), ...Object.keys(newV.props || {})]
    allKeys.forEach((k) => {
      if (oldV.props[k] !== newV.props[k]) props[k] = newV.props[k]
    })
    if (Object.keys(props).length) patches.push({ type: 'updateProps', props })
    // 文本
    if (typeof newV.children === 'string' && oldV.children !== newV.children) {
      patches.push({ type: 'updateText', text: newV.children })
    }
  }
  return patches
}
// vnode 形如 { tag:'div', props:{id:'app'}, children:'hi' }
```

时间复杂度 O(节点数)，空间复杂度 O(差异数)。

### 单例模式

- **频率**：低—中
- **核心思路**：保证类只有一个实例，提供全局访问点；可惰性地创建。
- **易错点**：线程安全在前端非痛点；注意闭包/静态属性存实例。

**📌 原题**
用 JS 实现单例模式（类或闭包），保证全局只创建一个实例。

**✅ 标准答案**

```js
class Singleton {
  constructor(name) {
    if (Singleton.instance) return Singleton.instance
    this.name = name
    Singleton.instance = this
  }
}
// 或闭包版：
function createSingleton(cls) {
  let instance
  return new Proxy(cls, {
    construct: (target, args) => {
      if (!instance) instance = new target(...args)
      return instance
    },
  })
}
```

时间复杂度 O(1)，空间复杂度 O(1)（单一实例）。

> 场景题的本质是"把需求翻译成健壮代码"：先确认输入输出与边界，再选数据结构和 API，最后补错误处理与清理（timer/observer/listener 的取消）。建议配合算法章节同步练习，二者共同构成手撕能力。

## 参考来源 / 延伸阅读

- 设计模式（图文详解，场景题常考）：[refactoring.guru/design-patterns](https://refactoring.guru/design-patterns)
- MDN Web 文档（事件 / 异步 / 性能 API）：[developer.mozilla.org/zh-CN](https://developer.mozilla.org/zh-CN/)
- web.dev（前端性能与最佳实践）：[web.dev](https://web.dev/)
- LeetCode 力扣（场景题底层算法训练）：[leetcode.cn](https://leetcode.cn/)
- 牛客网（真实场景题面经）：[nowcoder.com](https://www.nowcoder.com/)
