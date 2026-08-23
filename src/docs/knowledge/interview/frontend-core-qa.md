---
group: 高频标准问答
order: 1
---

# 前端核心标准问答

本文覆盖牛客前端面经中重复出现的 JavaScript、TypeScript、Vue 3、浏览器、网络和工程化问题。每个“标准回答”都是首轮口述版；面试官继续追问时，再展开后面的机制和边界。

---

## 一、JavaScript 与异步

### Q1：JavaScript 有哪些数据类型？你会怎样准确判断类型？

**面试者标准回答：**

> “JavaScript 有七种基本类型：`undefined`、`null`、`boolean`、`number`、`bigint`、`string`、`symbol`，以及对象类型。函数本质上也是可调用对象。
>
> 判断时我不会只依赖 `typeof`。它适合区分基本类型和函数，但 `typeof null` 历史上会得到 `object`，数组和普通对象也都会得到 `object`。数组我用 `Array.isArray`；需要区分内置对象时可以用 `Object.prototype.toString.call`；判断原型关系可以用 `instanceof`，但它会受跨 realm 和自定义 `Symbol.hasInstance` 影响。业务里的接口数据不能靠 TypeScript 类型断言，我会用 Zod、JSON Schema 或手写守卫做运行时校验。”

**常见追问：**

- `typeof null === 'object'` 是语言早期类型标签设计遗留，不代表 `null` 是对象。
- `Object.create(null)` 没有 `Object.prototype`，判断“空对象”前先明确是“无自有键”还是“普通对象且无自有键”。
- `NaN` 是 `number`，推荐用 `Number.isNaN` 判断。

### Q2：什么是闭包？它一定会导致内存泄漏吗？

**面试者标准回答：**

> “闭包是函数和它定义时的词法环境的组合。内部函数即使在外部函数返回后，仍然可以访问被引用的外部变量。它常用于私有状态、工厂函数、缓存和事件回调。
>
> 闭包本身不会等于内存泄漏。只要闭包不可达，垃圾回收器仍能回收它。问题通常是一个长生命周期对象，比如全局事件监听器、定时器或缓存，持有了闭包；闭包又意外引用大对象或 DOM，导致整条引用链长期可达。排查时我会用 Chrome Memory 的 Heap Snapshot 对比快照，看 Retainers 路径，再检查监听器、定时器和缓存的清理。”

**示例：**

```js
function createCounter() {
  let count = 0
  return () => ++count
}

const next = createCounter()
next() // 1
next() // 2
```

**易错点：** 不要笼统地说“闭包变量一定存在堆里”。规范描述的是可观察语义，不规定引擎必须采用某种物理存储；引擎可做逃逸分析和优化。

### Q3：普通函数和箭头函数的 `this` 有什么区别？

**面试者标准回答：**

> “普通函数的 `this` 由调用方式决定，我按 `new`、显式绑定、隐式绑定、默认绑定来判断。箭头函数没有自己的 `this`、`arguments` 和 `new.target`，它从定义位置的外层词法环境捕获 `this`，也不能作为构造函数。
>
> 工程上，对象方法需要动态接收者时我用普通函数；回调想保留外层组件或类实例时，箭头函数更自然。`bind` 会返回一个绑定后的新函数，`call` 和 `apply` 立即调用，区别主要是参数逐个传还是数组式传入。”

**追问：`new` 做了什么？**

> “它创建新对象，把新对象的原型连接到构造函数的 `prototype`，以新对象作为 `this` 执行构造函数；如果构造函数显式返回对象，则返回该对象，否则返回新对象。实现时还要注意 `Reflect.construct` 比手写流程更接近语言语义。”

### Q4：请解释浏览器事件循环、宏任务和微任务。

**面试者标准回答：**

> “JavaScript 引擎一次只执行一个调用栈，计时器、网络和用户事件由宿主环境处理。一个任务执行完、调用栈清空后，事件循环会执行微任务检查点，把当前队列中的微任务一直清空；浏览器随后才有机会更新渲染，再进入下一个任务。
>
> Promise reaction 和 `queueMicrotask` 属于微任务；计时器、消息事件等通常进入任务队列。`async` 函数调用本身会同步执行到第一个 `await`，`await` 后续相当于 Promise reaction，因此进入微任务。要注意 HTML 规范使用 task，而‘宏任务’是社区常用称呼。”

```js
console.log('A')
setTimeout(() => console.log('B'))
Promise.resolve().then(() => {
  console.log('C')
  queueMicrotask(() => console.log('D'))
})
console.log('E')
// A E C D B
```

**常见追问：**

- 微任务执行时继续加入的微任务，也会在本次检查点继续执行，因此递归微任务可能“饿死”渲染和普通任务。
- `setTimeout(fn, 0)` 表示达到最小延迟后具备调度资格，不保证立即执行。
- Node.js 有自己的事件循环阶段和 `process.nextTick` 语义，不能机械套浏览器顺序。

### Q5：Promise 解决了什么问题？怎样组织多个异步请求？

**面试者标准回答：**

> “Promise 用一个只能从 pending 变为 fulfilled 或 rejected 的对象表示未来结果，把回调嵌套改为可组合的链，并统一错误传播。`.then` 每次返回新的 Promise；回调返回普通值时下一个 Promise fulfilled，返回 Promise 或 thenable 时会采用它的状态，抛异常则 rejected。
>
> 多个互不依赖的请求我会并发启动后用 `Promise.all` 汇总；需要拿到全部结果和错误用 `allSettled`；竞速或超时包装可用 `race`，但 `race` 不会自动取消输掉的请求，取消还要配 `AbortController`。有依赖的步骤才顺序 `await`，避免无意串行。”

```ts
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 3000)

try {
  const [user, permissions] = await Promise.all([
    fetch('/api/user', { signal: controller.signal }),
    fetch('/api/permissions', { signal: controller.signal }),
  ])
  // 使用两个结果
} finally {
  clearTimeout(timer)
}
```

**易错点：** `try/catch` 只能捕获当前执行链里被 `await` 或返回的 rejection；启动后既不 `await` 也不 `return` 的 Promise 不会被外层同步 `try/catch` 捕获。

### Q6：原型链和 `class extends` 的本质是什么？

**面试者标准回答：**

> “JavaScript 对象读取属性时，先查自身，没有就沿 `[[Prototype]]` 向上查，直到 `null`。函数的 `prototype` 是给未来实例作为原型用的普通对象，实例的内部 `[[Prototype]]` 指向它；`__proto__` 只是历史访问器，不建议用于业务代码。
>
> `class` 提供了更清晰的语法和一些额外语义，但实例方法复用仍建立在原型链上。继承时，实例原型链连接子类和父类的 `prototype`，构造函数本身也建立静态继承关系。实际业务里我优先组合而不是深继承，因为组合的依赖更显式，也更容易测试。”

### Q7：ES Module 和 CommonJS 有什么核心差异？

**面试者标准回答：**

> “ESM 是语言标准，依赖关系可静态分析，`import` 绑定是 live binding，浏览器原生支持，也更利于 Tree Shaking。CommonJS 主要来自 Node 生态，通过 `require` 和 `module.exports` 在运行时加载，导出值的常见表现更像取得当时对象或值的引用。
>
> ESM 模块默认严格模式，顶层 `this` 是 `undefined`；它的加载、链接和执行有明确阶段，并通过模块记录处理循环依赖。循环依赖两边如果在初始化完成前读取尚未初始化的绑定，仍可能报错，所以工程上应通过抽公共模块、依赖倒置或延迟访问来消除强循环。”

**易错点：** 不要回答“ESM 一定异步、CommonJS 一定同步”。这混淆了语法语义和具体宿主加载方式；Node 也支持动态 `import()`，构建工具还会转换模块。

### Q8：防抖和节流怎么选？

**面试者标准回答：**

> “防抖是在停止触发一段时间后只执行一次，适合搜索联想、表单校验；节流是在持续触发期间限制最高频率，适合滚动采样、拖拽和高频上报。真实实现我会明确 leading、trailing、取消和参数透传语义，而不是只写一个计时器版本。对于动画类更新，我通常优先按帧用 `requestAnimationFrame` 合并。”

```ts
function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined

  const wrapped = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }

  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  return wrapped
}
```

---

## 二、TypeScript

### Q9：`any`、`unknown` 和 `never` 有什么区别？

**面试者标准回答：**

> “`any` 基本关闭类型检查，而且容易沿调用链传播；`unknown` 可以接收任何值，但使用前必须通过类型守卫收窄，所以外部输入我优先用 `unknown`；`never` 表示不可能存在的值，常用于永不返回的函数和判别联合的穷尽检查。
>
> 我把 TypeScript 当作编译期约束，不把它当运行时验证器。HTTP 响应即使写成 `as User` 也不会被校验，可信边界仍要做 schema validation。”

```ts
type Result = { kind: 'success'; data: string } | { kind: 'failure'; error: Error }

function render(result: Result) {
  switch (result.kind) {
    case 'success':
      return result.data
    case 'failure':
      return result.error.message
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}
```

### Q10：`interface` 和 `type` 怎么选？泛型解决了什么问题？

**面试者标准回答：**

> “两者都能描述对象结构。`interface` 支持声明合并和继承，适合需要被扩展的公共对象 API；`type` 能表达联合、元组、条件类型和映射类型，组合能力更强。团队保持一致比绝对规则更重要。
>
> 泛型是在复用实现时保留输入与输出之间的类型关系。`any` 只是放弃信息，而泛型让调用处决定具体类型，再通过 `extends`、`keyof` 等约束非法组合。我会避免为了炫技写过深的条件类型，因为类型的可读性和编译性能也是成本。”

```ts
function get<T, K extends keyof T>(object: T, key: K): T[K] {
  return object[key]
}
```

### Q11：TypeScript 是结构类型系统，这对前端工程有什么影响？

**面试者标准回答：**

> “TypeScript 主要按对象具有的结构判断兼容性，不要求两个类型显式声明继承关系。这对前端组合接口很方便，但也意味着语义不同、结构相同的值可能被混用。像 `UserId` 和 `OrderId` 都是 string 时，我会在高风险域用 branded type 做名义化约束。
>
> 另外，额外属性检查主要发生在对象字面量直接赋值等位置，并不等于运行时会删掉额外字段。边界数据仍要验证和转换。”

---

## 三、Vue 3 核心

### Q12：Vue 3 响应式原理是什么？

**面试者标准回答：**

> “Vue 3 对对象使用 Proxy，对 `ref` 使用带 getter/setter 的包装对象。响应式副作用执行时，读取操作会把当前 effect 记录到目标对象、属性对应的依赖集合；写入时再找到这些 effect，并交给调度器执行。组件渲染本身就是一种 reactive effect，所以状态变化会调度组件更新。
>
> Vue 不只是‘Proxy 监听数据’。完整链路是代理拦截、依赖收集、触发、批量调度、重新执行渲染函数、比较新旧 VNode 并补丁真实 DOM。工程中我还会区分深层响应式和大数据场景；对大型不可变数据可用 `shallowRef`，通过替换根值触发更新，减少深层代理开销。”

**常见追问：Vue 2 和 Vue 3 的差异？**

> “Vue 2 主要用 `Object.defineProperty` 逐属性转换，并对数组变更方法做增强，因此新增、删除属性和索引写入需要特殊处理。Vue 3 的 Proxy 能拦截对象级操作，覆盖更完整，且按访问懒代理嵌套对象；代价是 Proxy 不能直接代理基本类型，也不能被旧浏览器完整 polyfill。”

### Q13：`ref` 和 `reactive` 怎么选？为什么解构会丢响应式？

**面试者标准回答：**

> “`ref` 可以包装任意值，通过 `.value` 保持一个稳定容器；`reactive` 只适合对象，返回 Proxy。团队里我通常优先 `ref`，因为变量替换更直接，解构和函数传递也更容易保持引用关系；一组天然聚合的表单字段也可以用 `reactive`。
>
> 对 `reactive` 对象直接解构，得到的是当前属性值，后续读取不再经过原 Proxy 的 getter，因此失去属性级依赖追踪。需要解构时用 `toRefs`，或直接通过对象访问。给 `reactive` 变量整体赋一个新普通对象，也会让原代理失去连接；重置表单可用 `Object.assign` 修改代理对象的属性。”

```ts
const form = reactive({ name: '', email: '' })
const initial = { name: '', email: '' }

function reset() {
  Object.assign(form, initial)
}
```

### Q14：`computed`、`watch` 和 `watchEffect` 怎么选？

**面试者标准回答：**

> “`computed` 用于从状态派生状态，返回值会缓存，依赖不变就不会重新计算，而且 getter 应保持无副作用。`watch` 用于明确监听某个来源，在新旧值变化后执行异步请求、持久化等副作用；它能控制 deep、immediate 和 flush。`watchEffect` 会立即执行，并自动收集同步执行期间读取的依赖，适合依赖较多的简单副作用，但依赖不够显式。
>
> 如果异步搜索会快速变化，我会在 watcher cleanup 中取消旧请求，避免旧响应覆盖新结果。需要读取更新后的 DOM 时用 `flush: 'post'` 或 `nextTick`，而不是碰运气。”

### Q15：Vue 的渲染和 Diff 怎么工作？`key` 的作用是什么？

**面试者标准回答：**

> “模板先被编译成渲染函数，执行后得到 VNode。状态变化时组件重新运行渲染函数，渲染器比较同层新旧 VNode，并把必要变化 patch 到 DOM。Vue 3 的优势是编译器能标记动态内容，通过 Patch Flag、Block Tree 和静态提升，让运行时更多地走优化路径，而不是盲目遍历整棵树。
>
> `key` 用来表达同一父节点下子节点的稳定身份，帮助 Diff 判断复用、移动、新建和删除。如果用数组下标作为 key，在头部插入、排序或过滤时，原 DOM 和组件局部状态可能被错误复用。业务列表应使用稳定且唯一的业务 ID。`key` 也可以故意改变来强制重建组件，但不应把它当常规刷新手段。”

**易错点：** 不要把 Vue 3 Diff 简化成“永远只比较动态节点”或“有 key 就一定更快”。编译优化只在编译器能分析模板时生效，key 主要保证身份与正确复用。

### Q16：`nextTick` 是什么？什么时候需要它？

**面试者标准回答：**

> “Vue 会把同一轮同步状态变更批量放进更新队列，避免每次赋值都立即重渲染。`nextTick` 返回一个 Promise，让代码在当前批次的 DOM 更新完成后执行。它不是定时器，也不是让数据更新；数据是同步改的，延后的是 DOM patch。
>
> 我只在确实依赖更新后 DOM 的地方使用，例如展开面板后测量高度、列表更新后滚动到底部。普通业务状态流不应该到处 `nextTick`，否则往往说明状态设计或组件边界有问题。”

### Q17：Vue 组件通信和状态管理怎样分层？

**面试者标准回答：**

> “父子组件我优先 props 向下、emit 向上，保持单向数据流；跨多层但作用域局部的依赖可以用 `provide/inject`，并由提供方封装修改方法；同一业务模块内可复用的状态逻辑用 composable；跨页面、需要持久化或 DevTools 追踪的全局状态再放 Pinia。
>
> 我不会把所有服务端数据都复制到全局 store。服务端状态要考虑缓存、过期、并发和重新验证，应该由请求层或专门的数据查询方案管理；Pinia 更适合客户端共享状态。组件库也要优先用 props、slots、events 暴露稳定契约，避免直接依赖业务 store。”

### Q18：`v-if`、`v-show` 和 `KeepAlive` 分别解决什么问题？

**面试者标准回答：**

> “`v-if` 为假时分支不会挂载，切换会创建和销毁；`v-show` 始终渲染，只切换 `display`。初始条件很少成立或切换少用 `v-if`，高频显示隐藏可用 `v-show`。
>
> `KeepAlive` 解决的是动态组件切换时保留组件实例和局部状态，不是简单隐藏。被缓存组件会进入 activated/deactivated 生命周期。使用时要控制 include、exclude 和 max，避免把大量页面长期缓存；订阅和计时器也要根据 deactivated 状态暂停，而不只依赖 unmount 清理。”

### Q19：Vue Router 的 hash 与 history 模式有什么区别？权限怎么做？

**面试者标准回答：**

> “hash 模式把路由放在 `#` 后，片段不会作为普通路径发给服务器，因此部署简单；history 模式用 History API，URL 更自然，但用户直接刷新深层路径时，服务器必须把未知前端路由回退到入口 HTML，同时静态资源和 API 路径不能误回退。
>
> 前端权限我分三层：登录态校验、路由可见性、具体操作权限。路由守卫能改善体验，但不是安全边界；后端必须对每个资源和操作重新鉴权。动态路由要在用户权限加载后生成，并处理刷新、退出登录时清理和 404 的顺序问题。”

---

## 四、浏览器、网络与安全

### Q20：从输入 URL 到页面可交互，大致发生了什么？

**面试者标准回答：**

> “我会分网络、解析渲染和交互三个阶段回答。网络阶段先解析 URL，经过缓存和 Service Worker 判断，再做 DNS、连接建立和 TLS，发送 HTTP 请求，可能经过 CDN、网关和服务端。
>
> 浏览器拿到 HTML 后流式解析 DOM，发现样式资源构建 CSSOM；DOM 和 CSSOM 参与生成渲染树，再布局、绘制、分层和合成。普通同步脚本会阻塞 HTML 解析，`defer` 下载不阻塞并在文档解析完成后按序执行，`async` 下载完成就执行、顺序不保证。最后还要等框架挂载、数据请求和事件绑定，页面才真正可交互。性能定位时我会用 Navigation Timing、Resource Timing、Performance 面板和 Web Vitals 找具体瓶颈，而不是只列优化名词。”

### Q21：强缓存和协商缓存有什么区别？

**面试者标准回答：**

> “强缓存由 `Cache-Control: max-age` 等响应头决定，新鲜期内浏览器直接使用本地副本，不发验证请求。过期后可带 `If-None-Match` 或 `If-Modified-Since` 做协商缓存；资源没变化时服务端返回 304，不带完整响应体。
>
> 工程上，带内容哈希的静态资源适合 `max-age` 加 `immutable` 长缓存，因为内容变化会换 URL；入口 HTML 要更谨慎，通常短缓存或每次协商，保证能拿到新的资源清单。`no-cache` 是允许存储但使用前必须验证，`no-store` 才是不存储。CDN 缓存和浏览器缓存是不同层，还要关注 `Vary`、私有数据和失效策略。”

### Q22：什么是同源策略和 CORS？简单请求为什么也可能有风险？

**面试者标准回答：**

> “同源要求协议、主机和端口一致，它主要限制脚本读取跨源响应等能力，不是阻止浏览器发出所有跨源请求。CORS 是服务端通过响应头显式授权哪些源、方法和请求头可以被浏览器脚本读取。某些非简单请求会先发 OPTIONS 预检，但简单请求可能直接发出，所以不能把 CORS 当 CSRF 防护。
>
> 带凭据的跨域请求不能把 `Access-Control-Allow-Origin` 写成 `*`，应该校验并回显允许的 origin，同时设置 `Vary: Origin`。真正的接口安全仍依赖身份认证、授权、CSRF 策略和输入校验。”

### Q23：XSS 和 CSRF 分别怎么防？

**面试者标准回答：**

> “XSS 是不可信内容被当成可执行代码进入页面，核心防线是按输出上下文编码、避免危险 DOM API、富文本白名单清洗和 CSP；Cookie 的 HttpOnly 能降低会话被脚本读取的风险，但不能消除 XSS。
>
> CSRF 是攻击者借浏览器自动携带的身份凭据发起非预期请求。防护可组合 SameSite Cookie、CSRF Token、Origin/Referer 校验，并要求敏感操作重新确认。二者区别是：XSS 让恶意代码进入受信页面，CSRF 借用了用户现有身份。若站点已有 XSS，很多 CSRF 防线也可能被绕过，所以要纵深防御。”

### Q24：SSE、WebSocket 和普通 HTTP 流式响应怎么选？

**面试者标准回答：**

> “LLM 文本输出主要是服务端到客户端的单向事件流，我通常优先 SSE：基于 HTTP，事件格式和断线重连语义简单，经过现有网关也更容易。若只需要一次请求的增量 body，也可以直接消费 fetch 的 `ReadableStream`。
>
> WebSocket 更适合持续双向低延迟通信、客户端频繁发事件或二进制数据，例如多人协作和实时控制。无论哪种方式，我都会处理取消、断线、心跳、代理缓冲、重复片段、顺序号、结束事件和错误事件。Markdown 流式渲染还要避免每个 token 全量解析，可按帧或按块批量更新。”

---

## 五、性能与工程化

### Q25：怎样系统做前端性能优化？

**面试者标准回答：**

> “我先建立基线，再按加载、渲染和交互三段定位。加载阶段看 TTFB、资源瀑布、LCP 元素和包体，手段包括缓存、CDN、压缩、图片尺寸与格式、路由拆包、预加载和合适的 SSR/SSG。渲染阶段关注大列表、无效响应式、布局抖动和主线程长任务，可用虚拟列表、稳定 props、浅层响应式、分帧或 Worker。交互阶段看 INP，定位事件处理、同步计算和频繁布局读写。
>
> 优化必须形成‘指标基线—瓶颈证据—单项改动—回归对比’，并同时观察错误率和业务指标，防止性能数字变好但功能退化。我会区分实验室 Lighthouse 和真实用户 RUM 数据，也不会把所有问题归因到框架。”

**追问：Core Web Vitals 是什么？**

> “当前核心指标是 LCP、INP 和 CLS，分别关注主要内容加载、交互响应和视觉稳定性。面试中我会说明指标口径可能更新，具体阈值以 web.dev 最新文档为准，不靠记忆编数字。”

### Q26：Vite 为什么开发启动和热更新通常更快？与 Webpack 怎么选？

**面试者标准回答：**

> “传统 bundler 的开发模式通常先构建模块图和 bundle；Vite 开发时以浏览器原生 ESM 为基础，按请求转换源模块，依赖则预构建并强缓存，所以项目变大时不用每次先重打完整应用包，HMR 也能沿模块边界精确更新。生产环境仍会做完整优化构建。
>
> 我不会简单说 Vite 永远更快。Webpack 生态成熟、历史兼容和高度定制能力强，大型存量项目迁移要计算 loader/plugin 替代、CommonJS、SSR 和测试链路成本。新建 Vue 3 项目通常优先 Vite；复杂存量 Webpack 项目要基于构建数据和迁移收益决定。”

**版本提醒：** 构建器实现会演进，回答时强调“开发期按需 ESM + 依赖预构建 + 精确 HMR”的稳定原理，不死背某个底层工具名称。

### Q27：Tree Shaking 和代码分割分别是什么？

**面试者标准回答：**

> “Tree Shaking 是构建时基于 ESM 静态结构分析未使用导出，再结合副作用信息和压缩器删除死代码；代码分割是把代码拆成多个 chunk，按入口、路由或动态 `import()` 延迟加载。前者减少不会用到的代码，后者改变加载时机，两者不是一回事。
>
> Tree Shaking 失效时我会检查 CommonJS、动态访问、包的 `sideEffects` 声明以及是否整包导入。分包也不是越碎越好，chunk 太多会增加调度和缓存碎片，公共包过大又会导致小改动牵连缓存；应结合构建分析和真实网络瀑布调整。”

### Q28：前端监控系统要采集什么？怎样定位一次线上白屏？

**面试者标准回答：**

> “我会把监控分为错误、性能、行为和发布上下文。错误包括 `window.onerror`、`unhandledrejection`、资源加载错误、框架错误边界和接口失败；性能采集 Web Vitals、导航和资源时序；所有事件关联版本、路由、设备、trace ID 和脱敏后的用户会话。
>
> 白屏排查先确认影响范围和版本相关性，再看入口资源是否加载、JS 是否初始化报错、接口或鉴权是否阻塞、路由是否命中。通过 source map 在受控后端还原堆栈，结合发布 diff、网络瀑布和用户轨迹复现。止损优先回滚或关闭特性开关，修复后补自动化用例和白屏探针。Source map 本身可能暴露源码，不应无保护地公开部署。”

---

## 六、前端答题易错清单

| 容易失分的说法                | 更准确的回答                                                          |
| ----------------------------- | --------------------------------------------------------------------- |
| “闭包都会内存泄漏”            | 闭包被长生命周期引用且保留无用对象时才形成问题                        |
| “Promise 是多线程”            | Promise 组织异步结果；任务可能由宿主并发处理，JS 回调仍由事件循环调度 |
| “Vue 3 用 Proxy 实现双向绑定” | Proxy 是响应式基础；`v-model` 是属性与事件约定，两者不是同一层        |
| “虚拟 DOM 一定比原生 DOM 快”  | 虚拟 DOM 提供声明式和跨平台抽象，并通过批量与编译优化减少不必要更新   |
| “有 key 就更快”               | key 首先表达稳定身份，保证列表复用和状态正确                          |
| “CORS 能防 CSRF”              | CORS 主要控制脚本读取跨源响应，简单跨源请求仍可能被发出               |
| “`no-cache` 是不缓存”         | `no-cache` 是使用前验证；`no-store` 才是不存储                        |
| “`async/await` 会让请求串行”  | 是否串行取决于 Promise 在何时启动以及何时等待                         |
| “TypeScript 保证接口数据类型” | TypeScript 类型运行时被擦除，外部数据必须验证                         |
| “优化后快了很多”              | 给出基线、环境、样本、改动、结果与回归指标                            |

---

## 参考来源

- [牛客：27 届前端高频面试题汇总](https://www.nowcoder.com/discuss/889546972099584000)
- [牛客：深圳前端 Vue 面经](https://www.nowcoder.com/discuss/721478323984969728)
- [MDN：JavaScript execution model](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model)
- [MDN：Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vue 官方：Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)
- [Vue 官方：Rendering Mechanism](https://vuejs.org/guide/extras/rendering-mechanism.html)
- [Vue 官方：Performance](https://vuejs.org/guide/best-practices/performance.html)
- [Vue Router：History Modes](https://router.vuejs.org/guide/essentials/history-mode.html)
- [Vite：Dependency Pre-Bundling](https://vite.dev/guide/dep-pre-bundling.html)
- [web.dev：Web Vitals](https://web.dev/articles/vitals)
- [MDN：HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
- [OWASP：Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
