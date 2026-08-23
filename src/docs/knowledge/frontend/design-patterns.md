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
  off(ev: string, fn: Function) {
    this.map.get(ev)?.delete(fn)
  }
  emit(ev: string, ...args: any[]) {
    this.map.get(ev)?.forEach((f) => f(...args))
  }
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
// 高阶函数装饰：与 TS 装饰器配置无关，类型关系清晰
function withTiming<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const startedAt = performance.now()
    try {
      return await fn(...args)
    } finally {
      console.log(`${name} 耗时`, performance.now() - startedAt)
    }
  }
}

const fetchUserWithTiming = withTiming('fetchUser', fetchUser)
```

> TypeScript 同时存在旧版 experimental decorators 与标准装饰器语义，签名和配置不同。业务工程若不需要元数据/类声明语法，高阶函数通常更直观，也更容易测试与组合。

## 六、模块/组合模式（Composite）

**问题**：树形结构（菜单、组件树），父子用同一套接口操作。

```ts
interface Node {
  render(): string
}
class Item implements Node {
  render() {
    return '<li>'
  }
}
class Menu implements Node {
  constructor(private children: Node[]) {}
  render() {
    return '<ul>' + this.children.map((c) => c.render()).join('') + '</ul>'
  }
}
```

> Vue 组件天然是组合模式：父组件渲染子组件，递归成树。场景题「渲染嵌套菜单/评论楼中楼」直接套。

## 七、选型速记

| 模式            | 关键词         | 典型场景               |
| --------------- | -------------- | ---------------------- |
| 观察者/发布订阅 | 一对多通知     | 状态变化广播、EventBus |
| 策略            | 可替换算法     | 折扣/校验/支付渠道     |
| 单例            | 全局唯一       | 配置/连接/Pinia        |
| 工厂            | 封装创建       | 图表/组件生成          |
| 装饰器          | 不改原物加功能 | 日志/缓存/鉴权         |
| 组合            | 树形递归       | 菜单/组件树            |

> 别为了用模式而用模式。大多数前端需求用「组合 + 观察者 + 策略」就够；`scenario` 场景题常考的就是这几样，能口述「为什么用、怎么写」即可。

## 八、适配器与命令模式

适配器把第三方或多供应商接口转换成内部稳定协议，特别适合支付、地图、模型流式事件。业务层只依赖 `PaymentAdapter`，供应商字段变化被限制在边界层；这比在每个组件写 `if (provider === ...)` 更可测试。

命令模式把一次操作表示成带 execute/undo 的对象，适合编辑器、低代码画布和批量任务。命令保存最小变更与回滚信息，历史栈只关心统一接口；不可逆网络副作用则需要补偿命令和幂等，而不是假装能本地 undo。

```ts
interface Command {
  execute(): void
  undo(): void
}

function createRenameCommand(item: Item, nextName: string): Command {
  const previousName = item.name
  return {
    execute: () => (item.name = nextName),
    undo: () => (item.name = previousName),
  }
}
```

## 九、常见坑与判断方法

- **观察者无生命周期**：订阅不返回 unsubscribe，组件卸载后泄漏或重复执行。
- **全局单例隐藏依赖**：测试互相污染、SSR 串用户；优先依赖注入，确需单例时提供 reset/替换点。
- **策略对象只有一个分支**：为未来假设制造间接层；出现第二个稳定算法再抽象。
- **工厂返回巨大联合却无统一接口**：调用方仍写类型判断，说明创建与行为边界没抽好。
- **装饰链顺序不透明**：缓存、重试、超时、日志的包裹顺序会改变语义，应固定组合入口并测试失败路径。
- **模式名替代问题描述**：代码评审先说明变化点、约束和代价，再决定是否套用模式。

## 十、模式选型清单

1. 变化的是算法 → 策略；变化的是外部接口 → 适配器；变化的是创建过程 → 工厂。
2. 一次操作需要排队、记录或撤销 → 命令；一对多通知且发送方不关心接收方 → 发布订阅。
3. 横切日志、缓存、权限需要组合 → 高阶函数/装饰器，但明确顺序和异常语义。
4. 树节点需要统一操作 → 组合；只有全局唯一资源且生命周期可控时才考虑单例。
5. 抽象前至少确认两个真实变体；抽象后比较测试、调试和认知成本是否下降。

## 参考来源

- Refactoring.Guru 设计模式：<https://refactoring.guru/design-patterns>
- Addy Osmani《JavaScript 设计模式》：<https://www.patterns.dev/posts/>
- 发布订阅与前端：<https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget>
- TypeScript Decorators：<https://www.typescriptlang.org/docs/handbook/decorators.html>
