---
group: 牛客全量答案
order: 57
---

# 牛客全量标准答案 · 七、场景 / 手写编程题

> 本文按章节逐条对应《牛客面试题库》，题目标题即匹配依据；维护时只需保证题目文本、所属文件和小节一致。

---

## 异步 / 并发 / 调度

### 实现一个并发控制函数 / 异步调度器 Scheduler（控制最大并发数，结果顺序不变，任务失败不中断，收集所有结果）

> “我把输入设计成返回 Promise 的任务函数，避免任务在进入调度器前就已启动。用共享游标让多个 worker 取任务，结果按原下标写回；每个任务内部捕获异常，因此某个失败不会让整体提前中断。”

```js
async function schedule(tasks, limit = 3) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be positive')
  const results = new Array(tasks.length)
  let next = 0

  async function worker() {
    while (true) {
      const index = next++
      if (index >= tasks.length) return
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}
```

> “时间复杂度是 O(n)，额外空间 O(n)，实际并发数不会超过 limit。”

### 带最大并发数限制的 Promise.all / async pool / 竞态请求只消费最后一次（p-limit）

> “async pool 和上一题的核心相同，我会让 mapper 延迟启动任务。‘只消费最后一次’不是限制并发，而是给每次请求递增版本号，并取消旧请求；即使取消失败，也只提交最新版本的结果。”

```js
async function promisePool(items, mapper, limit = 3) {
  const tasks = items.map((item, index) => () => mapper(item, index))
  const settled = await schedule(tasks, limit)
  return settled.map((item) => {
    if (item.status === 'rejected') throw item.reason
    return item.value
  })
}

function latestOnly(request) {
  let version = 0
  let controller

  return async (...args) => {
    const current = ++version
    controller?.abort()
    controller = new AbortController()
    const value = await request(...args, controller.signal)
    if (current !== version) return { stale: true }
    return { stale: false, value }
  }
}
```

> “若题目要求像 Promise.all 一样快速失败，我会保留 throw；若要求收集全部错误，则直接返回 settled 数组。”

### 实现 Promise.resolve 及手写 Promise 核心逻辑 / 手写 Promise.all

> “`Promise.resolve` 要吸收 thenable；`Promise.all` 要保序、支持可迭代对象、空输入立即完成，并在首个拒绝时失败。完整 Promise 还需异步执行回调、状态只迁移一次，以及递归解析 thenable，面试时我会先写出这些核心。”

```js
class MyPromise {
  #state = 'pending'
  #value
  #handlers = []

  constructor(executor) {
    const resolve = (value) => this.#resolve(value)
    const reject = (reason) => this.#settle('rejected', reason)
    try {
      executor(resolve, reject)
    } catch (error) {
      reject(error)
    }
  }

  #resolve(value) {
    if (value === this) return this.#settle('rejected', new TypeError('cycle'))
    if (value && (typeof value === 'object' || typeof value === 'function')) {
      let then
      try {
        then = value.then
      } catch (error) {
        return this.#settle('rejected', error)
      }
      if (typeof then === 'function') {
        let called = false
        try {
          then.call(
            value,
            (next) => {
              if (!called) {
                called = true
                this.#resolve(next)
              }
            },
            (error) => {
              if (!called) {
                called = true
                this.#settle('rejected', error)
              }
            },
          )
        } catch (error) {
          if (!called) this.#settle('rejected', error)
        }
        return
      }
    }
    this.#settle('fulfilled', value)
  }

  #settle(state, value) {
    if (this.#state !== 'pending') return
    this.#state = state
    this.#value = value
    queueMicrotask(() => this.#flush())
  }

  #flush() {
    const handlers = this.#handlers.splice(0)
    for (const handler of handlers) this.#run(handler)
  }

  #run({ onFulfilled, onRejected, resolve, reject }) {
    const callback = this.#state === 'fulfilled' ? onFulfilled : onRejected
    if (typeof callback !== 'function') {
      ;(this.#state === 'fulfilled' ? resolve : reject)(this.#value)
      return
    }
    try {
      resolve(callback(this.#value))
    } catch (error) {
      reject(error)
    }
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const handler = { onFulfilled, onRejected, resolve, reject }
      this.#handlers.push(handler)
      if (this.#state !== 'pending') queueMicrotask(() => this.#flush())
    })
  }

  static resolve(value) {
    return value instanceof MyPromise ? value : new MyPromise((resolve) => resolve(value))
  }

  static all(iterable) {
    return new MyPromise((resolve, reject) => {
      const values = Array.from(iterable)
      if (values.length === 0) return resolve([])
      const result = new Array(values.length)
      let remaining = values.length
      values.forEach((value, index) => {
        MyPromise.resolve(value).then((item) => {
          result[index] = item
          if (--remaining === 0) resolve(result)
        }, reject)
      })
    })
  }
}
```

### 手写发布订阅模式（含带 once 的 EventEmitter）

> “发布订阅的关键是同一事件维护监听器集合，`emit` 时使用快照，避免监听器在执行期间增删导致遍历错乱；`once` 用包装函数，并让 `off` 同时识别原回调。”

```js
class EventEmitter {
  #events = new Map()

  on(event, listener) {
    if (!this.#events.has(event)) this.#events.set(event, new Set())
    this.#events.get(event).add(listener)
    return () => this.off(event, listener)
  }

  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper)
      listener.apply(this, args)
    }
    wrapper.original = listener
    return this.on(event, wrapper)
  }

  off(event, listener) {
    const listeners = this.#events.get(event)
    if (!listeners) return
    for (const item of listeners) {
      if (item === listener || item.original === listener) listeners.delete(item)
    }
    if (listeners.size === 0) this.#events.delete(event)
  }

  emit(event, ...args) {
    const listeners = this.#events.get(event)
    if (!listeners) return false
    for (const listener of [...listeners]) listener.apply(this, args)
    return true
  }
}
```

### 串行执行传入的 promises（区别于 Promise.all）

> “要串行就不能先创建一组已经执行的 Promise，而应传任务函数。`reduce` 或 `for...of` 都可以，后者更易读；是否遇错中断由题目语义决定。”

```js
async function runSerial(tasks) {
  const results = []
  for (const task of tasks) results.push(await task())
  return results
}

async function runSerialSettled(tasks) {
  const results = []
  for (const task of tasks) {
    try {
      results.push({ status: 'fulfilled', value: await task() })
    } catch (reason) {
      results.push({ status: 'rejected', reason })
    }
  }
  return results
}
```

### 手写 bind（可用 apply / call，不能用展开符）/ 手写 call、apply

> “`call/apply` 的本质是以指定 this 调用函数；实现时用唯一 Symbol 临时挂载，`finally` 保证清理。`bind` 还要支持预置参数和 `new`：作为构造器调用时忽略绑定的 this，并保持原型关系。下面的 bind 没有使用展开符。”

```js
Function.prototype.myCall = function (context) {
  const target = context == null ? globalThis : Object(context)
  const key = Symbol('fn')
  target[key] = this
  try {
    return target[key](...Array.prototype.slice.call(arguments, 1))
  } finally {
    delete target[key]
  }
}

Function.prototype.myApply = function (context, args) {
  const target = context == null ? globalThis : Object(context)
  const key = Symbol('fn')
  target[key] = this
  try {
    return args == null ? target[key]() : target[key](...Array.from(args))
  } finally {
    delete target[key]
  }
}

Function.prototype.myBind = function (context) {
  const targetFn = this
  const preset = Array.prototype.slice.call(arguments, 1)
  function bound() {
    const later = Array.prototype.slice.call(arguments)
    const receiver = this instanceof bound ? this : context
    return targetFn.apply(receiver, preset.concat(later))
  }
  if (targetFn.prototype) {
    bound.prototype = Object.create(targetFn.prototype, {
      constructor: { value: bound, writable: true, configurable: true },
    })
  }
  return bound
}
```

> “真实项目不要修改内置原型；这里是为了展示原理。严格复刻原生方法还涉及不可构造函数、length/name 等规范细节。”

### 手写 instanceof

> “`instanceof` 默认沿左值原型链查找右侧函数的 prototype；需要先处理自定义 `Symbol.hasInstance`，并对基本类型和不可调用右值做边界判断。”

```js
function myInstanceof(value, Constructor) {
  if (
    Constructor == null ||
    (typeof Constructor !== 'function' && typeof Constructor !== 'object')
  ) {
    throw new TypeError('Right-hand side is not an object')
  }
  const custom = Constructor[Symbol.hasInstance]
  if (typeof custom === 'function' && custom !== Function.prototype[Symbol.hasInstance]) {
    return Boolean(custom.call(Constructor, value))
  }
  if (typeof Constructor !== 'function') throw new TypeError('not callable')
  if (value == null || (typeof value !== 'object' && typeof value !== 'function')) return false
  let proto = Object.getPrototypeOf(value)
  while (proto !== null) {
    if (proto === Constructor.prototype) return true
    proto = Object.getPrototypeOf(proto)
  }
  return false
}
```

### 手写类型判断 Object.prototype.toString.call

> “我会用 `Object.prototype.toString.call` 获得内置品牌，再转成统一的小写名称；它比 typeof 更能区分数组、Date、RegExp 等，但自定义 `Symbol.toStringTag` 可以影响结果，业务边界仍要做结构校验。”

```js
function getType(value) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return Object.prototype.toString.call(value).slice(8, -1).toLowerCase()
}

getType([]) // 'array'
getType(new Date()) // 'date'
getType(/x/) // 'regexp'
```

### LazyMan（链式调用调度）/ hardman 经典题 / 手写类似柯里化求积

> “LazyMan 的难点是所有链式调用先入队，再在当前同步代码结束后的微任务里启动；`sleepFirst` 插队。柯里化求积则用闭包累计参数，并以无参数调用结束。”

```js
class LazyManRunner {
  constructor(name) {
    this.tasks = [() => console.log(`Hi, ${name}`)]
    queueMicrotask(() => this.run())
  }
  eat(food) {
    this.tasks.push(() => console.log(`Eat ${food}`))
    return this
  }
  sleep(seconds) {
    this.tasks.push(() => new Promise((resolve) => setTimeout(resolve, seconds * 1000)))
    return this
  }
  sleepFirst(seconds) {
    this.tasks.unshift(() => new Promise((resolve) => setTimeout(resolve, seconds * 1000)))
    return this
  }
  async run() {
    for (const task of this.tasks) await task()
  }
}

const LazyMan = (name) => new LazyManRunner(name)

function multiply(...initial) {
  let product = initial.reduce((sum, n) => sum * n, 1)
  return function next(...nums) {
    if (nums.length === 0) return product
    product *= nums.reduce((sum, n) => sum * n, 1)
    return next
  }
}
```

### 手写 repeat(func, times, wait) / 实现定时器 sleep 函数

> “sleep 返回延时完成的 Promise；repeat 顺序执行并等待间隔。我要先确认题目是‘调用后立即执行再等待’，还是‘先等待再执行’，下面选择前者且最后一次不再空等。”

```js
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

async function repeat(fn, times, wait, signal) {
  const results = []
  for (let index = 0; index < times; index++) {
    signal?.throwIfAborted()
    results.push(await fn(index))
    if (index + 1 < times) await sleep(wait, signal)
  }
  return results
}
```

### 单例模式 / 实现一个单例 object（双检查锁）

> “JavaScript 主线程创建单例通常不需要双检查锁，只需把实例保存在静态字段；双检查锁是多线程语言中减少加锁开销的模式。异步初始化要缓存同一个 Promise，避免多个调用同时启动资源创建。”

```js
class ConfigStore {
  static #instance
  constructor() {
    if (ConfigStore.#instance) return ConfigStore.#instance
    this.values = new Map()
    ConfigStore.#instance = this
  }
  static getInstance() {
    return (ConfigStore.#instance ??= new ConfigStore())
  }
}

function asyncSingleton(factory) {
  let pending
  return () =>
    (pending ??= Promise.resolve()
      .then(factory)
      .catch((error) => {
        pending = undefined // 允许失败后重试
        throw error
      }))
}
```

---

## 手写基础算法 / 数据操作

### 手写深拷贝 / 浅拷贝（循环引用用 WeakMap；ES6 展开运算符是深拷贝还是浅拷贝）

> “展开运算符、`Object.assign` 和数组 slice 都只复制一层。深拷贝要先约定支持范围；下面处理循环引用、原型、属性描述符、Symbol、Date、RegExp、Map 和 Set，函数仍按引用保留，DOM/WeakMap/宿主对象不在通用克隆承诺内。”

```js
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  if (value instanceof Date) return new Date(value)
  if (value instanceof RegExp) return new RegExp(value.source, value.flags)

  if (value instanceof Map) {
    const copy = new Map()
    seen.set(value, copy)
    value.forEach((v, k) => copy.set(deepClone(k, seen), deepClone(v, seen)))
    return copy
  }
  if (value instanceof Set) {
    const copy = new Set()
    seen.set(value, copy)
    value.forEach((item) => copy.add(deepClone(item, seen)))
    return copy
  }

  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value))
  seen.set(value, copy)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if ('value' in descriptor) descriptor.value = deepClone(descriptor.value, seen)
    Object.defineProperty(copy, key, descriptor)
  }
  return copy
}
```

### 手写数组原地去重 / 数组转树 / 树转扁平化（tree <-> flat）/ 嵌套对象（树）转数组

> “原地去重用读写指针；树和扁平数组互转要明确 id、parentId、children 字段及孤儿/环的处理。下面的扁平转树是 O(n)，不会用嵌套 find 退化到 O(n²)。”

```js
function uniqueInPlace(array) {
  const seen = new Set()
  let write = 0
  for (const item of array) {
    if (!seen.has(item)) {
      seen.add(item)
      array[write++] = item
    }
  }
  array.length = write
  return array
}

function flatToTree(list, rootParent = null) {
  const nodes = new Map(list.map((item) => [item.id, { ...item, children: [] }]))
  const roots = []
  for (const item of list) {
    const node = nodes.get(item.id)
    if (item.parentId === rootParent) roots.push(node)
    else if (nodes.has(item.parentId)) nodes.get(item.parentId).children.push(node)
    else roots.push(node) // 业务中也可选择报“孤儿节点”错误
  }
  return roots
}

function treeToFlat(roots) {
  const result = []
  const stack = roots.map((node) => ({ node, parentId: null })).reverse()
  while (stack.length) {
    const { node, parentId } = stack.pop()
    const { children = [], ...rest } = node
    result.push({ ...rest, parentId })
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i], parentId: node.id })
    }
  }
  return result
}
```

### 实现 pick / 实现 classnames 函数 / 实现 once 函数（记忆化第一次执行结果）

> “这三题都考参数边界：pick 只复制自有属性；classnames 递归展开字符串、数组和条件对象；once 必须记住第一次成功或第一次调用的结果，并保留 this。”

```js
function pick(object, keys) {
  const result = {}
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) result[key] = object[key]
  }
  return result
}

function classNames(...inputs) {
  const result = []
  const visit = (value) => {
    if (!value) return
    if (typeof value === 'string' || typeof value === 'number') result.push(String(value))
    else if (Array.isArray(value)) value.forEach(visit)
    else if (typeof value === 'object') {
      for (const [key, enabled] of Object.entries(value)) if (enabled) result.push(key)
    }
  }
  inputs.forEach(visit)
  return result.join(' ')
}

function once(fn) {
  let called = false
  let value
  return function (...args) {
    if (!called) {
      value = fn.apply(this, args)
      called = true
    }
    return value
  }
}
```

### 实现 myPromiseMap（数组、回调、最大并发，返回结果数组）/ 统计数组元素出现频次并筛选频次 ≥ N

> “`myPromiseMap` 复用并发池即可，但要保证 mapper 的 this/下标契约和结果顺序。频次筛选用 Map 一次统计、一次过滤，整体 O(n)。”

```js
async function myPromiseMap(items, mapper, maxConcurrency = 4) {
  const tasks = items.map((item, index) => () => mapper(item, index, items))
  const settled = await schedule(tasks, maxConcurrency)
  const failed = settled.find((item) => item.status === 'rejected')
  if (failed) throw failed.reason
  return settled.map((item) => item.value)
}

function atLeastN(items, n) {
  const counts = new Map()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return [...counts].filter(([, count]) => count >= n).map(([item]) => item)
}
```

### 手写：字符串中提取所有数字（含科学计数法、小数、分数、负数）/ 解析 URL 查询字符串为 JSON（含嵌套、类型转换）

> “数字提取先定义语法，下面支持正负整数、小数、科学计数和形如 3/4 的分数。查询字符串解析不能直接信任 key，我会拒绝 `__proto__` 等污染路径；类型转换也应是显式规则，而非任意 eval。”

```js
function extractNumbers(text) {
  const atom = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`
  return text.match(new RegExp(`${atom}(?:\/${atom})?`, 'gi')) ?? []
}

function parseScalar(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value)
  return value
}

function parseQuery(query) {
  const output = Object.create(null)
  const unsafe = new Set(['__proto__', 'prototype', 'constructor'])
  for (const [rawKey, rawValue] of new URLSearchParams(query.replace(/^\?/, ''))) {
    const path = rawKey.replace(/\]/g, '').split('[')
    if (path.some((key) => unsafe.has(key))) continue
    let target = output
    path.forEach((key, index) => {
      if (index === path.length - 1) target[key] = parseScalar(rawValue)
      else target = target[key] ??= Object.create(null)
    })
  }
  return output
}
```

### 随机生成密码（至少一个大写一个小写一个数字一个特殊符号）/ 特殊路径找嵌套对象

> “密码不能用 `Math.random`，应使用密码学安全随机源；先从四类字符各取一个，再补齐并用 Fisher–Yates 洗牌。嵌套路径读取要同时支持点号和数组下标，并防空值。”

```js
function secureIndex(max) {
  const range = 0x100000000
  const limit = range - (range % max)
  const buffer = new Uint32Array(1)
  do crypto.getRandomValues(buffer)
  while (buffer[0] >= limit)
  return buffer[0] % max
}

function randomPassword(length = 12) {
  if (length < 4) throw new RangeError('length must be at least 4')
  const groups = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '!@#$%^&*',
  ]
  const all = groups.join('')
  const chars = groups.map((group) => group[secureIndex(group.length)])
  while (chars.length < length) chars.push(all[secureIndex(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

function getByPath(object, path, fallback) {
  const keys = Array.isArray(path) ? path : (path.match(/[^.[\]]+/g) ?? [])
  let current = object
  for (const key of keys) {
    if (current == null || !Object.prototype.hasOwnProperty.call(Object(current), key))
      return fallback
    current = current[key]
  }
  return current
}
```

### 使用千位分隔符转换数字

> “生产代码优先用 `Intl.NumberFormat` 处理地区、精度和货币。若面试要求手写，我会先拆符号、整数和小数，再只对整数部分从右向左加分隔符，避免把小数位也分组。”

```js
function thousands(value) {
  const text = String(value)
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) throw new TypeError('invalid number')
  const sign = /^[+-]/.test(text) ? text[0] : ''
  const [integer, fraction] = text.replace(/^[+-]/, '').split('.')
  const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return sign + formatted + (fraction == null ? '' : `.${fraction}`)
}

new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 20 }).format(1234567.89)
```

### 反转字符串（多种办法）/ 手写反转链表（迭代 + 递归）/ 反转链表 K 个一组 / 重排链表 / 合并两个有序链表 / 原地合并两个有序数组 / 删除链表倒数第 K 个节点 / 判断链表是否有环（快慢指针）

> “字符串按 Unicode code point 反转可用 `Array.from`。链表题我统一约定节点为 `{ val, next }`，先写最常考的迭代/递归反转，再用这些基础函数组合 K 组反转、重排、合并、删除倒数节点和判环。”

```js
const reverseString = (text) => Array.from(text).reverse().join('')

function reverseList(head) {
  let prev = null
  while (head) {
    const next = head.next
    head.next = prev
    prev = head
    head = next
  }
  return prev
}

function reverseListRecursive(head, prev = null) {
  if (!head) return prev
  const next = head.next
  head.next = prev
  return reverseListRecursive(next, head)
}

function reverseKGroup(head, k) {
  const dummy = { next: head }
  let groupPrev = dummy
  while (true) {
    let kth = groupPrev
    for (let i = 0; i < k && kth; i++) kth = kth.next
    if (!kth) break
    const groupNext = kth.next
    let prev = groupNext
    let current = groupPrev.next
    while (current !== groupNext) {
      const next = current.next
      current.next = prev
      prev = current
      current = next
    }
    const oldStart = groupPrev.next
    groupPrev.next = kth
    groupPrev = oldStart
  }
  return dummy.next
}

function mergeTwoLists(a, b) {
  const dummy = { next: null }
  let tail = dummy
  while (a && b) {
    if (a.val <= b.val) [tail.next, a] = [a, a.next]
    else [tail.next, b] = [b, b.next]
    tail = tail.next
  }
  tail.next = a ?? b
  return dummy.next
}

function reorderList(head) {
  if (!head?.next) return head
  let slow = head,
    fast = head
  while (fast.next?.next) {
    slow = slow.next
    fast = fast.next.next
  }
  let second = reverseList(slow.next)
  slow.next = null
  let first = head
  while (second) {
    const a = first.next,
      b = second.next
    first.next = second
    second.next = a
    first = a
    second = b
  }
  return head
}

function mergeSortedArrays(nums1, m, nums2, n) {
  let i = m - 1,
    j = n - 1,
    write = m + n - 1
  while (j >= 0) nums1[write--] = i >= 0 && nums1[i] > nums2[j] ? nums1[i--] : nums2[j--]
  return nums1
}

function removeNthFromEnd(head, n) {
  const dummy = { next: head }
  let fast = dummy,
    slow = dummy
  for (let i = 0; i <= n; i++) fast = fast.next
  while (fast) {
    fast = fast.next
    slow = slow.next
  }
  slow.next = slow.next.next
  return dummy.next
}

function hasCycle(head) {
  let slow = head,
    fast = head
  while (fast?.next) {
    slow = slow.next
    fast = fast.next.next
    if (slow === fast) return true
  }
  return false
}
```

### 无重复字符的最长子串（带 unicode 编码）/ 最长递增子序列 / 最长连续子数组和 / 最大子数组和 / 股票 II / 改版三数之和 / 三数之和（注意去重）/ 两数之和（三种解法）/ 电话号码的字母组合 / 盛水最多的容器 / 打家劫舍 II（环形房屋）/ 爬楼梯 / 跳台阶 / 硬币找零（最少硬币数）/ 复原 IP 地址 / 前 K 个高频单词 / 最小 K 个数 / 第 K 小/大元素（Quickselect）/ 多数元素 / 除自身以外数组的乘积 / 括号匹配（含有序括号、O(1)、子串提取）/ 唯一路径数 unique-paths / 二叉树右视图 / 二叉树层序遍历（含逆序）/ 对称二叉树 / 二叉树最大深度 / 二叉树最大宽度 / 二叉树路径和（回溯 + 剪枝）/ 二叉树最大路径和 / 创建二叉树求叶子节点高度 / 寻找数组中第 K 小元素 / 多个已排序整数数组求交集 / 全排列 / 全排列 II / 单词搜索（剪枝）/ 最长不含重复字符子串 / 二分查找 / 二维数组查找（全局递增）/ 三角形的最短路径和 / 数组中的第 K 个最大元素 / 圆圈中最后剩下的数 / 求一组数中位数 / 实现优先级队列 / 相亲配对随机算法 / 字符串相似度 / 比较版本号 / 搜索高亮（只高亮前 N 个匹配）/ 根据成绩输出每个班级名次（可并列）/ 实现 LRU 缓存（含超时自动删除）/ 手写快排 / 合并 k 个有序链表

> “这道源题实际合并了五十余道算法题。我会按滑动窗口、双指针、动态规划、二叉树、回溯、堆与快速选择分类准备，而不是背零散答案。主文避免塞成无法复习的超长代码墙；每个列出的子题都在《牛客算法题 JavaScript 代码附录》中给出可运行实现、复杂度和边界说明。现场我会先复述输入输出与边界，再写主函数并用最小样例手动验证。”

```js
// 示例：无重复字符的最长 Unicode 子串，O(n) 时间、O(k) 空间
function longestUniqueSubstring(text) {
  const chars = Array.from(text)
  const last = new Map()
  let left = 0,
    best = 0
  for (let right = 0; right < chars.length; right++) {
    if (last.has(chars[right])) left = Math.max(left, last.get(chars[right]) + 1)
    last.set(chars[right], right)
    best = Math.max(best, right - left + 1)
  }
  return best
}
```

> “完整代码见 [牛客算法题 JavaScript 代码附录](./niuke-algorithms-js.md)。”

### 判断一个字符串是不是累加数 / 判断一个字符串是否是正确的有序括号

> “累加数用回溯枚举前两个数，此后每个数必须等于前两数之和；用 BigInt 避免长数字溢出，并排除前导零。有序括号用栈匹配括号类型，若题目只有一种括号也可用 O(1) 计数器。”

```js
function isAdditiveNumber(text) {
  const valid = (start, end) => end - start === 1 || text[start] !== '0'
  for (let i = 1; i < text.length - 1; i++) {
    if (!valid(0, i)) break
    for (let j = i + 1; j < text.length; j++) {
      if (!valid(i, j)) break
      let a = BigInt(text.slice(0, i)),
        b = BigInt(text.slice(i, j)),
        pos = j,
        count = 2
      while (pos < text.length) {
        const sum = String(a + b)
        if (!text.startsWith(sum, pos)) break
        pos += sum.length
        a = b
        b = BigInt(sum)
        count++
      }
      if (pos === text.length && count >= 3) return true
    }
  }
  return false
}

function isValidBrackets(text) {
  const pairs = { ')': '(', ']': '[', '}': '{' }
  const stack = []
  for (const char of text) {
    if ('([{'.includes(char)) stack.push(char)
    else if (char in pairs && stack.pop() !== pairs[char]) return false
  }
  return stack.length === 0
}
```

### 给定算术表达式字符串求值（hard）/ 迷宫题

> “表达式求值我用递归下降而不是 eval，按 expression、term、factor 分层自然处理优先级、括号和一元正负号。迷宫用 BFS 能得到最短步数，并用 predecessor Map 还原路径。”

```js
function calculate(source) {
  let i = 0
  const skip = () => {
    while (/\s/.test(source[i] ?? '')) i++
  }
  function factor() {
    skip()
    if (source[i] === '+' || source[i] === '-') {
      const sign = source[i++] === '-' ? -1 : 1
      return sign * factor()
    }
    if (source[i] === '(') {
      i++
      const value = expression()
      skip()
      if (source[i++] !== ')') throw new SyntaxError('missing )')
      return value
    }
    const match = source.slice(i).match(/^\d+(?:\.\d+)?/)
    if (!match) throw new SyntaxError(`unexpected token at ${i}`)
    i += match[0].length
    return Number(match[0])
  }
  function term() {
    let value = factor()
    while (true) {
      skip()
      const op = source[i]
      if (op !== '*' && op !== '/') return value
      i++
      const right = factor()
      value = op === '*' ? value * right : value / right
    }
  }
  function expression() {
    let value = term()
    while (true) {
      skip()
      const op = source[i]
      if (op !== '+' && op !== '-') return value
      i++
      const right = term()
      value = op === '+' ? value + right : value - right
    }
  }
  const value = expression()
  skip()
  if (i !== source.length) throw new SyntaxError(`unexpected token at ${i}`)
  return value
}

function shortestMazePath(grid, start, end) {
  const key = ([r, c]) => `${r},${c}`
  const queue = [start],
    previous = new Map([[key(start), null]])
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    if (key(current) === key(end)) break
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = [current[0] + dr, current[1] + dc]
      if (grid[next[0]]?.[next[1]] === 0 && !previous.has(key(next))) {
        previous.set(key(next), current)
        queue.push(next)
      }
    }
  }
  if (!previous.has(key(end))) return []
  const path = []
  for (let node = end; node; node = previous.get(key(node))) path.push(node)
  return path.reverse()
}
```

### 实现倒计时（秒数转 时分秒 + 开始 + 复位）/ 实现深拷贝与浅拷贝（循环引用）

> “倒计时用剩余毫秒作为单一真相，每次根据目标结束时间计算，避免 setInterval 漂移累积；start/reset 都要清理旧计时器。深拷贝使用前文‘手写深拷贝 / 浅拷贝’中的 WeakMap 版本，而浅拷贝只复制第一层。”

```js
function formatDuration(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

class Countdown {
  constructor(seconds, onTick) {
    this.initial = seconds
    this.onTick = onTick
    this.remaining = seconds
  }
  start() {
    clearInterval(this.timer)
    const endAt = Date.now() + this.remaining * 1000
    const tick = () => {
      this.remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      this.onTick(formatDuration(this.remaining))
      if (this.remaining === 0) clearInterval(this.timer)
    }
    tick()
    this.timer = setInterval(tick, 250)
  }
  reset() {
    clearInterval(this.timer)
    this.remaining = this.initial
    this.onTick(formatDuration(this.remaining))
  }
}
```

### 类继承：实现 车 / 汽车 / 单车 类，含成员属性、方法、默认黑色属性

> “我用基类承载共享的品牌、颜色和移动行为，默认参数把颜色设为黑色；汽车和单车通过 extends 增加各自属性并复用 super。”

```js
class Vehicle {
  constructor(brand, color = 'black') {
    this.brand = brand
    this.color = color
  }
  move() {
    return `${this.brand} is moving`
  }
}

class Car extends Vehicle {
  constructor(brand, seats, color = 'black') {
    super(brand, color)
    this.seats = seats
  }
  honk() {
    return 'beep'
  }
}

class Bicycle extends Vehicle {
  constructor(brand, gears = 1, color = 'black') {
    super(brand, color)
    this.gears = gears
  }
  ring() {
    return 'ring'
  }
}
```

### 手写：实现一个简单的 Set 类（add / remove）/ 实现深层比较 isEqual 函数

> “简单 Set 可以用数组实现 SameValueZero 语义；真实性能更应使用原生 Set。深层比较要处理循环、原型、键、Date/RegExp/Map/Set 等，下面给出常见对象和数组版本，并用双向 WeakMap 避免错误地把不同环结构判相等。”

```js
class SimpleSet {
  #values = []
  add(value) {
    if (!this.has(value)) this.#values.push(value)
    return this
  }
  has(value) {
    return this.#values.some((item) => Object.is(item, value) || item === value)
  }
  remove(value) {
    const index = this.#values.findIndex((item) => Object.is(item, value) || item === value)
    if (index < 0) return false
    this.#values.splice(index, 1)
    return true
  }
  get size() {
    return this.#values.length
  }
}

function isEqual(a, b, aToB = new WeakMap(), bToA = new WeakMap()) {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
  if (aToB.has(a) || bToA.has(b)) return aToB.get(a) === b && bToA.get(b) === a
  aToB.set(a, b)
  bToA.set(b, a)
  if (a instanceof Date) return +a === +b
  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags
  const aKeys = Reflect.ownKeys(a),
    bKeys = Reflect.ownKeys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && isEqual(a[key], b[key], aToB, bToA),
  )
}
```

### 用 JSON.parse(JSON.stringify()) 做深拷贝有什么局限性（函数 / Symbol / 循环引用 / undefined / Date 等丢失）？

> “JSON 往返只适合 JSON 数据，不是通用深拷贝：undefined、函数和 Symbol 会丢失，NaN/Infinity 变成 null，Date 变字符串，Map/Set 变空对象，BigInt 和循环引用会抛错，原型、描述符及对象共享关系也丢失。支持的平台优先用 structuredClone；需要自定义范围时用前文‘手写深拷贝 / 浅拷贝’的实现。”

```js
const source = { date: new Date(), map: new Map([['x', 1]]) }
source.self = source

const copy = structuredClone(source)
console.log(copy.date instanceof Date) // true
console.log(copy.map instanceof Map) // true
console.log(copy.self === copy) // true

// structuredClone 仍不能克隆函数、DOM 节点等不可结构化克隆的值。
```

### 最长公共子串（LeetCode 1143 / 718）如何实现？

> “题号容易混淆：LeetCode 1143 是最长公共子序列，字符不要求连续；718 是最长重复子数组，对字符串就是最长公共子串，要求连续。两者都可用动态规划，但状态转移不同。”

```js
function longestCommonSubsequence(a, b) {
  const dp = new Array(b.length + 1).fill(0)
  for (const x of a) {
    let diagonal = 0
    for (let j = 1; j <= b.length; j++) {
      const old = dp[j]
      dp[j] = x === b[j - 1] ? diagonal + 1 : Math.max(dp[j], dp[j - 1])
      diagonal = old
    }
  }
  return dp[b.length]
}

function longestCommonSubstring(a, b) {
  const dp = new Array(b.length + 1).fill(0)
  let best = 0
  for (let i = 1; i <= a.length; i++) {
    for (let j = b.length; j >= 1; j--) {
      dp[j] = a[i - 1] === b[j - 1] ? dp[j - 1] + 1 : 0
      best = Math.max(best, dp[j])
    }
  }
  return best
}
```

### 找出 1-N（如 1-10000）内的所有质数（埃氏筛 / 欧拉筛）？

> “埃氏筛每找到一个质数，就从 p² 开始标记其倍数，时间约 O(n log log n)。欧拉筛让每个合数只被最小质因子筛一次，理论 O(n)。”

```js
function eratosthenes(n) {
  const prime = new Uint8Array(n + 1).fill(1)
  prime[0] = prime[1] = 0
  for (let p = 2; p * p <= n; p++) {
    if (prime[p]) for (let multiple = p * p; multiple <= n; multiple += p) prime[multiple] = 0
  }
  return Array.from({ length: n + 1 }, (_, i) => i).filter((i) => prime[i])
}

function eulerSieve(n) {
  const primes = [],
    composite = new Uint8Array(n + 1)
  for (let value = 2; value <= n; value++) {
    if (!composite[value]) primes.push(value)
    for (const prime of primes) {
      if (value * prime > n) break
      composite[value * prime] = 1
      if (value % prime === 0) break
    }
  }
  return primes
}
```

### 求二叉树中第 N 大的数（BST 反中序遍历 / 普通二叉树 + 堆）？

> “若明确是 BST，第 N 大可用右-根-左反中序并提前停止，O(h+n) 时间、O(h) 栈空间。普通二叉树没有有序性，只能遍历并维护容量 N 的最小堆，或收集排序。”

```js
function kthLargestInBST(root, k) {
  const stack = []
  let node = root
  while (node || stack.length) {
    while (node) {
      stack.push(node)
      node = node.right
    }
    node = stack.pop()
    if (--k === 0) return node.val
    node = node.left
  }
  throw new RangeError('k exceeds node count')
}

function kthLargestInTree(root, k) {
  const values = [],
    stack = root ? [root] : []
  while (stack.length) {
    const node = stack.pop()
    values.push(node.val)
    if (node.left) stack.push(node.left)
    if (node.right) stack.push(node.right)
  }
  if (k < 1 || k > values.length) throw new RangeError('invalid k')
  return values.sort((a, b) => b - a)[k - 1] // 可替换为容量 k 的最小堆
}
```

### 字符串压缩：把 aabcccaaaa 压缩成 a2bc3a4（连续相同字符计数，只出现一次不加数字）？

> “单次扫描维护当前字符和连续次数，遇到不同字符或到结尾时提交一段；只出现一次不追加数字。用 `Array.from` 可按 Unicode code point 遍历。”

```js
function compress(text) {
  const chars = Array.from(text)
  if (chars.length === 0) return ''
  const result = []
  let current = chars[0],
    count = 1
  for (let i = 1; i <= chars.length; i++) {
    if (chars[i] === current) count++
    else {
      result.push(current, count === 1 ? '' : String(count))
      current = chars[i]
      count = 1
    }
  }
  return result.join('')
}

compress('aabcccaaaa') // 'a2bc3a4'
```

### 给定两个数组，一个是入口文件的依赖关系、一个是参与打包的所有文件的依赖关系，输出最终打包结果（依赖图遍历 + 去重 / 循环依赖处理）？

> “把依赖关系建成邻接表，从入口做 DFS，依赖先入结果即可得到打包顺序；用 visiting/visited 三色状态去重并检测循环依赖。真实打包器还要区分 ESM 的静态图、动态 import、tree shaking 和副作用。”

```js
function bundleOrder(entries, dependencyRecords) {
  const graph = new Map(dependencyRecords.map(({ file, dependencies }) => [file, dependencies]))
  const state = new Map(),
    result = []

  function visit(file, path = []) {
    if (state.get(file) === 'done') return
    if (state.get(file) === 'visiting')
      throw new Error(`circular dependency: ${[...path, file].join(' -> ')}`)
    state.set(file, 'visiting')
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...path, file])
    state.set(file, 'done')
    result.push(file)
  }

  for (const entry of entries) visit(entry)
  return result
}
```

### 找岛屿 / 岛屿数量（DFS 淹没法 与 BFS 两种写法）？

> “岛屿数量就是遍历网格，遇到陆地就计数并把整个连通块标记访问。DFS 写法短，BFS 不受递归深度限制；两者都是 O(mn) 时间。”

```js
function numIslandsDFS(grid) {
  let count = 0
  const flood = (r, c) => {
    if (grid[r]?.[c] !== '1') return
    grid[r][c] = '0'
    flood(r + 1, c)
    flood(r - 1, c)
    flood(r, c + 1)
    flood(r, c - 1)
  }
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === '1') {
        count++
        flood(r, c)
      }
    }
  return count
}

function numIslandsBFS(grid) {
  let count = 0
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== '1') continue
      count++
      grid[r][c] = '0'
      const queue = [[r, c]]
      for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head]
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (grid[x + dx]?.[y + dy] === '1') {
            grid[x + dx][y + dy] = '0'
            queue.push([x + dx, y + dy])
          }
        }
      }
    }
  return count
}
```

### 链表排序（对链表做归并排序，ACM 输入输出格式）？其中的 dummy 哨兵节点是必须的吗、为什么选归并而不是快排？

> “链表适合归并排序：找中点拆分、递归排序、线性合并，时间 O(n log n)，额外递归栈 O(log n)，无需随机访问。链表快排不如数组自然且稳定性较差。dummy 不是必须，但能统一处理头节点变化，减少分支。”

```js
function sortList(head) {
  if (!head?.next) return head
  let slow = head,
    fast = head.next
  while (fast?.next) {
    slow = slow.next
    fast = fast.next.next
  }
  const right = slow.next
  slow.next = null
  return mergeTwoLists(sortList(head), sortList(right))
}

// ACM 输入可先把一行整数转链表，输出时再线性遍历：
function fromArray(values) {
  const dummy = { next: null }
  let tail = dummy
  for (const val of values) tail = tail.next = { val, next: null }
  return dummy.next
}
```

### 二叉树的锯齿形（Z 字形）层序遍历如何实现（奇数层正序、偶数层逆序，用双端队列或标记层级方向）？

> “普通队列按层读取，每层根据方向选择 push 或 unshift 即可；为了避免 unshift 的移动成本，可以预分配层数组并计算写入下标，整体 O(n)。”

```js
function zigzagLevelOrder(root) {
  if (!root) return []
  let queue = [root],
    leftToRight = true
  const result = []
  while (queue.length) {
    const level = new Array(queue.length),
      next = []
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i]
      level[leftToRight ? i : queue.length - 1 - i] = node.val
      if (node.left) next.push(node.left)
      if (node.right) next.push(node.right)
    }
    result.push(level)
    queue = next
    leftToRight = !leftToRight
  }
  return result
}
```

### 合并区间（LeetCode 56，给定若干区间，合并所有重叠区间并输出）？

> “先按区间起点排序，再线性扫描：若当前起点不大于上一合并区间的终点就扩展终点，否则开启新区间。排序占 O(n log n)，扫描 O(n)。”

```js
function mergeIntervals(intervals) {
  if (intervals.length < 2) return intervals.map((item) => [...item])
  const sorted = intervals.map((item) => [...item]).sort((a, b) => a[0] - b[0])
  const result = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1]
    const current = sorted[i]
    if (current[0] <= last[1]) last[1] = Math.max(last[1], current[1])
    else result.push(current)
  }
  return result
}
```

---

## 场景 / 业务题

### 事件循环执行顺序输出（多道代码题）/ 给出代码判断 Promise / apply / bind 的输出

> “事件循环题我不会只背答案，而是先把同步栈、当前任务产生的微任务、下一轮宏任务分别列队；当前脚本结束后清空微任务，再进入 timer。`apply/bind` 还要先判断 this 和参数，bind 返回的新函数不会立即执行。”

```js
console.log('A')
setTimeout(() => console.log('B'), 0)
Promise.resolve()
  .then(() => {
    console.log('C')
    queueMicrotask(() => console.log('D'))
  })
  .then(() => console.log('E'))
console.log('F')

// 输出：A F C D E B
// 第一个 then 完成后才把 E 对应反应加入微任务队列；D 已先入队。

function show(a, b) {
  return [this.name, a, b]
}
const bound = show.bind({ name: 'bind' }, 1)
console.log(show.apply({ name: 'apply' }, [2, 3])) // ['apply', 2, 3]
console.log(bound(4)) // ['bind', 1, 4]
```

### 提取 URL 中 ? 后和 # 后的参数 / 解析 URL（手撕）

> “标准 URL 解析优先用 URL API，它能正确处理编码、相对地址、重复参数和 hash。题目若要求同时解析 `?` 与 `#` 后参数，我会分别读取 searchParams 和去掉 `#` 后再构造 URLSearchParams；重复 key 保留为数组。”

```js
function paramsToObject(params) {
  const result = Object.create(null)
  for (const [key, value] of params) {
    if (!(key in result)) result[key] = value
    else result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value]
  }
  return result
}

function parseUrl(input, base = location.href) {
  const url = new URL(input, base)
  const hashText = url.hash.slice(1)
  const hashQuery = hashText.includes('?') ? hashText.split('?').slice(1).join('?') : hashText
  return {
    origin: url.origin,
    pathname: url.pathname,
    query: paramsToObject(url.searchParams),
    hash: url.hash,
    hashParams: paramsToObject(new URLSearchParams(hashQuery)),
  }
}
```

### 手写 SSE 解析器、按 token 流式渲染 Markdown；流式场景下 Markdown 表格如何判断"完整解析"再一次性渲染？HTML 标签流式缓冲区处理？

> “SSE 解析器必须处理一个事件跨多个 chunk、CRLF、多个 data 行和最后残留。Markdown 不应每个 token 全量重解析；我维护协议缓冲与展示缓冲，对未闭合代码围栏、HTML 标签和表格行先保留，达到安全边界再提交渲染。”

````js
async function* parseSSE(byteStream) {
  const decoder = new TextDecoder()
  let buffer = ''
  const parseBlock = (block) => {
    let event = 'message',
      id
    const data = []
    for (const line of block.split(/\r\n|\r|\n/)) {
      if (!line || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'data') data.push(value)
      else if (field === 'event') event = value
      else if (field === 'id' && !value.includes('\0')) id = value
    }
    return data.length ? { event, id, data: data.join('\n') } : null
  }

  for await (const chunk of byteStream) {
    buffer += decoder.decode(chunk, { stream: true })
    while (true) {
      const delimiter = buffer.match(/(?:\r\n|\r|\n)(?:\r\n|\r|\n)/)
      if (!delimiter) break
      const block = buffer.slice(0, delimiter.index)
      buffer = buffer.slice(delimiter.index + delimiter[0].length)
      const parsed = parseBlock(block)
      if (parsed) yield parsed
    }
  }
  buffer += decoder.decode()
  const trailing = parseBlock(buffer)
  if (trailing) yield trailing
}

function createMarkdownBuffer(commit) {
  let pending = '',
    fenceOpen = false
  return (token, done = false) => {
    pending += token
    const fences = pending.match(/```/g)?.length ?? 0
    fenceOpen = fences % 2 === 1
    const lastLineComplete = pending.endsWith('\n')
    const htmlOpen = /<([a-z][\w-]*)\b[^>]*>[^<]*$/i.test(pending)
    if (done || (!fenceOpen && !htmlOpen && lastLineComplete)) {
      commit(pending)
      pending = ''
    }
  }
}
````

> “表格的严格处理应交给支持增量 AST 的 Markdown 解析器；启发式正则只能做 UI 缓冲，不能替代净化和 XSS 防护。”

### 推流场景的截流、缓冲区管理、流式数据消费 / AI 流式返回数据的打字机式传输；后端一直吐数据如何保证前端不卡（Web Worker 释放计算线程）

> “网络流、解析、显示节奏要分离。接收端只把 token 放入有上限的队列，`requestAnimationFrame` 每帧消费一小批，批量更新一次 DOM；高水位时暂停 reader 形成背压，重解析任务放 Worker。停止时同时取消 reader 和后端任务。”

```js
function createTokenPainter(render, { perFrame = 24, highWaterMark = 2000 } = {}) {
  const queue = []
  let frame = 0,
    stopped = false
  const paint = () => {
    frame = 0
    if (stopped) return
    const batch = queue.splice(0, perFrame).join('')
    if (batch) render(batch)
    if (queue.length) frame = requestAnimationFrame(paint)
  }
  return {
    async push(token) {
      while (queue.length >= highWaterMark && !stopped) {
        await new Promise(requestAnimationFrame)
      }
      queue.push(token)
      if (!frame) frame = requestAnimationFrame(paint)
    },
    stop() {
      stopped = true
      cancelAnimationFrame(frame)
      queue.length = 0
    },
  }
}

async function consumeResponse(response, painter, signal) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    while (true) {
      signal?.throwIfAborted()
      const { value, done } = await reader.read()
      if (done) break
      await painter.push(value)
    }
  } finally {
    reader.releaseLock()
  }
}
```

### 虚拟列表 / 几十万行文本渲染卡顿优化（虚拟滚动 / 分片渲染 / DocumentFragment）；表格合并单元格时懒加载设计；长列表遍历阻塞主线程用 Web Worker

> “几十万行的核心不是 DocumentFragment，而是不要同时创建几十万个节点。固定高度虚拟列表根据 scrollTop 算可见区和 overscan，只渲染窗口；动态高度则维护测量缓存和前缀和。CPU 密集的数据预处理放 Worker，DOM 创建仍在主线程。”

```js
function visibleRange({ scrollTop, viewportHeight, rowHeight, total, overscan = 5 }) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
  return { start, end, offsetY: start * rowHeight, totalHeight: total * rowHeight }
}

function renderRows(container, rows, range) {
  const fragment = document.createDocumentFragment()
  for (let i = range.start; i < range.end; i++) {
    const row = document.createElement('div')
    row.className = 'virtual-row'
    row.textContent = rows[i].text
    fragment.append(row)
  }
  container.replaceChildren(fragment)
  container.style.transform = `translateY(${range.offsetY}px)`
}
```

> “合并单元格要让服务端或预处理层返回 span 元数据，懒加载分页边界处保留相邻分组信息，避免只加载半组时错误合并。”

### 搜索框设计 / 输入关键词推荐 / 搜索结果请求错乱（第二个先回覆盖第一个）怎么解决 / 搜索字符匹配高亮后端如何处理 / 防止用户连续点击造成多次请求

> “搜索框组合防抖、取消旧请求和版本校验：防抖减少请求，AbortController 节省资源，版本号保证即使取消未生效也不会让旧结果覆盖新结果。高亮要转义用户关键词与输出内容，不能直接拼未净化 HTML。”

```js
function debounce(fn, wait) {
  let timer
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

function createSearch(fetchResults, commit) {
  let controller,
    version = 0
  return debounce(async (keyword) => {
    controller?.abort()
    controller = new AbortController()
    const current = ++version
    try {
      const result = await fetchResults(keyword, controller.signal)
      if (current === version) commit(result)
    } catch (error) {
      if (error.name !== 'AbortError') throw error
    }
  }, 250)
}

function highlightParts(text, keyword, max = Infinity) {
  if (!keyword) return [{ text, match: false }]
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let count = 0
  return text.split(new RegExp(`(${escaped})`, 'gi')).map((part) => {
    const match = count < max && part.toLowerCase() === keyword.toLowerCase()
    if (match) count++
    return { text: part, match }
  })
}
```

### 表单校验（含异步校验）/ 动态表单（新增动态输入项）/ 设计一个分页组件（受控还是非受控）/ 复杂表单状态管理与校验

> “复杂表单我会用字段 schema 描述值、同步规则、异步规则、依赖和展示条件；状态区分 value、touched、dirty、pending、error。异步校验要防抖并取消旧请求，提交时统一 await。分页组件默认设计成受控的 `page/pageSize + onChange`，也可提供 defaultPage 作为非受控便捷入口。”

```js
async function validateForm(values, schema, signal) {
  const errors = Object.create(null)
  await Promise.all(
    Object.entries(schema).map(async ([field, rules]) => {
      for (const rule of rules) {
        signal?.throwIfAborted()
        const message = await rule(values[field], values, signal)
        if (message) {
          errors[field] = message
          break
        }
      }
    }),
  )
  return errors
}

const required = (label) => (value) => (value == null || value === '' ? `${label}不能为空` : '')
const uniqueName = (api) => async (value, _, signal) =>
  (await api.exists(value, { signal })) ? '名称已存在' : ''

function pageModel({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return {
    page: Math.min(Math.max(1, page), pages),
    pages,
    hasPrev: page > 1,
    hasNext: page < pages,
  }
}
```

### 如何实现表单校验（一面）/ 设计一个数据聚合优化方案 / ECharts 数据聚合实现方式

> “表单校验沿用上一题。ECharts 大数据先在数据层聚合，不要把十万原始点直接交给图表：按像素宽度或时间桶聚合 min/max/avg/count，缩放时按新的窗口和粒度重新计算；计算量大可放 Worker，服务端聚合用于更大数据集。”

```js
function aggregateByTime(points, bucketMs) {
  const buckets = new Map()
  for (const [timestamp, value] of points) {
    const start = Math.floor(timestamp / bucketMs) * bucketMs
    const item = buckets.get(start) ?? { start, min: value, max: value, sum: 0, count: 0 }
    item.min = Math.min(item.min, value)
    item.max = Math.max(item.max, value)
    item.sum += value
    item.count++
    buckets.set(start, item)
  }
  return [...buckets.values()]
    .sort((a, b) => a.start - b.start)
    .map((item) => [item.start, item.sum / item.count, item.min, item.max])
}

const option = (data) => ({
  animation: false,
  dataset: { source: data },
  xAxis: { type: 'time' },
  yAxis: { type: 'value' },
  series: [{ type: 'line', encode: { x: 0, y: 1 }, showSymbol: false, sampling: 'lttb' }],
})
```

### 多租户前端改造怎么设计 / 第三方页面 iframe 集成 + 按权限控制展示 / 多系统 API 数据结构（camelCase / snake_case / 中文 key）不统一如何复用 / 20+ 页面经常改字段组件如何设计 / 拖拽式 Dashboard 系统设计

> “我把多租户差异限制在配置和适配层：请求上下文带 tenantId，主题、路由、功能开关和字段 schema 按租户加载，但后端必须再次做租户隔离与 RBAC。iframe 用 sandbox、明确 allow 权限和 postMessage 来源校验。不同 API 在边界层归一化成领域模型，页面只消费稳定字段。Dashboard 用扁平组件表、布局数据、版本迁移和白名单组件注册表。”

```js
const adapters = {
  systemA: (raw) => ({ id: raw.user_id, name: raw.user_name }),
  systemB: (raw) => ({ id: raw.id, name: raw['用户名称'] }),
}

function normalizeUser(system, raw) {
  const adapter = adapters[system]
  if (!adapter) throw new Error(`unsupported system: ${system}`)
  return adapter(raw)
}

window.addEventListener('message', (event) => {
  if (event.origin !== 'https://trusted.example.com') return
  if (event.data?.type === 'dashboard:resize' && Number.isFinite(event.data.height)) {
    document.querySelector('#partner-frame').style.height = `${event.data.height}px`
  }
})

const dashboard = {
  version: 2,
  widgets: { w1: { type: 'line-chart', props: { metric: 'sales' } } },
  layout: [{ id: 'w1', x: 0, y: 0, w: 6, h: 4 }],
}
```

### 300 辆车实时位置 + 轨迹优化（绕圈 / 锯齿处理、GeoJSON、行政区数据裁剪）/ WebSocket 多连接（车辆位置 / 报警 / 设备状态）复用 / 图表与地图数据级联联动

> “300 辆车不需要 300 条连接。我会用一条鉴权 WebSocket 按 topic 复用位置、报警和设备状态，消息带 vehicleId、sequence、timestamp；前端按帧合并同车更新，用插值平滑展示，超时标离线。轨迹先去重和异常点过滤，再按缩放级别用 Douglas–Peucker 简化，行政区 GeoJSON 做切片和按需加载。图表与地图共享选中车辆 ID 和时间窗口。”

```js
function createVehicleBuffer(commit) {
  const latest = new Map()
  let frame = 0
  return (message) => {
    const previous = latest.get(message.vehicleId)
    if (!previous || message.sequence > previous.sequence) latest.set(message.vehicleId, message)
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        commit([...latest.values()])
        latest.clear()
      })
  }
}

function routeSocketMessage(message, handlers) {
  const payload = JSON.parse(message.data)
  handlers[payload.topic]?.(payload.data)
}
```

### 路由配置化 JSON 结构包含哪些属性 / 对象转字符串 JSON.stringify 何时报错（循环引用）及如何判断 / 微前端自动创建子应用更自动化方式 / 用 AI 现场开发动态表单

> “路由 JSON 至少包含 path、name、componentKey、children、meta 权限/标题/缓存和 redirect；componentKey 只能映射白名单组件，不能从服务端传任意代码。JSON.stringify 遇到循环引用会抛 TypeError，可用 WeakSet 检测。微前端自动建应用要依赖模板、脚手架、注册中心和 CI，而不是页面里动态拼代码；AI 生成动态表单也必须产出受 schema 校验的配置。”

```js
const componentRegistry = {
  users: () => import('@/views/Users.vue'),
  settings: () => import('@/views/Settings.vue'),
}

function materializeRoute(config) {
  if (!componentRegistry[config.componentKey]) throw new Error('unknown component')
  return {
    path: config.path,
    name: config.name,
    component: componentRegistry[config.componentKey],
    meta: { title: config.meta?.title, permissions: config.meta?.permissions ?? [] },
    children: config.children?.map(materializeRoute) ?? [],
  }
}

function hasCircularReference(value) {
  const ancestors = new WeakSet()
  function visit(node) {
    if (!node || typeof node !== 'object') return false
    if (ancestors.has(node)) return true
    ancestors.add(node)
    const circular = Reflect.ownKeys(node).some((key) => visit(node[key]))
    ancestors.delete(node)
    return circular
  }
  return visit(value)
}
```

### 前端路由系统（hash / history）实现、路由懒加载、页面过渡动画 / SPA 优化方向 / 弱网降级

> “hash 路由监听 hashchange，路径在 `#` 后不会发给服务端；history 路由用 pushState/replaceState 和 popstate，URL 更自然但服务端必须把未知前端路径回退到 index.html。路由懒加载用动态 import，切换动画要处理异步组件和滚动位置。SPA 优化还包括代码分割、数据缓存、预取、SSR/SSG 和错误边界；弱网时降图片质量、关闭非核心实时功能并展示可恢复状态。”

```js
class TinyHistoryRouter {
  constructor(routes, render) {
    this.routes = routes
    this.render = render
    addEventListener('popstate', () => this.resolve())
  }
  navigate(path) {
    history.pushState(null, '', path)
    this.resolve()
  }
  async resolve() {
    const route = this.routes.find((item) => item.path === location.pathname)
    if (!route) return this.render({ status: 404 })
    try {
      this.render({ status: 200, component: (await route.load()).default })
    } catch (error) {
      this.render({ status: 500, error })
    }
  }
}

const routes = [{ path: '/users', load: () => import('./Users.js') }]
```

### 实时同步服务端数据显示 / 修复数据更新不同步 / 实时音频通话跟大模型交互时延控制 / 现场用 websocket 完成前端实时更新排序的记分面板（含异常处理 / 心跳机制）/ 直播评论前端设计（成千上万条不卡顿）

> “实时页面要有快照加增量：先拉取带版本的完整快照，再消费带 sequence 的事件，发现缺号就暂停增量并重新同步。WebSocket 加应用层 ping/pong、退避重连和鉴权刷新。记分板按服务端权威分数排序，评论流只保留有界窗口并虚拟化；音频 AI 时延则按采集、ASR、LLM、TTS 分段监控并全链路流式化。”

```js
function createScoreboard(applySnapshot, applyEvent) {
  let lastSequence = 0
  return {
    snapshot(data) {
      lastSequence = data.sequence
      applySnapshot(data.rows.sort((a, b) => b.score - a.score))
    },
    event(data) {
      if (data.sequence <= lastSequence) return 'duplicate'
      if (data.sequence !== lastSequence + 1) return 'resync'
      lastSequence = data.sequence
      applyEvent(data)
      return 'applied'
    },
  }
}

function boundedAppend(list, incoming, max = 1000) {
  list.push(...incoming)
  if (list.length > max) list.splice(0, list.length - max)
}
```

### 高并发场景：1s 内对数据库进行 10w 次写入如何优化 / 后端高并发 1w 接口 down 了怎么处理 / 多用户并发操作同一资源竞态冲突（前端锁 / 服务锁 / 分布式锁）

> “十万写入不能从浏览器直打数据库，应在网关限流、批量接口、消息队列和消费者批写之间削峰，配合分区、幂等键、背压和监控。服务 down 时熔断、降级、排队或返回可查询任务 ID。多人修改同一资源首选服务端乐观锁/版本号或数据库原子条件更新；分布式锁只用于确有跨节点互斥且要处理租约、fencing token。前端锁只能防本页重复操作。”

```js
async function updateWithVersion(resource, patch) {
  const response = await fetch(`/api/resources/${resource.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'If-Match': resource.etag },
    body: JSON.stringify(patch),
  })
  if (response.status === 412) throw new Error('资源已被他人修改，请刷新后合并')
  if (!response.ok) throw new Error(`update failed: ${response.status}`)
  return response.json()
}
```

### 大文件分片上传、断点续传、进度同步一致性 / 大文件上传弱网怎么办 / 文件下载断点续传（HTTP Range）

> “上传采用初始化、查询已传分片、限并发上传、校验合并四阶段，分片以 uploadId+index 幂等；弱网动态降低并发、有限重试并把状态持久化。进度以服务端已确认字节为准，避免失败重传造成百分比倒退。下载断点续传才直接使用 Range 和 206/Content-Range。”

```js
async function uploadFile(file, api, { chunkSize = 5 * 1024 * 1024, concurrency = 3 } = {}) {
  const session = await api.init({ name: file.name, size: file.size, type: file.type })
  const uploaded = new Set(await api.uploadedParts(session.uploadId))
  const parts = []
  for (let start = 0, index = 0; start < file.size; start += chunkSize, index++) {
    if (!uploaded.has(index)) {
      const blob = file.slice(start, Math.min(file.size, start + chunkSize))
      parts.push({ index, blob })
    }
  }
  await promisePool(
    parts,
    (part) => api.uploadPart(session.uploadId, part.index, part.blob),
    concurrency,
  )
  return api.complete(session.uploadId)
}

async function resumeDownload(url, receivedBytes = 0) {
  const response = await fetch(url, {
    headers: receivedBytes ? { Range: `bytes=${receivedBytes}-` } : {},
  })
  if (!response.ok && response.status !== 206) throw new Error('download failed')
  return response.body
}
```

### 从零手写轻量业务状态机（核心模块与容错逻辑）/ 项目状态机六大状态与流转、指数退避重试、熔断

> “状态机把允许状态、事件和转移显式化，非法转移立即拒绝；副作用放在转移外并保证幂等。六态可设计为 idle、running、retrying、succeeded、failed、open，连续失败进入熔断 open，冷却后半开探测。重试只针对可恢复且幂等的操作，使用带抖动指数退避。”

```js
class StateMachine {
  constructor(initial, transitions) {
    this.state = initial
    this.transitions = transitions
  }
  send(event, payload) {
    const transition = this.transitions[this.state]?.[event]
    if (!transition) throw new Error(`invalid transition: ${this.state} -> ${event}`)
    const next = typeof transition === 'function' ? transition(payload, this) : transition
    const previous = this.state
    this.state = next
    return { previous, event, current: next }
  }
}

const task = new StateMachine('idle', {
  idle: { START: 'running' },
  running: { OK: 'succeeded', RETRY: 'retrying', FAIL: 'failed' },
  retrying: { START: 'running', OPEN: 'open' },
  open: { PROBE: 'running' },
  failed: { RESET: 'idle' },
  succeeded: { RESET: 'idle' },
})

const retryDelay = (attempt, base = 300, cap = 10_000) =>
  Math.random() * Math.min(cap, base * 2 ** attempt)
```

### 一个死锁（多线程）/ 多线程竞争状态（互斥锁）/ 数组和链表区别 / 哈希表（hashMap）原理

> “死锁是多个执行单元循环等待彼此持有的资源，通常通过固定加锁顺序、缩小临界区、超时和避免嵌套锁预防。浏览器主线程没有共享内存多线程竞争，但异步任务仍有逻辑竞态；Worker 的 SharedArrayBuffer 才会涉及 Atomics。数组连续索引、随机访问快但中间插入移动多；链表相反。HashMap 用哈希定位桶，通过链表/开放寻址处理冲突，负载因子过高时扩容。”

```js
class AsyncMutex {
  #tail = Promise.resolve()
  async runExclusive(fn) {
    let release
    const previous = this.#tail
    this.#tail = new Promise((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

const mutex = new AsyncMutex()
let balance = 0
await Promise.all(
  [1, 2, 3].map((amount) =>
    mutex.runExclusive(async () => {
      balance += amount
    }),
  ),
)
```

### 原生 HTML 实现可编辑数据表格的增删改查（新增 / 编辑 / 删除行，斑马线背景，表头点击正序倒序排序，删除弹确认框，鼠标移入显示操作列）？

> “原生表格也要保持数据为单一真相，DOM 只负责渲染；事件用 tbody 委托，排序只改变状态，删除先确认。编辑时可以用 input 或 contenteditable，但保存前必须校验，输出统一用 textContent 防 XSS。”

```js
const state = { rows: [], sortKey: 'name', direction: 1 }
const tbody = document.querySelector('tbody')

function renderTable() {
  const rows = [...state.rows].sort(
    (a, b) => String(a[state.sortKey]).localeCompare(String(b[state.sortKey])) * state.direction,
  )
  tbody.replaceChildren(
    ...rows.map((item) => {
      const tr = document.createElement('tr')
      tr.dataset.id = item.id
      for (const key of ['name', 'score']) {
        const td = document.createElement('td')
        td.textContent = item[key]
        td.contentEditable = 'true'
        td.dataset.key = key
        tr.append(td)
      }
      const action = document.createElement('td')
      const button = document.createElement('button')
      button.textContent = '删除'
      button.dataset.action = 'delete'
      action.append(button)
      tr.append(action)
      return tr
    }),
  )
}

tbody.addEventListener('input', (event) => {
  const row = state.rows.find((item) => String(item.id) === event.target.closest('tr')?.dataset.id)
  if (row && event.target.dataset.key)
    row[event.target.dataset.key] = event.target.textContent.trim()
})
tbody.addEventListener('click', (event) => {
  if (event.target.dataset.action !== 'delete') return
  const id = event.target.closest('tr').dataset.id
  if (confirm('确认删除？')) {
    state.rows = state.rows.filter((row) => String(row.id) !== id)
    renderTable()
  }
})
```

### 笔试逻辑题：两个 8 斤桶 + 一个 3 斤桶，将 16 斤水平均倒入 4 个水池（各 4 斤）如何操作？

> “这类题必须先澄清规则：水池容量是不是 4、允许桶与池之间互倒吗、每次是否必须倒到源空或目标满。若四个水池容量均为 4，允许七个容器互倒，初态 `[8,8,0,0,0,0,0]`、目标 `[0,0,0,4,4,4,4]`，可以用 BFS 自动找到最短合法步骤，避免口述遗漏。”

```js
function solveWater() {
  const capacities = [8, 8, 3, 4, 4, 4, 4]
  const start = [8, 8, 0, 0, 0, 0, 0]
  const target = '0,0,0,4,4,4,4'
  const queue = [{ state: start, steps: [] }]
  const seen = new Set([start.join(',')])
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    if (current.state.join(',') === target) return current.steps
    for (let from = 0; from < capacities.length; from++) {
      for (let to = 0; to < capacities.length; to++) {
        if (from === to || !current.state[from] || current.state[to] === capacities[to]) continue
        const amount = Math.min(current.state[from], capacities[to] - current.state[to])
        const next = [...current.state]
        next[from] -= amount
        next[to] += amount
        const key = next.join(',')
        if (!seen.has(key)) {
          seen.add(key)
          queue.push({ state: next, steps: [...current.steps, { from, to, amount, state: next }] })
        }
      }
    }
  }
  return null
}
```

> “若题目对水池操作另有限制，答案会变化，所以面试时先确认约束本身也是得分点。”

### 笔试逻辑题：两两 PK、输的人休息，小明玩 15 局、小刚 21 局、小强休息 5 局，问某一局是谁和谁 PK？

> “设总局数为 T。每局两人比赛，因此三人的参赛局数之和是 2T；小强休息 5 局，所以参赛 T-5 局。代入 `15 + 21 + (T-5) = 2T` 得 T=31，小强参赛 26 局。这里只能得到汇总次数，无法唯一确定某一具体局是谁 PK；还需要给出局号、轮换规则或休息序列。”

```js
function deriveMatches(xiaomingPlayed, xiaogangPlayed, xiaoqiangRested) {
  const total = xiaomingPlayed + xiaogangPlayed - xiaoqiangRested
  return {
    total,
    xiaoqiangPlayed: total - xiaoqiangRested,
    uniquelyDeterminesEachRound: false,
  }
}

deriveMatches(15, 21, 5)
// { total: 31, xiaoqiangPlayed: 26, uniquelyDeterminesEachRound: false }
```

### 封装一个 v-scroll 自定义滚动指令的思路是什么？触底加载（是否到底、何时触发请求、重复触发如何拦截）的逻辑怎么实现？

> “Vue 指令只封装 DOM 行为，不把业务请求写死；值传入 onReachEnd、disabled 和 threshold。优先用 IntersectionObserver 观察底部哨兵，比持续计算 scrollTop 更稳；指令要在 updated 更新配置，在 unmounted 释放 observer。组件侧用 loading 和 hasMore 防重复。”

```js
const scrollRecords = new WeakMap()

function observeScrollEnd(el, config) {
  const current = scrollRecords.get(el)
  current?.observer?.disconnect()
  const sentinel = current?.sentinel ?? el.querySelector('[data-scroll-sentinel]')
  const record = { config, sentinel, observer: null }
  record.observer = new IntersectionObserver(
    ([entry]) => {
      const latest = scrollRecords.get(el)?.config
      if (entry.isIntersecting && latest && !latest.disabled) latest.onReachEnd()
    },
    { root: el, rootMargin: `0px 0px ${config.threshold ?? 100}px` },
  )
  record.observer.observe(sentinel)
  scrollRecords.set(el, record)
}

export const vScroll = {
  mounted(el, binding) {
    const sentinel = document.createElement('div')
    sentinel.dataset.scrollSentinel = ''
    el.append(sentinel)
    scrollRecords.set(el, { sentinel })
    observeScrollEnd(el, binding.value)
  },
  updated(el, binding) {
    const previousThreshold = binding.oldValue?.threshold ?? 100
    const nextThreshold = binding.value.threshold ?? 100
    if (previousThreshold !== nextThreshold) observeScrollEnd(el, binding.value)
    else scrollRecords.get(el).config = binding.value
  },
  unmounted(el) {
    scrollRecords.get(el)?.observer.disconnect()
    scrollRecords.delete(el)
  },
}

async function loadMore() {
  if (state.loading || !state.hasMore) return
  state.loading = true
  try {
    await fetchNextPage()
  } finally {
    state.loading = false
  }
}
```

### 让你封装一个弹出框（Modal）组件，说说你的封装思路（挂载方式 / 层级 / 遮罩 / 关闭时机 / API 设计）？不依赖框架用原生怎么实现？

> “Modal 要处理挂载到 body/Teleport、z-index 管理、遮罩点击策略、ESC、焦点陷阱、关闭后焦点恢复、滚动锁和动画结束后销毁。API 同时支持声明式 open 状态和命令式 Promise。原生实现至少用 dialog 元素获得较好的可访问性基础，并用 close/cancel 统一收口。”

```js
function confirmModal({ title, message }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.setAttribute('aria-labelledby', 'modal-title')
    const heading = document.createElement('h2')
    heading.id = 'modal-title'
    heading.textContent = title
    const content = document.createElement('p')
    content.textContent = message
    const cancel = document.createElement('button')
    cancel.textContent = '取消'
    const confirm = document.createElement('button')
    confirm.textContent = '确认'
    confirm.autofocus = true
    dialog.append(heading, content, cancel, confirm)
    document.body.append(dialog)

    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      dialog.close()
      dialog.remove()
      resolve(value)
    }
    cancel.addEventListener('click', () => finish(false))
    confirm.addEventListener('click', () => finish(true))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      finish(false)
    })
    dialog.showModal()
  })
}
```

### 手写代码：父组件下有两个子组件，子组件 A 展示数字、子组件 B 是按钮，通过父组件传递实现点击按钮改变数字（状态提升与父子通信）

> “两个兄弟组件不直接互相修改。把 count 提升到父组件，A 通过 prop 展示，B 通过 emit 通知父组件，父组件更新后响应式数据再向下流动。”

```vue
<!-- Parent.vue -->
<script setup>
import { ref } from 'vue'
import NumberDisplay from './NumberDisplay.vue'
import IncrementButton from './IncrementButton.vue'

const count = ref(0)
</script>

<template>
  <NumberDisplay :value="count" />
  <IncrementButton @increment="count++" />
</template>

<!-- NumberDisplay.vue -->
<script setup>
defineProps({ value: { type: Number, required: true } })
</script>
<template>
  <output>{{ value }}</output>
</template>

<!-- IncrementButton.vue -->
<script setup>
const emit = defineEmits(['increment'])
</script>
<template><button type="button" @click="emit('increment')">+1</button></template>
```

### 拖拽画布 / 低代码编辑器：平台是基于 DOM、SVG 还是 Canvas 实现的、怎么做渲染选型？画布上有上百个组件、缩放到最小时视口内要展示多少组件、性能怎么保证？组件的自动吸附 / 对齐辅助线能力是怎么实现的？

> “表单式低代码优先 DOM，便于可访问性和组件生态；大量矢量图元选 SVG；节点/边或自由绘制达到数千时选 Canvas/WebGL，并用 DOM 覆盖编辑器。缩小时不是机械显示全部细节，而是按视口和 LOD 聚合。性能依赖扁平数据、空间索引、脏矩形、rAF 合帧和交互期间降级。吸附是在拖动候选边/中心与附近元素边界比较，低于阈值就修正坐标并画辅助线。”

```js
function snapRect(moving, nearby, threshold = 6) {
  const xCandidates = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
  const yCandidates = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]
  let dx = 0,
    dy = 0,
    bestX = threshold + 1,
    bestY = threshold + 1
  for (const rect of nearby) {
    const xs = [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
    const ys = [rect.y, rect.y + rect.height / 2, rect.y + rect.height]
    for (const from of xCandidates)
      for (const to of xs) {
        if (Math.abs(to - from) < bestX) {
          bestX = Math.abs(to - from)
          dx = to - from
        }
      }
    for (const from of yCandidates)
      for (const to of ys) {
        if (Math.abs(to - from) < bestY) {
          bestY = Math.abs(to - from)
          dy = to - from
        }
      }
  }
  return {
    x: moving.x + (bestX <= threshold ? dx : 0),
    y: moving.y + (bestY <= threshold ? dy : 0),
  }
}
```

### 自定义 JSON 编码协议 / 数据结构设计时，为什么用扁平数组而不是嵌套数组（树）？嵌套树结构在什么场景下会更好（可读性、增删改查效率、序列化体积、层级关系表达）？

> “编辑态我偏向规范化的扁平结构：实体按 id 存 Map/对象，父子关系用 parentId 和有序 childIds，单节点增删改是 O(1) 且易做协作、撤销和局部同步；嵌套树更贴近一次性递归渲染和服务端文档，可读性好。扁平结构并不一定体积更小，重复 id 关系也有成本。自定义 JSON 协议要有 version、type、payload、校验和迁移策略，不能只省几个字段名。”

```js
const documentModel = {
  version: 1,
  rootIds: ['page-1'],
  entities: {
    'page-1': { id: 'page-1', type: 'page', parentId: null, childIds: ['text-1'] },
    'text-1': {
      id: 'text-1',
      type: 'text',
      parentId: 'page-1',
      childIds: [],
      props: { text: 'Hi' },
    },
  },
}

function encodeMessage(type, payload) {
  return JSON.stringify({ version: 1, type, requestId: crypto.randomUUID(), payload })
}

function decodeMessage(text) {
  const value = JSON.parse(text)
  if (value.version !== 1 || typeof value.type !== 'string' || !('payload' in value)) {
    throw new TypeError('invalid protocol message')
  }
  return value
}
```

### 手撕：实现一个支持流式追加消息的聊天列表组件（新消息到来时如何高效更新、避免整列表全量重渲染）？

> 消息以稳定 id 存在 Map 中，列表只保存 id 顺序；流式 delta 先写入当前消息的非响应式缓冲区，再用 requestAnimationFrame 每帧批量提交一次，避免每个 token 都触发渲染。单条消息拆成独立组件并使用稳定 key，Markdown 只重算正在生成的消息，长列表使用虚拟滚动。自动滚底仅在用户本来位于底部时开启，用户上滑后显示“回到底部”按钮。切换会话或停止生成时用 AbortController 中止旧流，并校验 conversationId，防止旧响应写入新会话。

### 手撕：实现一个支持多轮对话和流式返回的 API 接口（服务端如何边生成边向客户端吐数据、如何维护每轮会话上下文）？

> 接口接收 conversationId、messageId 和本轮用户消息，服务端先校验会话归属，再从数据库加载最近消息并按 token 预算裁剪或摘要。调用模型时开启 stream，把上游 delta 转成带 sequence 的 SSE 事件及时 flush；客户端断开后通过 AbortSignal 取消上游请求。用户消息与最终助手消息用事务或明确状态落库，流中断则保存 partial/failed 状态，重试使用幂等 messageId 防止重复。并发请求按会话加锁或比较版本号，保证同一会话消息顺序稳定。

---

## 参考来源

- [牛客网面试经验](https://www.nowcoder.com/discuss)
