---
group: 专题速查
order: 1
---

# 前端面试知识文档

> 本文用于专题速查；需要练习第一人称口述时优先使用 `frontend-core-qa.md` 和 `mock-interviews.md`。所有“高频”只表示复习优先级，不代表某家公司固定出题概率。

## JavaScript 核心

### 闭包（Closure）

**高频问题**：什么是闭包？闭包的作用和缺点是什么？
**答案要点**：

- 定义：函数与其词法作用域（定义时所在作用域）的组合；内部函数引用了外部函数的变量，即使外部函数已执行完毕，这些变量仍被保留。
- 本质：闭包让函数按词法作用域继续访问外部绑定。规范不规定这些绑定必须以某个名为 `closure` 的堆对象存储；只要闭包仍可达，相关环境就不能被回收。
- 作用：① 数据私有化/封装（模块模式、IIFE）；② 函数柯里化与偏函数；③ 实现 React Hooks 等需要"记住状态"的场景。
- 缺点：滥用会导致内存占用增加，若外部大对象长期被引用无法回收，易引发内存泄漏。

```js
function outer(x) {
  return function inner(y) {
    return x + y
  } // inner 持有 outer 的 x
}
const add5 = outer(5)
add5(3) // 8
```

### 原型链（Prototype Chain）

**高频问题**：说说原型链的理解？如何实现继承？
**答案要点**：

- 对象内部有 `[[Prototype]]` 链，可通过 `Object.getPrototypeOf` 读取；`__proto__` 是历史 accessor，并非每个对象都天然拥有的普通属性，`Object.create(null)` 甚至没有 `Object.prototype`。
- 属性查找：自身 → 沿原型链向上查找，找不到返回 `undefined`。
- 三者关系：`prototype`（函数原型对象）、`__proto__`（实例指向原型）、`constructor`（原型指回构造函数）。
- `Function.__proto__ === Function.prototype`，`Object.prototype.__proto__ === null`。
- 继承：ES6 `class extends` 基于原型链；ES5 通过 `Child.prototype = Object.create(Parent.prototype)` + `constructor` 修正实现。

### this 绑定

**高频问题**：如何确定函数中 this 的指向？
**答案要点**：

- 优先级（高→低）：`new` 绑定 > 显式绑定（call/apply/bind）> 隐式绑定（obj.fn()，this 指向 obj）> 默认绑定（独立调用，非严格模式 `window`，严格模式 `undefined`）。
- 箭头函数：没有自己的 this，继承定义时外层作用域的 this，且一旦绑定无法被 call/apply 改变。
- new 绑定规则：构造函数里的 this 指向新创建的实例；若构造函数显式返回一个对象，则 `new` 表达式的整体返回值变为该对象，但**函数体内的 this 仍指向新实例**（并不会被返回对象改变）。
- 常见坑：定时器回调的 `this` 由宿主决定，浏览器与 Node 行为不同；业务不应依赖它，需接收外层实例时显式用箭头函数或 `bind`。

### 事件循环（Event Loop）

**高频问题**：说说宏任务和微任务的区别？下面代码输出顺序？
**答案要点**：

- 执行顺序：同步代码（宏任务）→ 清空所有微任务 → 浏览器渲染（如有）→ 下一个宏任务，循环往复。
- 宏任务：`script`、`setTimeout`、`setInterval`、`setImmediate`、I/O。（注：UI 渲染发生在宏任务之间的间隙，并不属于某个宏任务本身。）
- 微任务：`Promise.then/catch/finally`、`queueMicrotask`、`MutationObserver`、`async` 函数中 await 之后的代码。

```js
console.log(1)
setTimeout(() => console.log(2), 0)
Promise.resolve().then(() => console.log(3))
console.log(4)
// 输出：1 4 3 2
```

- Node 与浏览器差异：Node 分阶段（timers/poll/check…），`process.nextTick` 优先级高于微任务；浏览器每轮宏任务后清空微任务再渲染。
- 补充：Node 的微任务检查点、timers 行为会随运行时演进；面试回答先声明具体 Node 版本，不把浏览器 task 模型机械套到 libuv 阶段。

### Promise 与异步

**高频问题**：Promise 解决了什么问题？async/await 执行顺序？
**答案要点**：

- 回调地狱 → Promise 链式调用（`.then` 返回新 Promise 实现链式串联）；错误通过 `.catch` 冒泡到末端捕获。
- Promise 状态：`pending → fulfilled/rejected`，一经变更不可再改。
- `async/await` 是 Promise 的语法糖：`await` 右侧值会被 `Promise.resolve` 包裹，后续代码等价于 `.then` 回调（微任务）。
- `Promise.all`（全成功才成功，遇 reject 立即失败）/ `allSettled`（等全部 settle，不短路）/ `race`（第一个 settle 即决定）/ `any`（第一个 fulfilled）。

### 深浅拷贝

**高频问题**：如何实现深拷贝？JSON 方式有什么缺陷？
**答案要点**：

- 浅拷贝：`Object.assign`、`{...obj}`、数组 `slice/concat`，只复制第一层引用。
- `JSON.parse(JSON.stringify(obj))`：简单但有缺陷——丢失 `undefined`/函数/`Symbol`、无法处理 `Date`（转字符串）、`RegExp`、循环引用直接报错。
- 手写深拷贝需递归 + `WeakMap` 缓存处理循环引用，并区分类型（Date/RegExp/Map/Set/Array 等，见下方实现）。

```js
function deepClone(obj, cache = new WeakMap()) {
  if (obj === null || typeof obj !== 'object') return obj
  if (cache.has(obj)) return cache.get(obj)

  // 区分特殊内置类型，避免 Map/Set/Date/RegExp 失真
  if (obj instanceof Date) return new Date(obj)
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags)
  if (obj instanceof Map) {
    const m = new Map()
    cache.set(obj, m)
    obj.forEach((v, k) => m.set(deepClone(k, cache), deepClone(v, cache)))
    return m
  }
  if (obj instanceof Set) {
    const s = new Set()
    cache.set(obj, s)
    obj.forEach((v) => s.add(deepClone(v, cache)))
    return s
  }

  const clone = Array.isArray(obj) ? [] : {}
  cache.set(obj, clone)
  for (const key of Reflect.ownKeys(obj)) {
    clone[key] = deepClone(obj[key], cache)
  }
  return clone
}
```

### 防抖与节流

**高频问题**：防抖和节流的区别？分别适用什么场景？
**答案要点**：

- 防抖（debounce）：事件触发后延迟 N 秒执行，期间再次触发则重新计时——只执行最后一次。适用：搜索框输入、窗口 resize。
- 节流（throttle）：N 秒内最多执行一次，无视中间高频触发。适用：滚动加载、鼠标移动、按钮连点。
- 进阶：`leading`（首次立即）/ `trailing`（尾部）选项；可用 `timestamp` 或 `setTimeout` 实现。

```js
function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
```

### ES6+ 新特性

**高频问题**：ES6+ 你常用的新特性有哪些？
**答案要点**：

- 变量：`let`/`const`（块级作用域，暂时性死区，`const` 绑定不可变但对象内部可变）。
- 解构、剩余/扩展运算符 `...`、模板字符串、默认参数。
- 箭头函数（无 this/arguments，不能 new）、`class`、模块化 `import/export`。
- 新增类型：`Symbol`（唯一值、元编程）、`BigInt`（大整数）。
- `Promise`、`async/await`、`Set/Map`、`Proxy/Reflect`、`for...of`、可选链 `?.`、空值合并 `??`。

## TypeScript

### interface 与 type 的区别

**高频问题**：interface 和 type 有什么区别？各自适用场景？
**答案要点**：

- 相同点：都能描述对象结构。
- interface：支持声明合并（多次声明自动合并），可被 `class implements`，适合公共 API、第三方库类型扩展。
- type：更灵活，可表示联合 `|`、交叉 `&`、元组、基本类型、映射类型、条件类型；不可重复声明。
- 经验法则：对象结构且可能扩展用 `interface`；联合/交叉/复杂类型组合用 `type`。

```ts
interface User {
  id: number
}
interface User {
  name: string
} // 合并：{ id: number; name: string }
type ID = string | number
```

### 泛型（Generics）

**高频问题**：什么是泛型？如何写带约束的泛型？
**答案要点**：

- 泛型让函数/类/接口在定义时不指定具体类型，使用时再传入，保留类型推导（对比 `any` 丢失类型信息）。
- 约束：`<T extends ...>` 限制入参类型；`keyof` + 索引访问 `T[K]` 实现类型安全的属性读取。
- 应用场景：通用工具函数、React 组件 props 泛型、容器类、`Result<T, E>` 模式。

```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}
```

### 类型收窄（Type Narrowing）

**高频问题**：如何收窄联合类型？什么是类型守卫？
**答案要点**：

- `typeof` / `instanceof` 守卫：在分支内自动收窄类型。
- 自定义类型守卫：返回 `arg is Type` 谓词函数，告诉编译器收窄结果。
- 判别联合（Discriminated Unions）：用字面量成员（如 `type: 'circle'`）配合 `switch` 做精确收窄。
- 注意：TypeScript 是编译期工具，运行时类型不存在——外部数据必须运行时校验（如 Zod）。

### 工具类型（Utility Types）

**高频问题**：常用内置工具类型有哪些？分别做什么？
**答案要点**：

- `Partial<T>`：所有属性变可选；`Required<T>` / `Readonly<T>`：全必填 / 全只读。
- `Pick<T, K>` / `Omit<T, K>`：挑选 / 排除部分属性。
- `Record<K, T>`：构造键值映射字典。
- `ReturnType<T>` / `Parameters<T>`：提取函数返回值 / 参数类型。
- `Exclude<T, U>` / `Extract<T, U>` / `NonNullable<T>`：从联合中排除/提取/去空。

### any / unknown / never

**高频问题**：any、unknown、never 有什么区别？
**答案要点**：

- `any`：关闭类型检查，且会"传染"，应尽量避免。
- `unknown`：能接收任何值，但使用前必须收窄，是 any 的安全替代。
- `never`：底部类型，无任何值可赋给它；常用于穷尽性检查（exhaustive check）。

### 类型体操与条件类型

**高频问题**：条件类型与 infer 有什么用？
**答案要点**：

- 条件类型：`T extends U ? X : Y`，类似三元运算，可在类型层面做分支。
- `infer`：在条件类型中"提取"某个位置的类型，如 `T extends Promise<infer U> ? U : T`。
- 映射类型：`{ [K in keyof T]: ... }` 遍历键变换；配合 `as` 可做键重映射。
- 模板字面量类型可构造类型级别的字符串联合。
- `satisfies`（TS 4.9）：在保留字面量精确类型的同时做类型校验，避免 `as const` 的类型固化或丢失推导。例如 `const cfg = { a: 1 } satisfies Config` 既校验又保留 `{ a: number }` 而非锁死为字面量。
- `as const`：把值转为只读字面量类型（如 `"a"` 而非 `string`），常用于常量表/判别联合。

## Vue

### 响应式原理（ref / reactive）

**高频问题**：Vue3 的响应式是如何实现的？Proxy 相比 defineProperty 好在哪？
**答案要点**：

- Vue2：`Object.defineProperty` 劫持 getter/setter，递归遍历；缺陷：无法监听新增/删除属性、数组下标与 length 变化。
- Vue3：`Proxy` 代理整个对象，拦截 `get/set/delete/has`，配合 `Reflect` 保证 this 指向正确。
- 依赖收集：`track()` 在 get 时把当前 `activeEffect` 存入 `WeakMap → depsMap → Set`；`trigger()` 在 set 时通知依赖。
- `ref` 包裹基本类型（`.value`），`reactive` 处理对象；解构 reactive 会丢响应性（用 `toRefs`）。

### Diff 算法与 key

**高频问题**：为什么 key 不能用 index？
**答案要点**：

- Vue3 基于 key 的 Map 映射 + 最长递增子序列（LIS）最大复用节点，不跨层级；通过 key 建立新旧节点映射，复用相同 key 的 DOM。（注：双端比较是 **Vue2** 的算法，Vue3 已去掉双端比较，改为「编译期 PatchFlag + 运行时 key 映射 + LIS」。）
- Vue3 采用「编译时优化 + 运行时 diff」：静态提升、PatchFlag 标记动态节点，只比对动态部分。
- 不用 index 作 key：列表增删/排序时 index 变化，导致状态错乱和额外重建。

### 生命周期

**高频问题**：Vue3 组合式 API 生命周期如何使用？
**答案要点**：

- 选项式：`created / mounted / updated / beforeUnmount / unmounted` 等。
- 组合式：`setup` 在 `beforeCreate` 之前执行；`onMounted`、`onUpdated`、`onUnmounted` 需在 `setup` 同步调用。
- 父子挂载顺序：父 beforeMount → 子 beforeMount → 子 mounted → 父 mounted。

### 组件通信

**高频问题**：Vue 组件间通信有哪些方式？
**答案要点**：

- 父子：`props` 向下 / `emit` 向上（`v-model` = `modelValue + update:modelValue`，`defineModel` 简化）。
- 跨级：`provide/inject`；Vue3 可用 `mitt` 事件总线。
- 全局：Pinia / Vuex。`ref + defineExpose` 父访问子实例。
- 选择原则：局部用 props/emit；跨多层用 provide/inject；全局用 Pinia。

### Vue3 vs Vue2 核心改进

**高频问题**：Vue3 相比 Vue2 有哪些重大改进？
**答案要点**：

- 响应式：`Proxy` 替代 `defineProperty`。
- 性能：编译期优化（静态提升、PatchFlag），包更小（Tree-shaking）。
- Composition API：按逻辑关注点组织，解决 Mixins 冲突。
- 新特性：`Fragment`、`Teleport`、`Suspense`、`<script setup>`；TS 支持更好。

### Pinia 状态管理

**高频问题**：Pinia 相比 Vuex 有什么优势？
**答案要点**：

- 无 `mutations`（action 可同步/异步），`state`/`getters`/`actions` 结构清晰。
- 优势：极简 API、完美 TS 类型推导、支持组合式写法、体积更小。
- 持久化：`pinia-plugin-persistedstate`；`storeToRefs` 保持响应性解构。

### nextTick 原理

**高频问题**：Vue 的 nextTick 是什么？
**答案要点**：

- 作用：在 DOM 更新完成后执行回调。
- 原理：数据变更触发的 DOM 更新推入异步队列批量去重；nextTick 优先用 `Promise.then`（微任务）。
- 场景：修改数据后需立即读取更新后的 DOM 尺寸/位置。

## React

### Hooks 原理

**高频问题**：Hooks 为什么不能在循环/条件里调用？
**答案要点**：

- Hooks 依赖「调用顺序」：React 在每个 Fiber 上用链表按顺序存储 hook 状态；顺序变化会错位。
- `useState`：闭包 + 链表节点保存 state；函数式更新 `setState(prev => ...)` 避免闭包旧值。
- `useEffect`：渲染后异步执行；返回清理函数在依赖变更前/卸载时执行。
- 自定义 Hook：`use` 开头，抽离可复用逻辑。

### Fiber 架构

**高频问题**：Fiber 解决了什么问题？
**答案要点**：

- 背景：React 15 同步递归渲染会长时间阻塞主线程。
- Fiber 将渲染拆分为可中断/恢复的工作单元，通过时间切片调度。
- 双缓存：`current` 树与 `workInProgress` 树，渲染完整体替换。
- 两阶段：协调阶段（可中断）→ 提交阶段（同步更新 DOM）。

### 虚拟 DOM 与 Diff

**高频问题**：虚拟 DOM 有什么用？
**答案要点**：

- 虚拟 DOM 是真实 DOM 的轻量 JS 描述；价值在声明式编程 + 批量/合并更新。
- Diff 启发式：① 同级比较不跨层；② 不同类型直接重建；③ 同类型复用更新属性；④ 列表用 key 追踪。

### 状态管理

**高频问题**：Redux、Zustand、MobX 有什么区别？
**答案要点**：

- Redux：单向数据流 + Reducer，规范强，`@reduxjs/toolkit` 简化模板。
- Zustand：基于 hooks 的轻量 store，是否采用取决于团队、状态关系和调试需求。
- MobX：响应式自动追踪依赖，代码量少。
- 内置：`useState`/`useReducer`（局部）、`Context`（跨组件，高频更新需优化）。

### useMemo / useCallback

**高频问题**：useMemo 和 useCallback 有什么区别？
**答案要点**：

- `useMemo`：缓存计算结果（返回「值」）。
- `useCallback`：缓存函数引用（返回「函数」），配合 `React.memo` 防子组件无效重渲染。
- 不要过度使用——本身有记忆开销，仅在有性能瓶颈时加。

### setState 批处理

**高频问题**：React 18 批处理有什么变化？
**答案要点**：

- 事件处理/生命周期中 setState 异步批处理，多次合并为一次更新。
- React 18 前：仅合成事件/生命周期批处理，Promise/setTimeout 不批。
- React 18 后：默认「自动批处理」扩展到所有场景。
- 拿更新后值用函数式更新；强制同步用 `flushSync`。

### React 19 新特性

**高频问题**：React 19 相比 18 有哪些重要变化？
**答案要点**：

- `use`：在渲染期读取 Promise / Context，支持 Suspense 异步数据获取；可在条件/循环中调用（区别于其他 Hook 必须在顶层）。
- Actions：内置 `useActionState`（表单状态 + 提交）、`useOptimistic`（乐观 UI 更新）、`useFormStatus`（只读表单状态），表单提交成为一等公民。
- `<form>` 原生支持 `action` / `formAction` + `useActionState`，减少手写 `useState` 管理。
- `ref` 可作 props 直接传递（`ref={ref}`），不再需要 `forwardRef` 包裹即可透传。
- 资源与元数据：`<link>` / `<meta>` / `<script>` 在组件中声明即自动提升去重，自动管理 `document.title` 等。
- 其他：`createRoot` 成为唯一入口（`ReactDOM.render` 已移除）；`useDeferredValue` 性能改进。

## CSS / HTML

### 盒模型（Box Model）

**高频问题**：标准盒模型和 IE 盒模型的区别？
**答案要点**：

- 组成：content + padding + border + margin。
- 标准（`content-box`）：`width` 仅内容区；IE（`border-box`）：`width` 含 content+padding+border。
- 推荐 `box-sizing: border-box`，更好控制尺寸。

### BFC（块级格式化上下文）

**高频问题**：什么是 BFC？如何触发？
**答案要点**：

- BFC 是独立渲染区域，内部布局不影响外部。
- 触发：`overflow` 非 visible、`float` 非 none、`position: absolute/fixed`、`display: flex/grid/flow-root`。
- 作用：清除浮动、阻止 margin 重叠、隔离浮动。

### Flex 与 Grid

**高频问题**：Flexbox 和 Grid 的区别？
**答案要点**：

- Flexbox：一维布局（行或列），适合组件级（导航、卡片、居中）。
- Grid：二维布局，适合页面级/复杂网格。
- 常用 Grid 布页面骨架，内部用 Flex 对齐。
- Flex 核心：`justify-content`（主轴）、`align-items`（交叉轴）、`flex: 1`。

### 水平垂直居中

**高频问题**：实现元素在父容器中水平垂直居中？
**答案要点**：

- Flex（首选）：`display:flex; justify-content:center; align-items:center;`
- Grid：`display: grid; place-items: center;`
- 绝对定位 + transform：`top:50%; left:50%; transform:translate(-50%,-50%);`
- 绝对定位 + `inset:0; margin:auto;`（需固定宽高）。

### 层叠上下文（Stacking Context）

**高频问题**：z-index 为什么有时不生效？
**答案要点**：

- 创建条件：定位 + z-index 非 auto、`opacity<1`、`transform`、`filter`、`will-change`、`position: fixed`。
- `z-index` 只在定位元素或已创建层叠上下文上生效；不同上下文按父级顺序比较。

### 响应式与适配

**高频问题**：如何实现移动端适配？rem 和 em 的区别？
**答案要点**：

- viewport meta + 媒体查询 `@media`；现代有容器查询 `@container`。
- `rem` 相对根元素字体；`em` 相对当前元素字体。
- 视口单位 `vw/vh`；`clamp()` 实现流式字体。

### 语义化与 HTML5

**高频问题**：HTML5 语义化标签有哪些？为什么重要？
**答案要点**：

- 语义标签：`<header> <nav> <main> <article> <section> <aside> <footer>`。
- 价值：SEO 友好、可访问性、结构清晰易维护。
- `<!DOCTYPE html>` 避免怪异模式；`data-*` 自定义数据。

## 浏览器与网络

### 从输入 URL 到页面渲染

**高频问题**：从输入 URL 到页面显示，发生了什么？
**答案要点**：

- DNS 解析 → TCP 三次握手（HTTPS 再 TLS 握手）→ 发送 HTTP 请求 → 服务器响应。
- 浏览器渲染：解析 HTML→DOM、CSS→CSSOM → Render Tree → Layout（回流）→ Paint → Composite。
- JS 阻塞：`defer`（并行下载、解析完顺序执行）/ `async`（下载完立即执行、不保序）。

### HTTP 缓存

**高频问题**：强缓存和协商缓存的区别？
**答案要点**：

- 强缓存：命中直接读本地不发请求；`Cache-Control: max-age`（优先）、`Expires`。
- 协商缓存：向服务器校验，未变返回 `304`；`ETag/If-None-Match`（精确）、`Last-Modified`。
- 实战：HTML 短缓存；带 hash 静态资源长期强缓存 `max-age=31536000, immutable`。

### HTTPS 原理

**高频问题**：HTTPS 是怎么保证安全的？
**答案要点**：

- HTTP + TLS：非对称加密（交换密钥、身份认证）+ 对称加密（传数据）+ 数字证书（CA 防中间人）。
- 握手：客户端与服务端协商版本/套件，服务端提供证书证明身份，双方通常通过（EC）DHE 协商共享密钥，再派生会话密钥；不是现代 TLS 都由客户端直接用证书公钥加密一个对称密钥。
- TLS 1.3 简化握手；HTTP/3 基于 QUIC。

### 跨域与 CORS

**高频问题**：什么是跨域？如何解决？
**答案要点**：

- 同源策略：协议、域名、端口相同才同源。
- CORS：服务端设 `Access-Control-Allow-Origin` 等响应头。
- 预检请求（OPTIONS）：非简单请求先发预检。
- 其他：DevServer/Nginx 代理、`postMessage`、JSONP（仅 GET）。

### HTTP/2 与 HTTP/3

**高频问题**：HTTP/2、HTTP/3 相比 HTTP/1.1 有什么改进？
**答案要点**：

- HTTP/1.1 问题：队头阻塞、头部冗余、多连接开销。
- HTTP/2：多路复用、头部压缩（HPACK）、二进制分帧；仍基于 TCP。Server Push 已不应作为现代浏览器优化主线。
- HTTP/3：基于 QUIC，流之间不会因某个流的数据丢失而共同等待该数据重传，并支持连接迁移等能力；0-RTT 有重放边界，不能概括成所有请求天然更快。

### Cookie 与 Storage

**高频问题**：Cookie、localStorage、sessionStorage 的区别？
**答案要点**：

- Cookie：随请求自动携带（4KB），可设 `HttpOnly`（防 XSS）、`Secure`、`SameSite`（防 CSRF）。
- localStorage：持久化、同源共享、约 5MB。
- sessionStorage：会话级，标签页关闭即清。

## 性能优化

### Core Web Vitals 核心指标

**高频问题**：Core Web Vitals 包含哪些？如何优化？
**答案要点**：

- LCP（最大内容绘制）≤ 2.5s：CDN/缓存、预加载、图片 WebP/AVIF、SSR/SSG。
- INP（交互到下次绘制，取代 FID）≤ 200ms：拆长任务、Web Worker、减少 JS 执行。
- CLS（累积布局偏移）≤ 0.1：图片设宽高、预留占位、动画用 transform。
- 工具：Lighthouse、Performance 面板、Sentry 监控上报。

### 首屏加载优化

**高频问题**：首屏加载慢怎么优化？
**答案要点**：

- 网络：HTTP/2、CDN、Gzip/Brotli、图片 WebP、`preconnect`/`preload`。
- 资源：代码分割、Tree Shaking、路由/组件懒加载、按需引入。
- 渲染：SSR/SSG、关键 CSS 内联、骨架屏。
- 缓存：强缓存+协商缓存、Service Worker、文件 hash。

### 懒加载与虚拟列表

**高频问题**：图片/组件懒加载如何实现？长列表怎么优化？
**答案要点**：

- 图片懒加载：`IntersectionObserver` 或原生 `loading="lazy"`。
- 组件/路由懒加载：`import()` + React.lazy/Suspense、Vue `defineAsyncComponent`。
- 虚拟列表：只渲染可视区 + 缓冲区 DOM（react-window / vue-virtual-scroller）。

### 长任务拆分与动画

**高频问题**：长任务如何拆分？
**答案要点**：

- 长任务（>50ms）阻塞主线程：用 `requestIdleCallback`/`MessageChannel` 切片让出主线程。
- 动画用 `requestAnimationFrame`（与刷新率同步）。
- 计算密集任务交给 Web Worker。

### Webpack / Vite 构建优化

**高频问题**：如何减小打包体积？
**答案要点**：

- 代码分割：SplitChunks、路由懒加载生成独立 chunk。
- 压缩：Terser、CssMinimizer。
- Tree Shaking：ESM + 生产模式 + 库提供 ESM 版本。
- 分析：`webpack-bundle-analyzer` 定位大包；`contenthash` 持久缓存。

### 重绘与回流（Reflow / Repaint）

**高频问题**：如何减少重绘和回流？
**答案要点**：

- 回流：几何属性变化重算布局，开销大；重绘：仅视觉变化。回流必重绘。
- 避免强制同步布局：先批量读再批量写。
- `transform`/`opacity` 通常更容易只触发合成，但是否独立成层由浏览器决定；用 Performance/Layers 验证，避免滥用 `will-change`。
- 批量 DOM 操作：`DocumentFragment`、一次性改 class。

## 工程化

### Webpack vs Vite

**高频问题**：Webpack 和 Vite 的核心区别？
**答案要点**：

- Webpack 是高度可配置的 bundler；Vite 开发环境基于原生 ESM 按需转换，通常减少启动期工作。
- HMR 性能取决于模块图、插件和更新边界，不能承诺所有项目“毫秒级”。
- 当前 Vite 8 已转向 Rolldown/Oxc；VueChest 锁定 Vite 7.0.6，实际仍按 Rollup/esbuild 路径理解。
- 选型看存量 loader/plugin、浏览器目标、SSR/库构建、CI/HMR 基准和迁移成本，不按项目大小一刀切。

### Tree Shaking

**高频问题**：Tree Shaking 的原理和条件？
**答案要点**：

- 原理：基于 ESM 静态结构标记未使用导出，压缩阶段剔除（Dead Code Elimination）。
- 条件：① 使用 ESM；② 生产模式；③ 库提供 ESM 版本（lodash-es 而非 lodash）。
- `package.json` 的 `sideEffects` 帮助更激进摇树；避免 `import * as`。

### 模块化（CommonJS vs ESM）

**高频问题**：CommonJS 和 ES Module 的区别？
**答案要点**：

- 结构：CJS 的 `require` 可动态调用；ESM 的静态 `import/export` 便于构建期分析，也提供动态 `import()`。
- 导出：ESM import 是 live binding；CJS 暴露 `module.exports` 值，对象可共享，解构/重新赋值等行为不能简单概括成“值拷贝”。
- 循环依赖：两者都可能出现未初始化/部分初始化问题，ESM live binding 不等于循环依赖自动安全。
- 语法：CJS `module.exports/require`；ESM `export/import`。

### Babel

**高频问题**：Babel 的工作流程？如何兼容低版本浏览器？
**答案要点**：

- 三阶段：解析（→AST）→ 转换（插件改 AST）→ 生成（→目标代码）。
- `@babel/preset-env` 按 `targets` 自动引入插件与 polyfill。
- `useBuiltIns: 'usage'` + core-js 按需注入 polyfill。
- Babel 只转语法，新 API 需 polyfill。

### Monorepo

**高频问题**：什么是 Monorepo？优势和挑战？
**答案要点**：

- 多个关联项目放同一 Git 仓库管理。
- 优势：代码复用、依赖版本统一、共享配置、原子提交。
- 工具：pnpm workspace、Turborepo、Nx、Lerna。
- pnpm 用硬链接省磁盘、无幽灵依赖。

### CI/CD 与质量保障

**高频问题**：前端 CI/CD 流程？如何保障代码质量？
**答案要点**：

- 流程：提交 → 检查（ESLint/Prettier）→ 测试（Jest/Vitest）→ 构建 → 部署（GitHub Actions/Docker）。
- 工具：`Husky + lint-staged` 提交前校验。
- 测试组合按风险与反馈速度决定：纯函数多单测，组件/接口边界多集成，关键用户旅程用少量稳定 E2E；不套固定 70/20/10 比例。
- 监控闭环：上线后 Sentry + Web Vitals 埋点。

### 包管理器（npm / yarn / pnpm）

**高频问题**：npm、yarn、pnpm 有什么区别？
**答案要点**：

- npm：官方生态默认选择，现代版本也有 lockfile、cache 与 workspace。
- Yarn：支持不同 linker/Plug'n'Play 与 workspace，行为取决于主版本和配置。
- pnpm：内容寻址 store + 链接式 node_modules，默认更严格暴露依赖；速度和磁盘收益要在仓库/CI 实测，也可通过 hoist 配置改变隔离。
- 锁文件固定依赖树，保证环境一致。

### 版本敏感专题补充

**Q：Vue 3.5 的响应式有什么新东西？`reactive` 的深层响应要注意什么？**

- Vue 3.5 包含响应式系统的性能/内存优化，但面试时应按项目锁定版本与官方 release 说明表达，不把内部实现简化成“重构 proxy 追踪”。
- 深层响应：`reactive` 默认深响应，但**替换整个对象丢失响应**（应改属性而非整体赋值）；大列表用 `shallowRef`/`shallowReactive` 减少追踪开销。

**Q：React 19 与 Vue 3 的核心差异，怎么选型？**

- React 19 主打 `use`（读 Promise/context）、Actions、`useOptimistic`、Ref 可传 props；范式仍是"函数 + 单向数据流 + 手动 memo"。
- Vue 3 靠编译器 + 响应式自动追踪，模板心智负担低；选型的本质是"团队偏好 + 生态"而非性能（二者生产性能都已足够）。

**Q：CSS 容器查询（container query）和 `subgrid` 实战怎么用？**

- 容器查询：父容器 `@container (min-width: 400px)` 改变子元素布局，组件级响应式不再依赖视口（见 `layout.md`）。
- `subgrid`：子网格继承父网格轨道，卡片列表对齐更稳，避免每层重复 grid 定义。

**Q：AI 辅助编程（Copilot / Cursor / Claude Code）对工程流程的改变？**

- 用例：脚手架生成、单测补全、文档/重构建议、Bug 定位。
- 风险：生成的代码可能含"看似正确实则错误"的逻辑、依赖过时 API、引入不安全写法——必须 review + 测试覆盖，不能盲信。

**Q：为什么要有 RSC（React Server Components）？和 SSR 区别？**

- SSR 是"服务端渲染 HTML 再水合"；RSC 让组件在服务端运行、只把结果（含数据）序列化给客户端，减少 JS 包体与客户端取数。
- 适合数据密集、SEO 内容；但增加了服务端/客户端组件边界的心智成本。

## 参考来源 / 延伸阅读

- MDN Web 文档（JS / CSS / HTTP 权威参考）：[developer.mozilla.org/zh-CN](https://developer.mozilla.org/zh-CN/)
- Vue 官方文档：[cn.vuejs.org](https://cn.vuejs.org/)
- React 官方文档：[react.dev](https://react.dev/)
- TypeScript 官方手册：[www.typescriptlang.org/docs](https://www.typescriptlang.org/docs/)
- web.dev（性能 / 最佳实践）：[web.dev](https://web.dev/)
- HTTP 协议规范与指南：[MDN HTTP](https://developer.mozilla.org/zh-CN/docs/Web/HTTP)
