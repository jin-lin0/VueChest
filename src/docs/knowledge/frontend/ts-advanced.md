---
group: TypeScript
order: 5
---

# TypeScript 进阶类型与工程实践

TypeScript 的威力在于「类型即文档、类型即测试」。本文聚焦进阶类型体操与工程落地：泛型约束、条件类型、`infer`、映射类型、模板字面量类型、类型守卫，以及如何在真实项目里用类型守住运行时边界。示例均可在 TS 5.x 验证。

## 一、泛型与约束

泛型让函数 / 类型对「类型」参数化；`extends` 约束入参类型，避免乱用。

```ts
// 约束 T 必须有 length 属性
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b
}
longest('abc', 'de') // ✅
// longest(1, 2)     // ❌ number 没有 length

// keyof + 索引访问：安全地取对象某字段
function getProp<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}
const user = { name: '张三', age: 20 }
getProp(user, 'name') // string
getProp(user, 'age') // number
```

**泛型默认值**：`function fn<T = string>(x: T): T`。

## 二、条件类型（Conditional Types）

语法 `T extends U ? X : Y`，根据类型关系分支。

```ts
type IsString<T> = T extends string ? true : false
type A = IsString<'a'> // true
type B = IsString<42> // false

// 分发条件类型（裸类型参数才分发）
type ToArray<T> = T extends any ? T[] : never
type C = ToArray<string | number> // string[] | number[]
// 阻止分发：包一层元组
type ToArrayNonDist<T> = [T] extends [any] ? T[] : never
type D = ToArrayNonDist<string | number> // (string | number)[]
```

## 三、`infer` 推断类型

在条件类型里用 `infer` 捕获「被匹配部分的类型」，是类型提取的利器。

```ts
// 提取 Promise 的解析值类型
type Unwrap<T> = T extends Promise<infer V> ? V : T
type X = Unwrap<Promise<number>> // number
type Y = Unwrap<string> // string

// 提取函数返回值
type ReturnOf<T> = T extends (...args: any[]) => infer R ? R : never
type R = ReturnOf<() => boolean> // boolean

// 提取数组元素
type Elem<T> = T extends (infer E)[] ? E : never
type E = Elem<string[]> // string
```

> 实战：`Awaited<T>`（TS 内置）就是 `infer` 提取 Promise 链的典范，递归展开嵌套 Promise。

## 四、映射类型（Mapped Types）

把已有类型的每个属性「映射」成新形态，配合 `keyof` 与修饰符（`-?` 去可选、`readonly`）。

```ts
type Partial<T> = { [K in keyof T]?: T[K] }
type Readonly<T> = { readonly [K in keyof T]: T[K] }
type Nullable<T> = { [K in keyof T]: T[K] | null }

// 重映射 key（TS 4.1+）：改名
type Rename<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] }
type R = Rename<{ name: string }> // { getName: () => string }

// 过滤 key：排除某些字段
type ExcludeKey<T, U> = { [K in keyof T as K extends U ? never : K]: T[K] }
type E = ExcludeKey<{ a: 1; b: 2 }, 'a'> // { b: number }
```

**键约束**：`K in keyof T as ...` 中 `never` 的键会被剔除（过滤技巧）。

## 五、模板字面量类型（Template Literal Types）

像字符串模板一样拼接类型，常用于构造「受控字符串」类型。

```ts
type Lang = 'zh' | 'en'
type Page = 'home' | 'about'
type Route = `/${Lang}/${Page}` // '/zh/home' | '/zh/about' | ...

// 配合 infer 解析路径参数
type ExtractParam<T> = T extends `/user/:${infer P}` ? P : never
type P = ExtractParam<'/user/:id'> // 'id'
```

## 六、类型守卫与收窄（Narrowing）

让 TS 在运行时分支里正确收窄类型。

```ts
// 1) 自定义类型守卫
function isString(x: unknown): x is string {
  return typeof x === 'string'
}
function handle(x: string | number) {
  if (isString(x)) x.toUpperCase() // 此处 x 被收窄为 string
}

// 2) in / typeof / instanceof
function f(x: string | { id: number }) {
  if ('id' in x) x.id // 收窄为对象
}

// 3) 判别联合（discriminated union）
type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }
function area(s: Shape) {
  switch (s.kind) {
    case 'circle':
      return Math.PI * s.r ** 2
    case 'rect':
      return s.w * s.h
  }
}
```

**经验**：优先用判别联合 + `switch`，比层层类型断言更安全、更易扩展。

## 七、内置实用工具类型

| 工具类型         | 作用                      |
| ---------------- | ------------------------- |
| `Partial<T>`     | 所有属性变可选            |
| `Required<T>`    | 所有属性变必填            |
| `Pick<T, K>`     | 挑选部分属性              |
| `Omit<T, K>`     | 排除部分属性              |
| `Record<K, V>`   | 构造键值映射类型          |
| `Exclude<T, U>`  | 排除联合中的某些成员      |
| `Extract<T, U>`  | 提取联合中的某些成员      |
| `NonNullable<T>` | 排除 `null` / `undefined` |
| `Parameters<T>`  | 提取函数参数元组          |
| `ReturnType<T>`  | 提取函数返回值类型        |
| `Awaited<T>`     | 解开 Promise 的值类型     |

```ts
type User = { id: number; name: string; email?: string }
type UserPreview = Pick<User, 'id' | 'name'> // { id; name }
type UserUpdate = Partial<User> // 更新时字段均可选
const map: Record<string, number> = { a: 1 }
```

## 八、模块扩展与声明合并

为第三方库 / 全局类型打补丁时常用。

```ts
// 给 window 加自定义字段
declare global {
  interface Window {
    __APP_ID__: string
  }
}
export {} // 让本文件成为模块，global 才生效

// 扩展第三方模块类型
declare module 'some-lib' {
  interface Config {
    newOption?: boolean
  }
}
```

## 九、类型与运行时的边界

类型是编译期产物，运行时不复存在。**永远不要信任外部输入**，用运行时校验桥接：

```ts
import { z } from 'zod'

// 用 schema 同时定义「类型」与「校验」
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email().optional(),
})
type User = z.infer<typeof UserSchema> // 类型从 schema 推导，单一事实来源

function parseUser(data: unknown): User {
  return UserSchema.parse(data) // 运行时不合法直接抛错
}
```

**经验法则**：边界处（API 响应、表单、localStorage）一律做运行时校验（`zod` / `valibot`）；内部逻辑信任 TS 类型即可。

## 十、`unknown`、`any` 与穷尽检查

外部输入先用 `unknown`，它要求在使用前收窄；`any` 会同时关闭调用方和实现方的检查，应该只出现在迁移边界并记录清理计划。异常捕获值、JSON 解析和消息事件都属于典型 `unknown` 边界。

判别联合新增成员后，`never` 穷尽检查能让遗漏在编译期暴露：

```ts
type Result =
  | { status: 'success'; data: string }
  | { status: 'error'; error: Error }
  | { status: 'cancelled' }

function render(result: Result): string {
  switch (result.status) {
    case 'success':
      return result.data
    case 'error':
      return result.error.message
    case 'cancelled':
      return '已取消'
    default: {
      const unreachable: never = result
      return unreachable
    }
  }
}
```

## 十一、常见坑与类型设计边界

- **滥用 `as` 和非空断言**：断言只让编译器闭嘴，不产生校验。先修正控制流或在边界验证。
- **用 `Partial<T>` 表示补丁却不定义规则**：字段可选不代表 `undefined`、删除和不更新含义相同；为 Patch 单独建类型和 schema。
- **索引签名过宽**：`Record<string, X>` 会暗示任意 key 都存在。开启 `noUncheckedIndexedAccess` 后显式处理缺失。
- **包装类型写成 `String/Number`**：业务数据使用小写原始类型 `string/number/boolean`。
- **复杂类型体操泄漏到公共 API**：递归条件类型可能拖慢编辑器并产生难读错误。公共边界优先清晰的命名类型，复杂推导藏在内部。
- **声明合并范围失控**：第三方模块增强必须与真实模块名一致，并用专门的 `.d.ts` 和类型测试约束；不要为了绕错覆盖官方声明。

泛型的目标是保持输入输出关系，不是消灭所有重复。如果函数只接受一种类型，就不需要泛型；如果类型参数只出现一次，调用者往往得不到额外安全性。API 设计先追求可读的业务约束，再考虑抽象复用。

## 十二、工程实践清单

1. `tsconfig` 开 `strict: true`（含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 按需）；
2. 优先 `interface` 描述对象形状、用 `type` 做联合 / 工具类型；
3. 复杂联合用「判别联合 + 类型守卫」，少写 `as` 断言；
4. 跨边界数据用 `zod` 等做运行时校验，类型由 schema 推导；
5. 用 `satisfies` 既校验类型又保留字面量类型：

```ts
const routes = {
  home: '/',
  about: '/about',
} satisfies Record<string, string>
// routes.home 仍是字面量 '/'，而非宽泛的 string
```

6. 对关键联合做 `never` 穷尽检查，对类型工具写编译期用例；
7. 区分 `type` import 和运行时 import，发布库时检查声明产物与 `exports`；
8. 升级 TypeScript 先在 CI 试跑，审查新增错误，避免长期锁死 `skipLibCheck` 掩盖依赖冲突。

## 参考来源

- TypeScript 官方手册：[www.typescriptlang.org/docs](https://www.typescriptlang.org/docs/)
- TypeScript 内置工具类型参考：[utility-types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- TypeScript 类型收窄：[narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- TypeScript `noUncheckedIndexedAccess`：[tsconfig/noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html)
- TypeScript 中文文档：[www.typescriptlang.org/zh](https://www.typescriptlang.org/zh/docs/)
- Zod 校验库：[zod.dev](https://zod.dev/)
- 类型体操练习（理解进阶类型）：[type-challenges](https://github.com/type-challenges/type-challenges)
