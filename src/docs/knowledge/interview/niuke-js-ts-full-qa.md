---
group: 牛客全量答案
order: 1
---

# 牛客全量标准答案 · 一、JavaScript / TypeScript 基础

> 本文逐条对应《牛客面试题库》，编号由源题顺序生成。每题均需保留 `niuke-id` 标记，供覆盖校验器检查。

---

## 数据类型与基础概念

### NQ-001

<!-- niuke-id:NQ-001 source-line:12 -->

**问题：** JS 有哪些基本数据类型？基本类型与引用类型的区别、存储方式？开发中引用类型和基本类型各有什么需要注意的？

**面试者标准回答：**

> “JavaScript 的基本类型有 `undefined`、`null`、`boolean`、`number`、`bigint`、`string`、`symbol`，其余属于对象，函数是可调用对象。基本类型按值表现、不可变；对象变量保存对象引用，赋值和传参会复制引用。‘栈放基本类型、堆放对象’只是常见实现模型，不是规范保证。开发中我会注意对象浅拷贝、共享修改和相等比较，跨边界数据还要做运行时校验。”

### NQ-002

<!-- niuke-id:NQ-002 source-line:13 -->

**问题：** null 与 undefined 的区别？

**面试者标准回答：**

> “`undefined` 通常表示尚未赋值、缺少参数或属性不存在；`null` 是开发者显式表达‘没有对象值’。`typeof undefined` 是 `undefined`，而 `typeof null` 因历史兼容返回 `object`。我会在接口契约里统一空值语义，避免同时滥用两者；使用 `value == null` 可以同时判断 null 和 undefined，但其他场景优先严格相等。”

### NQ-003

<!-- niuke-id:NQ-003 source-line:14 -->

**问题：** 如何准确判断一个变量的数据类型？typeof / instanceof / Object.prototype.toString.call 的原理与区别？如何判断一个值是不是数组、是不是空对象？

**面试者标准回答：**

> “我按目标选择工具：`typeof` 适合基本类型和函数，但 null、数组、普通对象都不够精确；`instanceof` 沿原型链判断，受跨 realm 和 `Symbol.hasInstance` 影响；`Object.prototype.toString.call` 可区分常见内置类型。数组用 `Array.isArray`。判断空普通对象，我会先确认原型符合预期，再用 `Reflect.ownKeys(obj).length === 0`，因为只用 `Object.keys` 会忽略 Symbol 和不可枚举自有属性。”

### NQ-004

<!-- niuke-id:NQ-004 source-line:15 -->

**问题：** let / const / var 的区别？变量提升（函数提升与变量提升的不同）？暂时性死区（TDZ）？为什么需要块级作用域？

**面试者标准回答：**

> “`var` 是函数作用域，可重复声明，声明提升并初始化为 undefined；`let/const` 是块级作用域，声明也会被创建，但在初始化前处于 TDZ，访问会报错。`const` 限制绑定不能重新赋值，不代表对象内部不可变。函数声明通常整体提升，函数表达式按变量规则处理。块级作用域能限制变量生命周期，解决循环闭包和临时变量泄漏问题。”

### NQ-005

<!-- niuke-id:NQ-005 source-line:16 -->

**问题：** 为什么 var 声明的变量可以重复声明（不报错），var 声明的变量一定是全局的吗（函数作用域内的 var 与全局 var 的区别、变量提升如何造成重复声明不报错）？

**面试者标准回答：**

> “同一作用域的多个 `var` 声明会绑定到同一个环境记录，重复声明不会创建新绑定，因此不报错；提升后相当于只声明一次。`var` 不一定是全局变量，在函数内它属于函数作用域；顶层脚本中的 `var` 可能成为全局对象属性，但 ES Module 顶层不会。赋值没有声明才可能意外创建全局属性，严格模式会直接报错。”

### NQ-006

<!-- niuke-id:NQ-006 source-line:17 -->

**问题：** == 与 === 的区别？

**面试者标准回答：**

> “`===` 不做类型转换，类型不同直接 false；`==` 会按抽象相等算法转换，例如字符串与数字、布尔值和 nullish 有特殊规则，容易产生难读边界。业务代码我默认使用严格相等，只有 `value == null` 这种有意同时匹配 null/undefined 的场景才使用宽松相等，并通过注释或规范说明。`Object.is` 还能区分 `+0/-0`，并认为 `NaN` 等于自身。”

### NQ-007

<!-- niuke-id:NQ-007 source-line:18 -->

**问题：** Symbol 是什么？一般使用场景？

**面试者标准回答：**

> “Symbol 是唯一的基本类型值，即使描述相同也不相等。它适合给对象增加不易冲突的属性键、定义协议钩子如 `Symbol.iterator`，或用 `Symbol.for` 在全局注册表共享标识。Symbol 属性不会被 `Object.keys` 和 JSON 序列化枚举，但并不等于私有或安全；真正的私有字段应使用 `#field` 或闭包。”

### NQ-008

<!-- niuke-id:NQ-008 source-line:19 -->

**问题：** 0.1 + 0.2 !== 0.3 的原因？精度丢失怎么解决（BigInt / 转字符串 / 第三方库）？

**面试者标准回答：**

> “JavaScript Number 使用 IEEE 754 双精度浮点，0.1 和 0.2 的二进制表示是无限小数，舍入后相加不等于精确的 0.3。一般比较用容差；金额我会使用最小货币单位整数或 decimal 库。BigInt 只适合整数，不能直接和 Number 混算；转字符串本身不会自动解决运算精度，必须配合十进制算法。”

### NQ-009

<!-- niuke-id:NQ-009 source-line:20 -->

**问题：** 可变数据与不可变数据有什么区别？React 中为什么要用 set 方法改数据？引用类型传参要注意什么？

**面试者标准回答：**

> “不可变更新是创建新值而不是原地修改旧对象，便于通过引用相等判断变化、时间旅行和并发渲染。React 的 state setter既通知调度器，也让框架拿到新引用；直接改旧 state 可能无法触发预期渲染并破坏快照语义。对象传参复制的是引用值，被调函数修改对象内部会影响调用方，所以我会明确所有权，必要时浅拷贝、深拷贝或冻结。”

### NQ-010

<!-- niuke-id:NQ-010 source-line:21 -->

**问题：** 数组的 map() 和 forEach() 有什么区别？forEach() 能改变数组吗（区分基本类型值 / 引用类型整体 / 引用类型内部属性三种情况）？

**面试者标准回答：**

> “`map` 为每个元素执行回调并返回等长新数组，适合纯转换；`forEach` 返回 undefined，适合副作用且不能用普通方式 break。forEach 给参数重新赋基本值或新对象不会替换原数组元素；通过索引写入会修改数组；若元素本身是对象，修改其内部属性会影响原对象。两者都不会等待 async 回调，需要异步并发时用 map 生成 Promise 再 `Promise.all`。”

### NQ-011

<!-- niuke-id:NQ-011 source-line:22 -->

**问题：** 数组的 slice 与 splice 有什么区别？

**面试者标准回答：**

> “`slice(start,end)` 不修改原数组，返回左闭右开的浅拷贝，也可用于字符串；`splice(start,deleteCount,...items)` 原地删除、插入或替换，并返回被删除元素。状态管理中我偏向 slice、toSpliced 等不可变 API；使用 splice 时要清楚它会改变索引和原数组，不能把它与 slice 的参数语义混淆。”

### NQ-012

<!-- niuke-id:NQ-012 source-line:23 -->

**问题：** 函数式编程思想？React 中为什么强调不可变数据？

**面试者标准回答：**

> “函数式编程强调纯函数、不可变数据、函数组合和把函数当一等值，以减少隐式状态。React 强调不可变更新，是因为渲染把 state 当某一时刻的快照，并大量使用引用相等做更新判断。它不是要求所有代码都纯函数；网络、日志等副作用应放到 effect 或事件边界，并保证清理和可测试性。”

### NQ-013

<!-- niuke-id:NQ-013 source-line:24 -->

**问题：** JS 的面向对象与 Java 的面向对象有什么不同？为什么 JS 采用基于原型的 OOP？面向对象编程相关？

**面试者标准回答：**

> “Java 是以类为核心的静态类型 OOP，JavaScript 是动态、基于原型的对象委托，`class` 主要是原型机制的语法封装。对象可直接以另一个对象为原型，不必先定义类，这给动态组合带来灵活性。工程上我不会争论哪种更纯粹，而会用封装控制不变量，优先组合和小接口，只有稳定的 is-a 关系才用继承。”

### NQ-014

<!-- niuke-id:NQ-014 source-line:25 -->

**问题：** 手写单例模式（含双检查锁）？手写函数柯里化 / 实现 add(1)(2) 累加？

**面试者标准回答：**

> “JavaScript 单线程场景的单例可用模块顶层实例或闭包缓存；双检查锁主要是多线程语言优化同步开销，JS 主线程照搬没有意义，Worker 间还需共享内存和原子机制。柯里化把多参数函数转换为逐个接收参数的函数；`add(1)(2)` 可让第一次调用返回闭包保存累计值。面试手写时我会先确认终止协议，是固定参数个数、空调用还是 `valueOf/toString` 隐式取值。”

---

## 闭包 / 原型 / this

### NQ-015

<!-- niuke-id:NQ-015 source-line:29 -->

**问题：** 什么是闭包？闭包的作用和缺点是什么？应用场景？闭包导致的内存泄漏怎么定位？

**面试者标准回答：**

> “闭包是函数与定义时词法环境的组合，外层返回后仍可访问被引用变量。它用于私有状态、工厂函数、缓存和回调。缺点不是‘一定泄漏’，而是长生命周期监听器、定时器或缓存持有闭包，闭包又保留大对象。排查时我会比较 Heap Snapshot，看 Retainers 引用链，并在卸载时清理监听、定时器和无界缓存。”

### NQ-016

<!-- niuke-id:NQ-016 source-line:30 -->

**问题：** 闭包里被引用的外部变量，内存存放在栈上还是堆上？如果语言没有闭包机制，如何手动模拟闭包（让返回的函数仍能访问原局部变量）？

**面试者标准回答：**

> “规范只定义闭包可观察语义，不保证变量物理上一定在堆或栈；实现通常会把逃逸环境放在可长期存活区域，也可能经优化消除。没有语言级闭包时，可以显式创建一个环境对象，把原局部变量作为字段，让返回的函数对象或回调结构保存该环境指针；这本质上是手工完成编译器的环境捕获。”

### NQ-017

<!-- niuke-id:NQ-017 source-line:31 -->

**问题：** 讲讲原型链？prototype 与 **proto** 的区别？从对象取属性的过程、原型链顶端是什么、如何判定属性在自身还是原型链上？

**面试者标准回答：**

> “对象读属性先查自身，没有就沿内部 `[[Prototype]]` 逐层查到 null。构造函数的 `prototype` 是给实例连接的普通对象，`__proto__` 是访问 `[[Prototype]]` 的历史访问器，业务代码优先 `Object.getPrototypeOf`。普通链顶通常是 `Object.prototype`，再往上是 null。自有属性用 `Object.hasOwn` 判断，`in` 会包含原型链属性。”

### NQ-018

<!-- niuke-id:NQ-018 source-line:32 -->

**问题：** 如何实现继承（class extends / Object.create / 组合寄生式）？构造函数和普通函数的区别？new 调用时发生了什么、函数如何知道自己被 new 调用？class 如何实现多继承（手撕）？

**面试者标准回答：**

> “现代代码用 `class extends`，底层仍建立实例与构造函数两条原型关系；ES5 可用 `Object.create(Parent.prototype)` 加父构造调用实现寄生组合继承。`new` 创建对象、连接原型、以它作为 this 调用构造器，并按返回值规则返回；函数可用 `new.target` 判断是否被 new。JS 没有类的多继承，我会用 mixin 或组合复制能力，并处理命名冲突和初始化顺序。”

### NQ-019

<!-- niuke-id:NQ-019 source-line:33 -->

**问题：** 如何确定函数中 this 的指向？call / apply / bind 的区别与手写实现？箭头函数的 this 有什么特殊之处、为什么没有 arguments？严格模式下 this 的输出有什么变化？

**面试者标准回答：**

> “普通函数 this 由调用点决定，常见优先级是 new、显式 call/apply/bind、对象方法、默认绑定。call 逐个传参、apply 接数组式参数且立即调用，bind 返回绑定函数。箭头函数没有自己的 this、arguments、prototype 和 new.target，从词法外层捕获，因此 call 不能改它。严格模式下普通独立调用的 this 是 undefined，非严格脚本可能替换为全局对象。”

### NQ-020

<!-- niuke-id:NQ-020 source-line:34 -->

**问题：** this 指向问题（给出代码判断输出）？读代码题：var / this / 事件循环 / for 循环的 i 值？

**面试者标准回答：**

> “读代码题我按固定顺序分析：先标出作用域和 var 提升，再看每个函数的实际调用形式决定 this，然后分同步、微任务、任务队列，最后看循环变量是共享的 var 还是每轮新绑定的 let。`for(var i...)` 的异步回调通常读到循环结束值；可用 let、IIFE 或显式传参创建每轮环境。任何输出都应逐行给出入队时机，不凭印象背答案。”

### NQ-021

<!-- niuke-id:NQ-021 source-line:35 -->

**问题：** 如何自己设计一个"类似 Babel 的语法机制"（语法解析、执行机制、底层实现）？

**面试者标准回答：**

> “我会把类似 Babel 的机制拆成 tokenize、parse、transform、generate 四步：词法分析把字符变 token，语法分析构造 AST，遍历器按插件规则变换节点，生成器输出目标代码和 source map。若要执行，可解释 AST 或生成 JS 后交给引擎。生产实现还要处理作用域、错误位置、注释、语义保持和插件顺序，不能只用正则替换语法。”

---

## 异步与事件循环

### NQ-022

<!-- niuke-id:NQ-022 source-line:39 -->

**问题：** 讲讲 JavaScript 的事件循环机制？宏任务和微任务的区别？各自有哪些（async/await 是否全部是微任务、messageChannel 是宏还是微）？给出一段代码问输出顺序？

**面试者标准回答：**

> “一次任务执行到调用栈清空后，浏览器执行微任务检查点，再有机会渲染并进入下一任务。Promise reaction、`queueMicrotask` 是微任务；计时器、MessageChannel 消息和事件回调是 task。async 函数会同步执行到 await，await 后续才是微任务，并非整个 async 都是微任务。输出题我按实际入队顺序推演，还要注意微任务中新增微任务会在本轮继续清空。”

### NQ-023

<!-- niuke-id:NQ-023 source-line:40 -->

**问题：** 事件循环在没有任务时是否会持续占用 CPU（浏览器空闲调度机制）？浏览器事件从物理硬件 → 操作系统 → 浏览器进程 → JS 事件回调执行的完整链路？

**面试者标准回答：**

> “没有任务时事件循环不会忙等占满 CPU，浏览器线程通常通过操作系统事件等待机制休眠，由定时器、I/O 或消息唤醒。物理输入先被设备和操作系统转换为事件，浏览器进程接收后做命中测试、合成/主线程路由，再把 DOM 事件任务放入对应事件循环；JS 回调只有在当前任务和微任务完成后执行，所以主线程长任务会造成输入延迟。”

### NQ-024

<!-- niuke-id:NQ-024 source-line:41 -->

**问题：** 浏览器事件循环中的"帧"概念、生命周期与阶段？requestAnimationFrame 的执行时机？requestIdleCallback 有听过吗？

**面试者标准回答：**

> “显示器刷新形成帧预算，但事件循环任务与帧不是一一对应。浏览器通常在任务和微任务之间选择更新渲染，执行 rAF 回调、样式布局、绘制和合成；`requestAnimationFrame` 适合下一次绘制前更新动画。`requestIdleCallback` 只在剩余空闲预算内执行低优先工作且兼容性有限，必须看 deadline 并设置 timeout，不能承载关键任务。”

### NQ-025

<!-- niuke-id:NQ-025 source-line:42 -->

**问题：** JS 是单线程的，如果要处理比较重的后台任务或网络请求，它是怎么处理的？JS 引擎事件循环与 Node.js 事件循环的区别？Node.js 是单线程还是多线程？

**面试者标准回答：**

> “JS 代码在一个 agent 线程顺序执行，但网络、文件和计时器由宿主系统及线程池处理，完成后把回调排回事件循环；CPU 重任务可交给 Web Worker/Worker Threads。Node 的事件循环由 libuv 分阶段处理 timers、poll、check 等，并有 `process.nextTick`；Node 不是整体单线程，JS 默认一条主线程，但 I/O、线程池和 Worker 都可并发。”

### NQ-026

<!-- niuke-id:NQ-026 source-line:43 -->

**问题：** setTimeout 一定在给定时间之后执行吗？浏览器计时器适合用什么数据结构（最小堆）？

**面试者标准回答：**

> “`setTimeout(fn, d)` 只保证达到最小延迟后可被调度，实际还受当前长任务、微任务、嵌套计时器最小间隔、后台标签节流影响，不保证精确时刻。大量计时器可按到期时间放最小堆，快速取得最近到期项；也可用时间轮优化特定规模。回调执行仍要等待主线程可用。”

### NQ-027

<!-- niuke-id:NQ-027 source-line:44 -->

**问题：** Promise 解决了什么问题？Promise 状态含义与流转？Promise 链式调用原理、then 在不同情况的返回值？Promise.then 第二个参数的作用？Promise.then().catch() 写法的收益？

**面试者标准回答：**

> “Promise 用 pending、fulfilled、rejected 表示未来结果，settled 后不可再变，解决回调难组合和错误传播问题。`.then` 总返回新 Promise：回调返回值使其 fulfilled，返回 thenable 会采用其状态，抛错则 rejected。第二参数只处理前一个 Promise 的 rejection，通常末尾 catch 能同时捕获前面回调抛错，链更清晰；但需要局部恢复时第二参数也有用途。”

### NQ-028

<!-- niuke-id:NQ-028 source-line:45 -->

**问题：** Promise 常用的静态方法（all / race / allSettled / any）区别与使用场景？Promise 相关手写题（手写 Promise 核心逻辑 / Promise.resolve）？

**面试者标准回答：**

> “`all` 全成功才成功并按输入排序，任一拒绝就短路；`allSettled` 等全部完成；`race` 取第一个 settle；`any` 取第一个 fulfilled，全部失败给 AggregateError。它们不会自动取消其他任务。手写 Promise 的核心是状态锁定、回调队列、微任务调度和 thenable 解析过程；`Promise.resolve` 对同构 Promise 可原样返回，否则采用 thenable。”

### NQ-029

<!-- niuke-id:NQ-029 source-line:46 -->

**问题：** async / await 执行顺序？await 怎么捕获异常、try catch 能否捕获 promise 异常？async/await 与 Promise 的关系与取舍？写代码时怎么判断该用哪个？三个互不依赖的请求用 async/await 与 Promise 的区别？

**面试者标准回答：**

> “async 函数调用同步执行到第一个 await，await 把后续放到 Promise reaction 微任务；async 总返回 Promise。try/catch 能捕获被 await 的 rejection，不能捕获启动后既不 await 也不 return 的悬空 Promise。流程表达我用 await，可组合并发用 Promise API；三个独立请求先同时创建 Promise，再 `await Promise.all`，若逐个 await 就被无意串行。”

### NQ-030

<!-- niuke-id:NQ-030 source-line:47 -->

**问题：** Generator 是什么？

**面试者标准回答：**

> “Generator 函数调用后返回迭代器，不立即跑完整函数；`next` 执行到下一个 `yield` 并返回 `{value, done}`，下次 next 的参数会成为上一个 yield 表达式的结果。它适合惰性序列、状态机和自定义迭代协议。早期异步控制可用 generator 加执行器，但现代业务通常用 async/await，可读性更高。”

### NQ-031

<!-- niuke-id:NQ-031 source-line:48 -->

**问题：** JavaScript 中有哪些异步方法（除了 Promise）？想并发请求接口有什么办法？

**面试者标准回答：**

> “异步来源包括回调事件、计时器、网络/I/O、事件监听、Generator 执行器、async/await、Web Worker 和流。并发请求可以先批量创建 fetch Promise 再 `Promise.all/allSettled`；数量大时用 worker pool 限并发，并配 AbortController、超时、重试和服务端限流。并发不是把所有请求一次性打满，限制要基于浏览器、网关和业务容量。”

### NQ-032

<!-- niuke-id:NQ-032 source-line:49 -->

**问题：** 给出代码判断 apply / bind 的输出（代码题）？Promise 输出顺序题 / 同步异步输出题（长代码）？

**面试者标准回答：**

> “apply/bind 题先确认原函数是否箭头函数、是否被 new、绑定后是否作为方法调用；bind 的 this 通常不能再被 call 改写，但 new 调用绑定函数时 new 绑定优先。异步输出题则逐行记录同步输出、微任务入队和 timer 入队，注意 then 返回的新 Promise 和 await 后续。我的答案会给出时间线，而不是只报最终序列。”

---

## 内存 / 作用域 / 模块

### NQ-033

<!-- niuke-id:NQ-033 source-line:53 -->

**问题：** 作用域链？词法作用域与动态作用域的区别？

**面试者标准回答：**

> “作用域链是当前词法环境通过 outer 引用连接到外层环境的查找链，标识符从当前向定义时外层解析。JavaScript 采用词法作用域，作用域取决于代码定义位置；动态作用域则取决于调用栈。this 是调用语义，不等同于作用域链。闭包正是函数保留定义时外层词法环境的结果。”

### NQ-034

<!-- niuke-id:NQ-034 source-line:54 -->

**问题：** 什么是执行上下文（Execution Context）？它包含哪些组成部分（变量对象 / 作用域链 / this 绑定），函数调用时执行上下文如何创建与销毁、与词法作用域的关系？

**面试者标准回答：**

> “执行上下文是执行全局代码、函数或 eval 时的运行状态，现代规范可理解为词法环境、变量环境、Realm、this/new.target 等。函数调用时创建上下文并压入调用栈，返回后弹出；但被闭包引用的环境仍可存活。词法作用域在函数定义时决定外层环境，执行上下文在调用时创建并保存实际参数、局部绑定和 this。”

### NQ-035

<!-- niuke-id:NQ-035 source-line:55 -->

**问题：** JS 垃圾回收机制（标记清除 / 引用计数）？引用计数的缺点与循环依赖问题？哪些情况会造成内存泄漏（全局变量、定时器、闭包、DOM 引用）？

**面试者标准回答：**

> “现代 GC 以可达性为核心，从根对象标记可达对象，再回收不可达对象；单纯引用计数无法处理循环引用。常见泄漏是意外全局、未清理监听和定时器、无界缓存、闭包保留大对象、已移除 DOM 仍被 JS 引用。定位用 Heap Snapshot、Allocation Timeline 和 Retainers 链，修复是切断无用强引用而不是手动调用 GC。”

### NQ-036

<!-- niuke-id:NQ-036 source-line:56 -->

**问题：** JS 的内存管理（新生代 / 老年代）？V8 的 GC 回收？Node.js 的 V8 GC（新生代 / 老生代）？

**面试者标准回答：**

> “V8 利用分代假设：新对象多在新生代，通过 minor GC 快速复制/整理，存活多轮后晋升老生代；老生代用增量、并发标记和压缩等 major GC 策略。Node 同样使用 V8 堆，但还有 Buffer 等堆外内存。排查应同时看 heapUsed、external、GC pause 和分配速率，不能只调大 `--max-old-space-size` 掩盖泄漏。”

### NQ-037

<!-- niuke-id:NQ-037 source-line:57 -->

**问题：** 模块化方案（ESM / CommonJS 等）及区别？ES Module 与 CommonJS 的核心差异、为什么 Vite 默认用 ESM？模块循环引用问题与解决？

**面试者标准回答：**

> “ESM 是语言标准，import/export 可静态分析、导入是 live binding；CommonJS 用 require/module.exports 运行时加载。Vite 开发期基于原生 ESM 按需提供模块，并预构建依赖，利于 HMR 和 Tree Shaking。循环依赖 ESM 能建立绑定但可能遇到 TDZ，CommonJS 可能得到未完成导出；解决应抽公共模块、依赖倒置或延迟访问，避免强环。”

### NQ-038

<!-- niuke-id:NQ-038 source-line:58 -->

**问题：** 全局异常捕获的方法？image 标签加载异常（后端 url 不准）如何捕获？

**面试者标准回答：**

> “运行时脚本错误可用 `window.onerror` 或 error 事件，未处理 Promise 用 `unhandledrejection`，框架还应接自己的 error handler。资源加载错误不冒泡，需在捕获阶段监听，或给 image 单独设置 `onerror`；图片失败可替换占位图并防止替换图再次递归报错。生产监控要关联版本、路由和 source map，并脱敏采样。”

### NQ-039

<!-- niuke-id:NQ-039 source-line:59 -->

**问题：** 如何用浏览器原生方法实现订阅发布机制？如何拿到用户在某个页面的停留时间？如何监听哈希模式路由 # 之后部分的变化？

**面试者标准回答：**

> “原生发布订阅可用 `EventTarget` + `CustomEvent`，或维护 Map<event, Set<listener>> 并返回 unsubscribe。停留时间我会在进入时记录 `performance.now`，在路由离开、visibilitychange/pagehide 时累计可见时长，最终用 `sendBeacon` 上报；beforeunload 不可靠。hash 路由监听 `hashchange`，读取 `location.hash`，初始化还要处理首次路由。”

---

## 计算机基础（JS 视角延伸）

### NQ-040

<!-- niuke-id:NQ-040 source-line:63 -->

**问题：** 数组和链表的区别？JS 数组底层是数组还是链表？

**面试者标准回答：**

> “数组内存连续、按索引 O(1)，中间插删需搬移；链表节点分散、顺序访问 O(n)，已知节点插删 O(1) 但缓存局部性差。JS Array 是引擎优化的动态对象，不等同链表：元素通常用连续/稠密 elements backing store，出现空洞或混合类型时可能转为稀疏字典模式。具体布局是实现细节，算法选择仍按可观察复杂度。”

### NQ-041

<!-- niuke-id:NQ-041 source-line:64 -->

**问题：** 进程和线程的定义及区别？是否了解协程？多线程竞争状态的产生原因与解决（互斥锁）？

**面试者标准回答：**

> “进程是资源和地址空间的隔离单位，线程是进程内调度执行单位并共享内存；协程是在用户态可暂停恢复的轻量任务。竞争状态来自多个执行单元在无同步下读写共享状态，结果依赖时序。可用互斥锁、信号量、原子操作、消息传递或避免共享可变状态解决，同时注意死锁和锁粒度。”

### NQ-042

<!-- niuke-id:NQ-042 source-line:65 -->

**问题：** 已经有进程了，为什么还需要线程？进程创建和上下文切换为什么比线程更重（资源开销、地址空间复制）？

**面试者标准回答：**

> “线程让同一进程内多个执行流共享代码、堆和文件资源，通信成本低，也能利用多核；若只有进程，并发创建和 IPC 成本更高。进程切换通常要切换地址空间和更多内核资源，缓存/TLB 影响也更大；线程切换共享地址空间，状态更少。但具体成本由操作系统实现决定，线程共享也带来同步和故障隔离风险。”

### NQ-043

<!-- niuke-id:NQ-043 source-line:66 -->

**问题：** 并发（concurrency）和并行（parallelism）有什么区别？多个任务看起来同时运行时，CPU 是否真的在并行执行（单核时间片轮转 vs 多核真正同时）？

**面试者标准回答：**

> “并发是多个任务在同一时间段交错推进，解决组织与响应问题；并行是同一时刻在多个执行单元真正运行。单核通过时间片切换能并发但不并行，多核或 GPU 才能物理并行。异步 I/O 提升并发不代表 CPU 计算并行；JS CPU 重任务要用 Worker 或多进程利用多核。”

### NQ-044

<!-- niuke-id:NQ-044 source-line:67 -->

**问题：** 举一个适合用进程隔离的场景，再举一个适合用多线程的场景（进程间隔离安全性 vs 线程间共享内存通信成本）？

**面试者标准回答：**

> “不可信插件、浏览器标签页或需要故障隔离的服务适合进程，因为崩溃和地址空间不会直接污染宿主。图像处理、数值计算等需要频繁共享大块内存的任务适合线程，避免昂贵 IPC 拷贝。选择时在隔离性、通信成本、启动开销和共享状态复杂度间权衡，不是所有 CPU 任务都盲目开线程。”

### NQ-045

<!-- niuke-id:NQ-045 source-line:68 -->

**问题：** CPU 和 GPU 的区别，各自擅长什么任务？

**面试者标准回答：**

> “CPU 核心少但控制逻辑强、低延迟、擅长分支和通用串行任务；GPU 有大量较简单计算单元和高带宽，适合对大量数据执行相同运算，如图形、矩阵和模型训练。GPU 不会让所有代码变快，数据搬运、分支发散和小任务启动开销可能抵消收益。前端 WebGL/WebGPU 适合并行图形与计算。”

### NQ-046

<!-- niuke-id:NQ-046 source-line:69 -->

**问题：** Node.js 的 JS 引擎是什么（V8）？Node.js 相较其他后端的优势？

**面试者标准回答：**

> “Node.js 默认使用 V8 执行 JavaScript，并由 libuv 提供事件循环和异步 I/O。优势是 I/O 密集场景可用少量线程处理大量连接、前后端共享 JS/TS 生态、JSON 和流处理自然、开发效率高。它不是所有后端都更快：CPU 密集任务会阻塞事件循环，需要 Worker/进程或专门服务，类型安全和多线程模型也有不同权衡。”

### NQ-047

<!-- niuke-id:NQ-047 source-line:70 -->

**问题：** JS 与 C/C++ 的区别？指针与引用的区别？从写代码到程序运行经过哪些环节？静态链接是什么？

**面试者标准回答：**

> “JS 动态类型、自动内存管理并通常由 JIT 执行；C/C++ 静态编译、可直接管理内存和指针。指针是保存地址且可做地址运算的值，引用通常是某对象的受限别名；JS 所谓引用是对象访问语义，不能做指针运算。C/C++ 从预处理、编译、汇编到链接生成程序；静态链接把所需库代码并入产物，部署简单但体积和升级成本更高。”

### NQ-048

<!-- niuke-id:NQ-048 source-line:71 -->

**问题：** 事件委托（事件代理）的理解、实现原理、优缺点？

**面试者标准回答：**

> “事件委托利用 DOM 事件冒泡，把多个子节点监听合并到稳定祖先；回调通过 `event.target.closest(selector)` 找目标，并确认仍在容器内。优点是监听器少、动态子节点自动生效；缺点是依赖冒泡，focus 等事件和 stopPropagation 要特殊处理，复杂匹配也可能增加耦合。不是任何场景都委托，独立低频节点直接监听更清晰。”

---

## 函数式与 TS

### NQ-049

<!-- niuke-id:NQ-049 source-line:75 -->

**问题：** 防抖（debounce）和节流（throttle）的区别与手写实现（含在防抖里如何终止未执行的函数）？

**面试者标准回答：**

> “防抖是停止触发 wait 后执行，适合搜索输入；节流是在持续触发时限制最高频率，适合滚动采样。实现要明确 leading/trailing、this、参数和返回值；防抖闭包保存 timer，每次先 clear 再重设，并暴露 `cancel()` 清理未执行计时器，必要时提供 flush。动画更新我常用 requestAnimationFrame 节流。”

### NQ-050

<!-- niuke-id:NQ-050 source-line:76 -->

**问题：** TS 常用工具类型 Record / Pick / Omit / Partial / Required / Readonly 分别有什么作用？

**面试者标准回答：**

> “`Record<K,V>` 构造键到值映射；`Pick<T,K>` 选字段，`Omit<T,K>` 排除字段；`Partial` 全部可选，`Required` 全部必填，`Readonly` 只读。它们多是映射类型，只提供编译期约束，通常只作用一层，不会在运行时裁剪、补字段或深冻结对象。接口边界仍要实际转换和校验。”

### NQ-051

<!-- niuke-id:NQ-051 source-line:77 -->

**问题：** TS 泛型介绍？keyof 等类型工具？TS 到最终 JS 的流程、Babel 原理？

**面试者标准回答：**

> “泛型让实现复用时保留输入输出类型关系，`keyof T` 得到属性键联合，`T[K]` 取得对应值类型，`extends` 可加约束。TS 编译器解析、绑定、类型检查后擦除类型并发射 JS/声明文件；Babel 主要做语法解析、AST 转换和代码生成，可移除 TS 语法但默认不做完整类型检查。因此工程中常用 Babel/Vite 转换加 `tsc --noEmit` 或 vue-tsc 检查。”

### NQ-052

<!-- niuke-id:NQ-052 source-line:78 -->

**问题：** interface 与 type 的区别？何时用 type 何时用 interface？TS 可选与必选？如何为早期库（如 jQuery）补充类型？如何为动态 runtime 注入类型做静态检查？

**面试者标准回答：**

> “interface 适合可扩展对象契约、支持声明合并；type 能表达联合、元组、条件和映射类型，复杂组合更灵活。可选属性用 `?`，必填为默认。旧库可安装/编写 `.d.ts`，用 `declare module`、全局声明或模块增强补类型；动态 runtime 注入只能声明静态契约，真实值仍应通过类型守卫或 schema 校验，不能靠断言伪造安全。”

### NQ-053

<!-- niuke-id:NQ-053 source-line:79 -->

**问题：** TS enum 编译成 JS 是什么（对象，key 和 value 都做索引）？

**面试者标准回答：**

> “传统数字 enum 通常编译成同时支持 name→value 和 value→name 的对象，所以会看到正反向映射；字符串 enum 只有正向映射。`const enum` 可能内联，但跨包和 isolatedModules 有兼容风险。现代业务若只需有限字符串，我常用 `as const` 对象或字符串联合，生成代码更直观，也更容易和接口 JSON 对齐。”

### NQ-054

<!-- niuke-id:NQ-054 source-line:80 -->

**问题：** TS 装饰器？

**面试者标准回答：**

> “装饰器是在类、方法、字段等定义阶段附加或变换行为的机制。TypeScript 需要区分新版标准装饰器语义与旧 experimentalDecorators，它们的签名、初始化时机和 metadata 生态不同。适合框架声明、依赖注入和日志等横切能力，但隐藏控制流、顺序敏感，业务代码不应滥用；回答前我会先确认项目采用哪套配置和版本。”

### NQ-055

<!-- niuke-id:NQ-055 source-line:81 -->

**问题：** TypeScript 如何绕过代码检查 / 类型断言？TS 中如何监听变量 / 属性的变化？

**面试者标准回答：**

> “可以用类型断言、非空断言、`any`、`@ts-expect-error` 等绕过检查，但它们只影响编译器，不改变运行时值；我只在已通过外部验证或类型系统表达不了的边界使用，并优先 `unknown` 加守卫。TypeScript 本身不能监听运行时变量，监听要靠 Proxy、getter/setter、Vue 响应式或事件系统，类型只是描述这些 API。”

### NQ-056

<!-- niuke-id:NQ-056 source-line:82 -->

**问题：** TS 与 Vue3 的结合（用 Vue3 为什么可以不用 TS）？

**面试者标准回答：**

> “Vue 3 对 TypeScript 支持良好，`<script setup lang='ts'>` 可给 props、emits、template refs 和 composable 建模，vue-tsc 还能检查模板。Vue 仍可不用 TS，因为框架运行时不依赖类型，JavaScript 项目更轻、适合原型验证；但团队和复杂项目会失去重构与契约保护。我会按规模和维护周期选择，而不是说 Vue 3 必须使用 TS。”

---

## 参考来源

- [牛客网面试经验](https://www.nowcoder.com/discuss)
