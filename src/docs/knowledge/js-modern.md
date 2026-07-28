# JavaScript 现代特性与实战技巧

本文梳理 ES2020 之后最常用、最能提升代码质量的现代 JavaScript 特性，配套可直接复制运行的示例，并说明「什么时候用」。示例均在现代浏览器 / Node 20+ 验证。

## ES2020+：更安全的可选与空值处理

### 可选链 `?.`

访问深层嵌套属性时避免一层层 `&&` 防御；遇到 `null / undefined` 短路返回 `undefined`，不抛错。

```js
const user = { profile: { name: '张三' } }
const name = user?.profile?.name // '张三'
const city = user?.address?.city // undefined（不报错）
const fn = obj?.doSomething?.() // 也可用于方法 / 动态属性 obj?.[key]
// user?.profile.name = 'x';          // ❌ 不能用于赋值左侧
```

**什么时候用**：读取可能缺失的后端返回、配置对象、DOM 子节点属性时。

### 空值合并 `??` 与 `??=`

`??` 只在左侧为 `null / undefined` 时兜底；`??=` 是「左侧为空才赋值」。与 `||` 的关键区别：`0`、`''`、`false` 这些假值不会被 `??` 覆盖。

```js
const count = 0
count || 10 // 10  ❌ 误把 0 当空
count ?? 10 // 0   ✅ 保留 0

function init(options = {}) {
  options.timeout ??= 5000 // 仅未传（或显式 null/undefined）时补默认
  options.retries ??= 3
  return options
}
```

**注意**：`??` 不能和 `||` / `&&` 直接混用，需括号：`(a ?? b) || c`。

### 逻辑赋值 `&&=`、`||=`、`??=`

把「判断 + 赋值」合并成一行（ES2021）。

```js
let user
user &&= normalize(user) // 左侧为真才执行右侧

let str = ''
str ||= '默认值' // '' 是假值 → 赋值

let cfg = {}
cfg.b ??= 1 // undefined → 1（见上节 ??=）
```

## 深拷贝新方案：structuredClone

`JSON.parse(JSON.stringify(obj))` 会丢失 `Date`、`Map`、`Set`、`undefined`、函数，且无法处理循环引用。

`structuredClone`（ES2022，浏览器与 Node 17+ 原生）是真·深拷贝：

```js
const original = {
  date: new Date(),
  scores: new Map([['math', 95]]),
  nested: { arr: [1, 2, 3] },
}
original.self = original // 循环引用也能处理

const clone = structuredClone(original)
clone.nested.arr.push(4)
original.nested.arr // [1, 2, 3] 原对象不受影响
clone.date instanceof Date // true
```

**限制**：不能克隆函数、DOM 节点；类实例会丢失原型方法。大对象可用 transfer 转移所有权避免复制：

```js
const buf = new ArrayBuffer(1024)
const moved = structuredClone(buf, { transfer: [buf] }) // buf 被「搬走」
```

**什么时候用**：编辑表单草稿、不可变状态更新、深比较前的快照。

## Promise 组合：all / allSettled / any

| 方法                 | 解决时机   | 拒绝时机                   | 返回                      | 适用场景                       |
| -------------------- | ---------- | -------------------------- | ------------------------- | ------------------------------ |
| `Promise.all`        | 全部成功   | 任一失败即整体拒绝         | 成功结果数组              | 多任务强依赖，一失败整体无意义 |
| `Promise.allSettled` | 全部落定   | 永不拒绝                   | `{status,value/reason}[]` | 批量请求，需逐个处理成败       |
| `Promise.any`        | 任一成功   | 全部失败（AggregateError） | 第一个成功值              | 多源竞速 / 容灾，取最快可用    |
| `Promise.race`       | 任一先落定 | 先落定者拒绝则拒绝         | 先落定者结果              | 超时控制、竞速                 |

```js
// allSettled：批量拉取，逐个处理成败
const results = await Promise.allSettled([fetch('/a'), fetch('/b')])
results.forEach((r) =>
  r.status === 'fulfilled' ? console.log('OK', r.value) : console.warn('失败', r.reason),
)

// any：从多个镜像源取最快可用
const data = await Promise.any([
  fetch('https://cdn1.example.com/x.json'),
  fetch('https://cdn2.example.com/x.json'),
]).then((r) => r.json())
```

**什么时候用**：`all` 强一致；`allSettled` 报表统计；`any` 容灾/多 CDN；`race` 加超时：`Promise.race([req, timeout(3000)])`。

## 现代迭代与集合方法

### 数组索引与查找

`at()`（ES2022）支持负数从末尾取：

```js
const arr = [10, 20, 30]
arr.at(-1) // 30  ✅ 最后一个
arr.at(-2) // 20
```

`findLast` / `findLastIndex`（ES2023）从末尾查找，适合「最后匹配的日志」：

```js
const logs = [
  { t: 1, ok: true },
  { t: 2, ok: false },
  { t: 3, ok: false },
]
logs.findLast((l) => !l.ok) // { t: 3, ok: false }
```

### 非破坏性数组方法（ES2023）

`toSorted` / `toReversed` / `toSpliced` / `with` 返回新数组，不修改原数组：

```js
const list = [3, 1, 2]
const sorted = list.toSorted((a, b) => a - b) // [1, 2, 3]
list // [3, 1, 2] 原数组不变
const replaced = list.with(0, 99) // [99, 1, 2]
```

### flatMap 与 String 新 API

```js
const orders = [{ items: ['a', 'b'] }, { items: ['c'] }]
orders.flatMap((o) => o.items) // ['a', 'b', 'c'] 映射 + 降一层扁平

'abc-abc'.replaceAll('abc', 'x') // 'x-x'（ES2021 全局替换）

const re = /(\d+)-(\d+)/g
for (const m of '12-34 and 56-78'.matchAll(re)) {
  console.log(m[1], m[2]) // 12 34 / 56 78
}
```

## 集合 Set / Map 实战

```js
// 去重
const unique = [...new Set([1, 1, 2, 3, 3])] // [1, 2, 3]

// 分组（ES2024）：替代手写 reduce
const users = [
  { role: 'admin', name: 'A' },
  { role: 'user', name: 'B' },
  { role: 'admin', name: 'C' },
]
const byRole = Object.groupBy(users, (u) => u.role)
// { admin: [{...A},{...C}], user: [{...B}] }
const byLen = Map.groupBy(['one', 'two', 'three'], (w) => w.length) // Map 非字符串 key

// Map 做缓存（Memoization）
const cache = new Map()
function expensive(key) {
  if (cache.has(key)) return cache.get(key)
  const v = computeHeavy(key)
  return cache.set(key, v).get(key)
}
```

**注意**：`groupBy` 返回浅分组，组内元素是原对象引用，改嵌套属性会影响原数组；需不可变时先 `structuredClone`。

## 事件循环：微任务与宏任务

单次循环：**执行一个宏任务 → 清空整个微任务队列 → 渲染 → 下一个宏任务**。微任务（Promise、`queueMicrotask`）优先级高于宏任务（`setTimeout`、`setInterval`、I/O、UI 事件）。

```js
console.log('1 宏任务开始')
setTimeout(() => console.log('4 宏任务'), 0)
Promise.resolve().then(() => console.log('3 微任务'))
console.log('2 宏任务结束')
// 输出：1 → 2 → 3 → 4
```

**要点**：微任务会插队，避免在微任务里无限递归 `Promise`（饿死宏任务）；`await` 之后代码等同 `.then` 回调，属微任务。

## async/await 错误处理

```js
async function load() {
  try {
    const res = await fetch('/api/data')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('加载失败', err)
    return null // 兜底
  }
}

// 回调式 API 包装成 Promise，统一风格
function readFileP(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => (err ? reject(err) : resolve(data)))
  })
}
```

并发错误隔离：用 `allSettled` 或在单个 `await` 外包 `try/catch`，防止一个失败中断整批。

## 函数技巧

```js
// 剩余 / 展开
function sum(...nums) {
  return nums.reduce((a, b) => a + b, 0)
}
const { a, ...rest } = { a: 1, b: 2, c: 3 } // rest = {b:2,c:3}

// 默认参数（注意可引用前面的参数）
function greet(name = '游客', prefix = `Hi ${name}`) {
  return `${prefix}, ${name}`
}

// 箭头函数无自己的 this，继承外层 —— 适合回调
const obj = {
  n: 1,
  inc() {
    setTimeout(() => console.log(this.n++), 0)
  },
}

// 柯里化：逐步调用的单参函数，便于偏应用
const add = (a) => (b) => a + b
add(10)(5) // 15

// 防抖：停止触发 wait 毫秒后才执行（搜索输入、resize）
function debounce(fn, wait = 300) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

// 节流：每 interval 毫秒最多执行一次（滚动、拖拽）
function throttle(fn, interval = 300) {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= interval) {
      last = now
      fn(...args)
    }
  }
}
```

## 模块化：动态导入与顶层 await

### 动态 import()：代码分割

按需加载，减小首屏体积，配合 Vue `defineAsyncComponent` 做路由懒加载：

```js
button.onclick = async () => {
  const { Chart } = await import('./heavy-chart.js') // 点击时才加载
  new Chart(container)
}

// 带错误兜底
let lib
try {
  lib = await import('./optional.js')
} catch {
  lib = fallbackImpl
}
```

### 顶层 await（ES2022）

模块顶层直接用 `await`，无需包 `async`；后续导入会等待其完成：

```js
const res = await fetch('/api/config')
export const config = await res.json() // 导入方拿到已就绪的配置
```

**注意**：顶层 await 会让模块变异步，谨慎用于入口模块，避免阻塞依赖它的其他模块。

## 小结

- 取深层属性用 `?.`，补默认值用 `??`（别再用 `||` 误伤 `0`/`''`）。
- 深拷贝优先 `structuredClone`，告别 JSON hack。
- 并发按「强一致 / 容错 / 竞速」选 `all` / `allSettled` / `any`。
- 数组多用非破坏性方法（`toSorted` 等）与 `at(-1)`；分组用 `groupBy`。
- 异步错误用 `try/catch` + `allSettled` 隔离；交互用防抖/节流。
- 体积优化靠动态 `import()` 与顶层 `await`。
