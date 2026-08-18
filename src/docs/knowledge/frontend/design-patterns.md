---
group: 架构与设计
order: 25
---

# 设计模式在前端的应用

> 适用场景：写出可维护、可扩展、可测试的前端代码；应对场景题（见 `scenario`）。本文挑前端最高频的六种模式，给真实落地代码。
> 阅读前提：类与对象基础（见 `ts-advanced` 的 class/泛型）。

设计模式不是炫技，而是「把反复出现的代码结构沉淀成套路」。前端常见场景高度集中在「状态变化通知」「行为可替换」「对象创建」三类。

## 一、观察者 / 发布订阅（Observer / Pub-Sub）

**问题**：一个状态变了，多个地方要响应，但不想互相硬耦合。

```ts
// 极简 EventBus（发布订阅）
class EventBus {
  private map = new Map<string, Set<Function>>()
  on(ev: string, fn: Function) {
    ;(this.map.get(ev) ?? this.map.set(ev, new Set()).get(ev)!).add(fn)
    return () => this.off(ev, fn)
  }
  off(ev: string, fn: Function) { this.map.get(ev)?.delete(fn) }
  emit(ev: string, ...args: any[]) { this.map.get(ev)?.forEach((f) => f(...args)) }
}

const bus = new EventBus()
const off = bus.on('login', (u) => console.log('欢迎', u))
bus.emit('login', { name: '锦霖' })
off() // 记得取消，避免泄漏
```

> 前端里 Vue 的响应式、`watch`、`mitt` 库、浏览器事件系统本质都是观察者。场景题中「多个模块监听同一状态变化」就用它。

## 二、策略模式（Strategy）

**问题**：同一动作有多种算法/分支，未来还会加。

```ts
// 不同折扣策略，互不影响、可随时增删
const strategies = {
  normal: (p: number) => p,
  vip: (p: number) => p * 0.8,
  svip: (p: number) => p * 0.6,
}
function calc(price: number, level: keyof typeof strategies) {
  return strategies[level](price)
}
```

> 比 `if/else` 链好维护：新增等级只加一个 key，不改主逻辑。表单校验、排序比较器、支付渠道选择都用这招。

## 三、单例模式（Singleton）

**问题**：全局只该有一个实例（如配置、连接池、Pinia 实例）。

```ts
class Config {
  private static _i?: Config
  static get instance() {
    return (this._i ??= new Config())
  }
  apiBase = import.meta.env.VITE_API_BASE_URL
}
```

> 现代前端其实更常用「模块单例」（ES Module 天然单例，`export const x = ...`），比手写 class 单例更轻。Pinia 的 store 也是单例语义。滥用单例会让测试难 mock，谨慎。

## 四、工厂模式（Factory）

**问题**：对象创建逻辑复杂或类型多样，调用方不该关心「怎么 new」。

```ts
function createChart(type: 'bar' | 'line', data: number[]) {
  if (type === 'bar') return new BarChart(data)
  if (type === 'line') return new LineChart(data)
  throw new Error('未知图表类型')
}
```

> Vue 的 `h()` 渲染函数、`defineComponent` 都可看作工厂。组件库里「按配置生成组件」也常用。

## 五、装饰器模式（Decorator）

**问题**：不改动原对象，动态加功能（日志、缓存、权限）。

```ts
// TS 装饰器：给方法加执行耗时日志
function logTime(target: any, key: string, desc: PropertyDescriptor) {
  const fn = desc.value
  desc.value = function (...args: any[]) {
    const t = performance.now()
    const r = fn.apply(this, args)
    console.log(`${key} 耗时`, performance.now() - t)
    return r
  }
}
class Api { @logTime fetchUser() {} }
```

> 注意：TS 装饰器语法仍在演进（Stage 3），Vue 3 用的是 `@vue/compiler-sfc` 下的写法。工程中更常见的是「高阶函数」实现装饰（包裹原函数返回新函数）。

## 六、模块/组合模式（Composite）

**问题**：树形结构（菜单、组件树），父子用同一套接口操作。

```ts
interface Node { render(): string }
class Item implements Node { render() { return '<li>' } }
class Menu implements Node {
  constructor(private children: Node[]) {}
  render() { return '<ul>' + this.children.map((c) => c.render()).join('') + '</ul>' }
}
```

> Vue 组件天然是组合模式：父组件渲染子组件，递归成树。场景题「渲染嵌套菜单/评论楼中楼」直接套。

## 七、选型速记

| 模式 | 关键词 | 典型场景 |
|------|--------|----------|
| 观察者/发布订阅 | 一对多通知 | 状态变化广播、EventBus |
| 策略 | 可替换算法 | 折扣/校验/支付渠道 |
| 单例 | 全局唯一 | 配置/连接/Pinia |
| 工厂 | 封装创建 | 图表/组件生成 |
| 装饰器 | 不改原物加功能 | 日志/缓存/鉴权 |
| 组合 | 树形递归 | 菜单/组件树 |

> 别为了用模式而用模式。大多数前端需求用「组合 + 观察者 + 策略」就够；`scenario` 场景题常考的就是这几样，能口述「为什么用、怎么写」即可。

## 参考来源

- Refactoring.Guru 设计模式：<https://refactoring.guru/design-patterns>
- Addy Osmani《JavaScript 设计模式》：<https://www.patterns.dev/posts/>
- 发布订阅与前端：<https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget>
