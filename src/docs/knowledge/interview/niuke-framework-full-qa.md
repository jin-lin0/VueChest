---
group: 牛客全量答案
order: 52
---

# 牛客全量标准答案 · 二、框架原理（React / Vue）

> 本文按章节逐条对应《牛客面试题库》，题目标题即匹配依据；维护时只需保证题目文本、所属文件和小节一致。

---

## React

### React 和 Vue 的区别？各自适合什么场景？React 和 Vue 在 Diff 算法上的核心区别？React 与 Vue 虚拟 DOM 的区别？React 与 Vue 双向绑定的区别？Vue / React 各自的优缺点？

> “React 更接近 UI 库，强调 JavaScript、单向数据流和显式状态更新；Vue 是渐进式框架，模板、响应式依赖追踪和官方路由/状态生态更一体化。React 更新通常从组件重新执行并由 Fiber 协调，Vue 可借编译期 Patch Flag 和细粒度依赖减少比较。两者都用 VDOM，不保证绝对快；Vue 的 `v-model` 是 prop+event 语法糖，React 通常手写 value/onChange。选型看团队、生态、跨端/SSR需求和存量，而不是简单判优劣。”

### React 常用版本？React 18 / 19 有哪些新特性（Actions / use hook / Server Components / cache() / useTransition 等）？React17 与 React18 升级点？

> “截至 2026 年官方最新主线是 React 19.2，存量常见 18。React 18 带来 `createRoot`、自动批处理、并发渲染基础、transition 和流式 SSR；React 19 增加 Actions、`useActionState`、`useOptimistic`、`use`、ref as prop，并稳定 Server Components 语义；19.2 又有 Activity、`useEffectEvent` 等。`cache` 仅用于 Server Components。17 到 18 升级先用 18.3 查告警，再切 createRoot 并验证 StrictMode effect。”

### React 主要流程介绍（从 setState 到渲染）？React 为什么只更新部分 DOM？state 执行后发生了什么？反复调用 setState 是一次渲染还是多次渲染？

> “setState/dispatch 会把更新放入对应 Fiber 的 update queue，并调度具有优先级的 root 工作；render 阶段计算新 Fiber 树，可被中断且不能做副作用；commit 阶段同步提交 DOM 变更、ref 和 layout effects，随后 passive effects。React 通过新旧 Fiber 和 host 节点差异只改必要 DOM。同一事件或批处理边界内多次更新通常合并一次提交，但结果取决于更新形式；依赖旧值时用函数式更新。”

### 了解虚拟 DOM 吗？setState → 虚拟 DOM → 真实 DOM 的完整过程？虚拟 DOM 的优缺点、性能真的更好吗？

> “虚拟 DOM 是 UI 的 JavaScript 描述。状态更新后 React 重新执行相关组件得到元素树，reconciler 构建/复用 Fiber，commit 阶段把变更应用到真实 DOM。优势是声明式、跨平台、可调度和批量更新；代价是对象创建与比较。手写精准 DOM 在简单场景可能更快，VDOM 的价值不是保证绝对性能，而是在可维护抽象下提供可接受并可优化的更新。”

### React 常用 Hooks 有哪些？各自作用？useEffect 是第一参数入参和返回值是什么、执行机制与原理？useLayoutEffect 和 useEffect 的区别、与 requestAnimationFrame 的执行顺序？

> “常用 Hook 有 useState/useReducer 管状态，useContext 跨层依赖，useRef 保存可变值和 DOM，useMemo/useCallback 做引用缓存，useTransition/useDeferredValue 调度非紧急更新。`useEffect(setup,deps)` 在提交并通常绘制后运行，setup 可返回 cleanup，依赖变化前和卸载时清理；`useLayoutEffect` 在 DOM 提交后、浏览器绘制前同步运行，会阻塞绘制。rAF 通常在下一帧绘制前执行，精确顺序不要跨浏览器死背，测量 DOM 用 layout effect，动画用 rAF。”

### useState 可以放在条件语句里吗，为什么？useState 返回为什么是数组不是对象？

> “Hook 依靠每个 Fiber 上稳定的调用顺序把当前调用对应到状态槽，条件分支会让后续槽位错位，所以只能在组件或自定义 Hook 顶层调用。`useState` 返回数组便于调用者任意命名和多次解构；如果返回固定字段对象，多个 state 解构会重名。规则应由 eslint-plugin-react-hooks 静态检查，而不是靠约定记忆。”

### 了解 React Fiber 吗？为什么需要 Fiber 架构（可中断渲染）？引入 fiber 架构的原因、可中断内部如何实现、何时中断节点渲染、浏览器如何验证空闲时间？React 如何实现中断？fiber 的数据结构与算法？

> “Fiber 把原来不可中断的递归协调拆成可暂停的工作单元。每个 Fiber 保存 type/key、stateNode、child/sibling/return、props/state、flags、lanes 和 alternate，形成链表树；render 阶段按优先级做 begin/complete work，可在宿主调度器判断应让出主线程时暂停，稍后从下一个单元继续；commit 仍同步。它让输入等紧急更新插队，但不是浏览器 `requestIdleCallback` 的简单封装。”

### 函数组件和类组件的区别？Hooks 的优缺点？为什么要有 React Hooks、设计动机？Hooks 为什么不能放在分支逻辑（if）里？依赖过多问题怎么解决（useMemo / useCallback / 拆分 Hook）？用 useMemo 实现 useCallback？

> “函数组件以 props/state 快照重新执行，类组件依赖实例和生命周期。Hooks 让状态逻辑按业务关注点复用，避免 HOC/render props 嵌套；代价是闭包、依赖数组和调用规则更易踩坑。Hook 不能进分支因为顺序标识状态槽。依赖过多先拆 effect 和自定义 Hook、减少派生状态，再按证据用 memo。`useCallback(fn,deps)` 语义近似 `useMemo(()=>fn,deps)`，但都不是正确性的保证。”

### 受控组件与非受控组件？React 父组件更新如何防止子组件不必要的更新（React.memo / shouldComponentUpdate）？React 做优化会用哪些 hooks？

> “受控组件的值由 React state 驱动，便于校验联动；非受控组件由 DOM 保存值，通过 ref 读取，适合简单表单或文件输入。父组件更新默认会执行子组件，可用 `React.memo`/类组件 `shouldComponentUpdate` 在 props 相等时跳过；同时保持 props 引用稳定，用 useMemo/useCallback 缓存真正昂贵或影响 memo 的值。优化前先用 Profiler，避免缓存成本高于收益。”

### React 状态管理工具选择与实践（Redux / Zustand / Pinia）？为什么选 Redux / 不用 redux 如何实现、redux 中间件？为什么选 Pinia？

> “局部状态优先组件或 reducer，低频跨层用 Context；复杂可追踪全局状态、严格事件流和中间件生态可选 Redux Toolkit，中间件包裹 dispatch 做异步、日志等；轻量客户端状态可选 Zustand。Pinia 属于 Vue 生态，不用于 React，但在 Vue 中有良好类型推导和 DevTools。服务端状态我会用查询缓存方案，不把所有响应复制进全局 store。选型看共享范围、调试、并发与团队成本。”

### 自己封装的 hook 介绍？有没有写过自定义 hooks？

> “我会用真实例子讲自定义 Hook，例如 `useChatStream` 封装请求、ReadableStream 解析、AbortController 和加载/错误状态。Hook 的输入输出是稳定契约，内部组合原生 Hook，清理订阅并处理竞态；它复用的是有状态逻辑，不共享同一份状态。测试会覆盖取消、依赖变化、旧响应覆盖和错误分支，而不是只展示代码抽取。”

### React Native 为什么用 React 写 UI？react-dom 了解过吗？react native 原理？H5 和 React Native 的区别？

> “React 把声明式组件和协调器与具体渲染器分离：react-dom 把 Fiber 提交为 DOM，React Native 的 renderer 把它映射为平台原生视图，不是 WebView HTML。RN 可共享状态和业务逻辑，但布局、导航、原生模块与性能边界不同。H5 跨平台和发布快，受浏览器能力限制；RN 更接近原生体验，可调用原生 API，但升级、桥接/新架构和端差异成本更高。”

### JSX / TSX 的编译原理（编译成 React.createElement）？

> “JSX 是语法扩展，Babel/TypeScript 先解析为 AST，再由经典 transform 生成 `React.createElement(type,props,...children)`，现代 automatic runtime 通常生成 `jsx/jsxs` 调用，无需手动 import React。TSX 还要处理 TypeScript 语法和类型检查，但类型最终被擦除。元素结果是普通描述对象，真正创建 DOM 是 renderer 的 commit 阶段。”

### Diff 算法的核心原则？时间复杂度怎么从 O(n³) 优化到 O(n)？key 的作用？React 如何跨层级通信？

> “通用树编辑距离可到 O(n³)，React 基于 Web UI 的两个启发式把同层协调近似为 O(n)：不同 type 通常重建子树，同级元素用 key 表达稳定身份，不尝试任意跨层移动。key 影响复用和局部状态，不能用不稳定随机值或会变化的索引。跨层通信可用 Context、组合 children、状态提升或外部 store，优先缩小共享范围。”

### 组件库项目有什么比较复杂的组件、怎么实现的？自研组件库亮点难点（如何封装一个 button / ProTable / ProForm）？组件库如何升级？

> “我会选 ProTable/ProForm 讲 schema、状态和扩展点：表格把查询、分页、排序、列配置、权限、虚拟滚动分层，表单用字段注册、局部订阅和 async 校验避免全量渲染；Button 则重点是语义、loading、防重复、键盘和主题。组件库用 design token、无障碍、文档示例和视觉/行为测试。升级采用 semver、变更日志、codemod、弃用周期和 canary，不能直接破坏业务。”

### 微前端怎么做的？微前端如何做状态保持？qiankun 接入步骤 / 子应用配置打包 / 沙箱与通信？

> “微前端适合独立团队和发布节奏，不是普通模块拆分的默认答案。qiankun 主应用注册子应用和激活规则，子应用导出 bootstrap/mount/unmount，配置 publicPath、路由 basename 和静态资源；样式/JS 沙箱、全局状态或事件总线负责隔离通信。状态保持可缓存实例或把状态外置，但要控制内存和版本。还要处理鉴权、依赖重复、预加载、错误隔离与子应用独立运行。”

### 在 React 里怎么接入 Vue 组件（Web Component 包装）？前端里怎么接入 AI（流式渲染、上下文传给大模型）？

> “跨框架组件可把 Vue 组件封装成 Custom Element，React 侧把它当 DOM 标签，用属性和 CustomEvent 通信；复杂对象、事件命名、Shadow DOM 样式和卸载需适配，也可用独立 mount/unmount 包装。接 AI 时密钥放服务端，前端用 fetch stream/SSE 增量消费，按帧更新并支持 abort；上下文要有 token 预算、摘要和隐私过滤，模型输出按不可信 Markdown 清洗。”

---

## Vue

### Vue2 和 Vue3 的区别？Vue3 的响应式原理（Proxy）？Vue2 如何监听数组的 push / pop？Vue2 直接通过数组下标赋值无法更新视图的原因与解决方案？Vue2 响应式的弊端、哪些数组方法改动不会被监听？

> “Vue 2 用 `Object.defineProperty` 转换已有属性，数组通过重写 push/pop/splice 等七个变更方法通知；直接索引赋值、改 length、新增/删除属性不会被拦截，要用 `Vue.set/$set` 或 splice。Vue 3 对对象用 Proxy、ref 用 getter/setter，可覆盖属性新增删除和数组索引，并支持 Composition API、Fragment、更好 TS 与编译优化。不是所有数组方法都要监听：filter/map 返回新数组，需把结果重新赋给响应式状态。”

### Proxy 与 defineProperty 的区别？Vue3 中如何避免一开始递归加响应式带来的性能问题？为什么用 Proxy，与 Vue2 defineProperty 相比解决什么问题？

> “defineProperty 只能逐个属性设置 getter/setter，新增删除和数组索引要补丁；Proxy 代理整个对象，可拦截 get/set/delete/has/ownKeys 等。Vue 3 创建 reactive 时只先返回根 Proxy，嵌套对象在 getter 访问时再懒转换，避免启动时深递归；真正的大型不可变结构还可用 shallowRef/shallowReactive。Proxy 不能完整 polyfill，也不能直接代理基本类型，所以仍需要 ref。”

### 组合式 API 与选项式 API 的区别、优势？组合式函数（composables）是什么、怎么写？组合式 API 的优缺点？hooks 与 mixin 的区别？

> “Options API 按 data/methods/computed 等选项组织，入门直观；Composition API 在 setup 中按业务关注点组织状态、副作用和方法，更适合大型组件与逻辑复用。composable 是调用 Vue API、返回响应式状态的普通函数，命名通常 `useX`，需在 setup 同步上下文调用并清理副作用。它比 mixin 来源显式、可传参且少命名冲突；缺点是可随意拆得过碎、ref `.value` 和闭包边界需要规范。”

### ref 与 reactive 的区别？为什么 template 里响应式不用 .value？

> “reactive 只接对象并返回 Proxy，整体替换和直接解构容易断开追踪；ref 可包任意值，用稳定容器的 `.value` 读写，对象值内部会转 reactive。模板渲染上下文会自动解包顶层 ref，所以通常不用 `.value`，但数组/集合中的 ref 和某些嵌套表达式有边界。团队里我常优先 ref，需要一组固定字段共同修改时用 reactive。”

### Vue3 生命周期？Vue2 与 Vue3 的生命周期对应？Vue3 的 Composition API setup() 里响应式丢失的原因与解决？第一次渲染触发哪几个钩子、created 与 mounted 的区别？

> “Composition API 常用 onBeforeMount/onMounted、onBeforeUpdate/onUpdated、onBeforeUnmount/onUnmounted、onActivated/onDeactivated，对应 Vue2 的 mounted 等；beforeCreate/created 的初始化逻辑直接在 setup 执行。首渲染是 setup、beforeMount、mounted。created 时数据和方法可用但无 DOM，mounted 后 DOM 已挂载。reactive 解构或整体替换会丢响应式，用 toRefs、保留对象访问或 ref；生命周期副作用要在卸载时清理。”

### v-if 与 v-show 的区别及渲染机制？visibility:hidden、display:none、opacity:0 的核心区别？

> “`v-if` 按条件创建/销毁分支，初始为假不渲染；`v-show` 始终渲染，只切 display，适合高频切换。CSS 的 `display:none` 不占布局且不绘制，`visibility:hidden` 保留布局但不可见，`opacity:0` 仍布局、绘制为透明并默认可点击/聚焦。可访问性和事件行为也不同，不能只从视觉判断。”

### provide / inject 的数据是否响应式？mixin、slot 的理解与使用？插槽的使用场景？

> “provide/inject 本身不自动把普通值变响应式；提供 ref/reactive 时注入方会观察其变化，最好由提供方暴露 readonly 状态和修改方法。mixin 把选项合并进组件，容易命名冲突和来源不透明，现代代码优先 composable。slot 是父组件把 UI 结构交给子组件渲染的扩展点，默认/具名/作用域插槽适合容器、表格单元格和组件库定制内容。”

### keep-alive 的作用与原理？

> “KeepAlive 是内置抽象组件，缓存动态组件实例及其渲染子树，切换时从活动树移出而不是卸载，再次激活时复用状态；会触发 activated/deactivated。可用 include/exclude/max 控制，max 通常按 LRU 淘汰。缓存不是越多越好，定时器和订阅在 deactivated 时也要暂停，路由参数变化还需明确 key 与缓存粒度。”

### Vue 的响应式原理？双向数据绑定的底层实现？v-model 的实现原理（input / select）？

> “Vue 响应式通过读取 track、写入 trigger 和 reactive effect 调度组件更新；双向绑定不是魔法，状态到视图由响应式渲染，视图到状态由事件。组件 `v-model` 编译为 `modelValue` prop 加 `update:modelValue` 事件；原生 input 通常监听 input 并写 value，checkbox/radio/select 有各自 checked/value 与 change 语义，修饰符再处理 trim/number/lazy。”

### 组件通信方式有哪些（父子组件通信、跨层级）？全局状态管理怎么做的？

> “父子组件遵循 props down、events up，双向契约用 v-model；父访问子暴露能力用 template ref/defineExpose，内容扩展用 slot。跨多层局部依赖用 provide/inject，可复用状态逻辑用 composable；真正跨页面、需调试和持久化的客户端状态用 Pinia。服务端状态不应全部复制到全局 store，要区分缓存、失效和重新验证。”

### Vuex 的原理、含义和作用？为什么选 Pinia？Pinia 相比 Vuex 的优点、两者使用场景区别？Pinia 做状态管理的意义与价值？Pinia 怎么做响应式持久化、与 Vuex 在插件机制上的本质差别？vuex 迁移到 pinia 的原因？

> “Vuex 用单一 store、state/getters/mutations/actions 和 commit/dispatch 管理可追踪状态；Pinia 以多个 store、state/getters/actions 为主，去掉 mutations，Composition API 和 TS 推导更自然。持久化通过插件订阅变更，挑选字段序列化并做版本迁移，不是框架自动安全。两者插件都能订阅 store 生命周期，但 API 模型不同。Vue3 新项目我优先 Pinia，迁移按模块逐店替换并保持行为测试，不为新而迁。”

### Vue Router 介绍？两种模式（hash / history）区别？页面权限 / 路由鉴权怎么实现？动态路由、RBAC 权限整套实现流程？

> “Vue Router 把 URL 映射到组件树。hash 片段不发给服务器，部署简单；history URL 自然但服务器必须 SPA fallback。权限流程是登录后获取用户与角色权限，生成允许路由并注册，守卫处理未登录、加载中、无权和 404，退出时清理动态路由。前端路由和按钮权限只改善体验，后端仍必须按用户和资源鉴权，RBAC 还要处理角色变更与刷新恢复。”

### Vue 列表渲染中 key 的作用及对应底层渲染逻辑？用数组下标作为 key 会带来哪些渲染异常（不止插入元素）？即使严格响应式规范操作，还有哪些情况可能渲染异常？

> “key 表达同一父节点下 VNode 的稳定身份，Vue keyed diff 据此复用、移动、新建和删除，并用最长递增子序列减少移动。索引 key 在头插、删除、排序、过滤时会把 DOM、输入值和组件局部状态复用到错误数据；随机 key 又会每次重建。即使数据响应式正确，重复 key、原地改第三方非响应对象、异步竞态、错误缓存 key 或直接操作 DOM 都可能造成表现异常。”

### Vue nextTick 是什么、作用？如何结合 nextTick 优化流式渲染？vue observable 了解吗？

> “Vue 把同步状态变更批量进队列，`nextTick` 等当前批次 DOM patch 完成，不是让数据异步。流式渲染不能每 token 都 nextTick；我会先按 rAF/时间片合并文本更新，只有确实要读取更新后高度或滚动时 await 一次 nextTick。Vue 2 的 `Vue.observable` 可把对象变响应式，Vue 3 对应主要是 `reactive`，应按所用版本回答。”

### 为什么用 Vue3 / 为什么选 Vue？Vue 是怎么编译的？

> “我选择 Vue3 是因为团队交付效率、Composition API 复用、完整官方生态、Proxy 响应式、编译优化和 TS 支持符合项目，而不是只因语法简单。编译链是 template 解析成 AST，transform 提取静态与动态信息，codegen 生成 render 函数和 Patch Flag；运行时执行 render 得到 VNode，响应式更新后由 renderer diff/patch。运行时模板编译版和预编译版体积也不同。”

### 微前端 / 大屏适配方案（优缺点）？

> “微前端用于团队和发布隔离，可选 qiankun、Module Federation、iframe 或 Web Components，代价是依赖重复、通信、路由和一致体验。大屏适配我先确认设计基准和目标设备：固定比例可用 transform scale，响应式用 Grid/Flex、vw/rem 和断点，图表监听容器 ResizeObserver 重绘。scale 实现快但文字模糊、坐标和弹层需换算；完全响应式质量好但开发成本高。”

### 一个 Vue2 的 H5 项目想迁移到 Vue3 该怎么做（迁移方案、破坏性变更兼容、组合式 API 改写、依赖与构建工具升级、风险控制）？

> “迁移先建立 Vue2 当前测试、监控和构建基线，盘点依赖与破坏项；可用 Vue 3 migration build 做兼容告警，按路由/业务模块渐进迁移，而不是一次重写。先升级 Node、构建和第三方库，再处理全局 API、v-model、filters、事件 API、slot、生命周期等；Options API 可先保留，复杂逻辑再逐步 composable。双跑或灰度、自动化回归、性能对比和快速回滚控制风险。”

### history 模式刷新时为什么会出现白屏 / 404？怎么解决（服务端配置 SPA fallback / historyApiFallback）？

> “history 模式的深层 URL 会作为真实路径请求服务器；服务器若只存在 index.html，就返回 404，前端代码根本没机会接管。解决是在 Nginx/Vercel/Node 配置未命中静态资源和 API 时回退 index.html，再由 Vue Router 解析；开发服务器用 history fallback。规则要排除 API 和带扩展名资源，否则真实 404 会错误返回 HTML，表现成脚本 MIME 错误或白屏。”

### 用 reactive 声明了一个表单对象，想把它的字段重置回初始值，应该怎么做（为什么不能直接 `formData = initialData` 整体重新赋值来重置、Object.assign 合并初始值为什么可以）？

> “reactive 返回稳定 Proxy，模板和 effect 依赖这个代理；把局部变量重新指向 initialData 不会修改旧 Proxy，甚至 const 不能重赋。应保留代理身份，用 `Object.assign(formData, cloneInitial())` 更新字段，必要时先删除初始对象不存在的动态键。或者用 `ref` 包整个表单并替换 `.value`。初始快照要深度策略明确，避免被表单共享修改。”

---

## 通用

### 组件库如何适配暗黑模式？CSS Module 用过吗、原理？class 冲突怎么解决？修改 antd 组件样式如何避免被覆盖？styled-components 使用与实现原理？Shadow DOM 样式隔离？Tailwind 相比普通 css 的优势、类名太多如何维护？

> “暗黑模式用语义 design token 加根主题属性，组件只消费变量。CSS Modules 在构建时把局部 class 哈希化，BEM/命名空间解决全局样式冲突；改 antd 优先 token/theme API，其次低耦合选择器，避免堆 `!important`。styled-components 运行时/编译时生成作用域 class并按 props 注入样式；Shadow DOM 隔离更强但主题、弹层和 SSR 有成本。Tailwind 一致、按需产出快，类多时抽组件、variant 和 `clsx`，不滥用 `@apply`。”

### less / sass 原理？webpack 中如何配置编译 less？

> “Less/Sass 是预处理器，把变量、嵌套、mixin 等扩展语法编译为标准 CSS；Sass 还有模块系统，浏览器不直接理解源文件。Webpack 配置通常是从右到左 `less-loader` 把 Less 转 CSS，`css-loader` 解析 import/url 和 Modules，`style-loader` 开发时注入或生产用 MiniCssExtractPlugin 提取；还需安装 less，实现 source map 和全局变量注入要控制耦合。”

### 单页面路由的理解；SPA 和 MPA 的区别及优缺点？为什么只有一个 index.html 却能显示不同页面（SPA）？

> “SPA 首次加载一个 HTML 和 JS，客户端路由监听 History/hash，URL 变化后选择组件并更新页面，所以仍可显示多路由；优点是切换流畅、前后端分离，缺点是首包、SEO和运行时复杂。MPA 每个路由由服务器返回独立 HTML，首屏和天然 SEO 好、页面隔离强，但跨页重载和共享状态成本高。现代 SSR/SSG 是折中，架构按内容与交互选择。”

### 表单有很多字段，如何实现对应字段改变只渲染部分组件（React 渲染优化）？复杂表单动态输入项 / 状态管理与校验？

> “复杂表单应把状态按字段订阅而不是一个大对象驱动整棵树。可让每个 Field 向表单 store 注册，使用 useSyncExternalStore/成熟表单库只订阅自己的 value/error，组件再 memo；动态数组用稳定业务 key，不用索引。校验分同步字段、跨字段和异步服务端，异步要防抖取消与竞态。派生值不重复存，提交时统一 schema 校验并聚焦首个错误。”

### 框架和 jQuery 的区别？vue 可以用 jsx 吗？如果给多个项的列表通过操作 DOM 插入 body 不能包 div 怎么做？

> “jQuery 以命令式 DOM 查询和修改为中心，开发者维护 DOM 状态；Vue/React 用状态驱动声明式 UI、组件和调度器，适合复杂持续变化界面，但简单页面不必强上框架。Vue 支持 JSX，通过插件把 JSX 编译为 VNode。多个并列节点不能包 div 时可用 DocumentFragment 原生插入；在 Vue/React 模板中用 Fragment/多根节点，避免增加无意义 DOM。”

---

## 参考来源

- [牛客网面试经验](https://www.nowcoder.com/discuss)
