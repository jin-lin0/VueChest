---
group: 项目与模拟
order: 3
---

# 前端 & Agent 模拟面试

使用方法：先只看问题并计时作答，再看标准答案。每题按 0～3 分评分：`0` 不会，`1` 只有关键词，`2` 主线正确，`3` 有机制、工程取舍和边界。技术题总分达到 70% 且没有安全性致命错误，才进入下一套。

---

## 模拟一：中高级 Vue 前端（45 分钟）

### 1. 请做一个 90 秒自我介绍。

**标准回答：**

> “您好，我主要使用 Vue 3 和 TypeScript 做前端开发，最近重点在复杂交互、工程质量和 AI 应用前端。我的代表项目是 VueChest 应用中心，我负责过【填写真实职责】。其中比较有代表性的三个点是流式 AI 对话、第三方应用沙箱和运行时知识内容发布。以流式对话为例，我封装了增量协议解析，并通过取消和会话身份校验解决切换会话后的异步竞态。接下来我希望在重视用户体验、性能与系统可靠性的团队继续深入。”

**评分点：** 定位清楚、个人贡献明确、有一个可追问亮点、不念流水账。

### 2. 下面代码输出什么？为什么？

```js
console.log(1)

setTimeout(() => console.log(2), 0)

Promise.resolve()
  .then(() => {
    console.log(3)
    setTimeout(() => console.log(4), 0)
  })
  .then(() => console.log(5))

queueMicrotask(() => console.log(6))
console.log(7)
```

**标准回答：**

> “输出是 `1 7 3 6 5 2 4`。同步先输出 1 和 7。第一个 `.then` 和 `queueMicrotask` 按入队顺序进入微任务，所以先 3 后 6；第一个 `.then` 完成时第二个 `.then` 才入队，排在 6 后面，所以输出 5。微任务清空后执行先注册的 timer 输出 2；执行 3 时才注册的 timer 后输出 4。”

### 3. Vue 3 从状态变化到 DOM 更新经历什么？

**标准回答：**

> “状态经 Proxy 或 ref setter 触发依赖集合，对应组件的渲染 effect 被调度进更新队列；同一轮同步变更会批量去重。组件重新运行编译后的渲染函数得到新 VNode，渲染器结合节点类型、key 和编译期 Patch Flag 比较并 patch DOM。DOM 更新完成后，`nextTick` 等待的回调才执行。这里 Proxy 只负责响应式入口，编译优化、调度和渲染器共同决定最终更新效率。”

### 4. 搜索框快速输入，怎样避免旧请求覆盖新结果？

**标准回答：**

> “输入先防抖，但防抖不能消除已经发出的请求。我会为每次请求创建 AbortController，在下一次查询开始时取消旧请求；同时维护递增 request ID，响应回来时只接受最新 ID，形成双保险。组件卸载时也取消。服务端如果支持 request ID 或 cursor，可以继续关联日志和去重。”

### 5. 为什么 `reactive` 表单不能直接整体赋值重置？

**标准回答：**

> “`reactive` 返回的是 Proxy，模板和 effect 追踪的是这个代理上的读取。给局部变量重新赋普通对象只是让变量指向新对象，已有依赖仍连着旧 Proxy。可以用 `Object.assign(form, initial)` 修改原代理属性，或用 `ref` 包对象后替换 `.value`。初始对象还要重新克隆，避免它本身被后续修改。”

### 6. 项目首屏慢，你会如何定位而不是直接列优化方案？

**标准回答：**

> “先固定设备和网络复现，用真实 RUM 确认影响范围；再看 TTFB、Network waterfall、LCP 元素、Coverage、bundle analyzer 和 Performance 主线程。服务端慢处理缓存/CDN/SSR，关键资源慢处理压缩、图片和优先级，JS 过大处理拆包和依赖，主线程长任务再做计算拆分。每次只改一类，比较 LCP、INP、错误率和业务指标，防止误优化。”

### 7. 你会怎样设计一个可复用的 Select 组件？

**标准回答：**

> “先定义受控契约：`modelValue`、options、disabled、loading、placeholder、清空和 change 事件，值类型用泛型或稳定 key 约束。展示可通过 slots 扩展，不让组件依赖业务 store。交互上处理键盘导航、焦点、ARIA、点击外部关闭和 Teleport 定位；大数据再做搜索、防抖或虚拟列表。样式使用设计 token，错误和空态统一。测试覆盖鼠标、键盘、受控更新和边界值，并优先复用项目已有 CustomSelect。”

### 8. 请解释当前 VueChest 第三方应用沙箱的安全边界。

**标准回答：**

> “外部 bundle 在无 `allow-same-origin` 的 sandbox iframe 中运行，不能直接访问主站 DOM 和存储。宿主只接受当前 iframe window 发来的消息，并通过能力白名单桥代理存储和网络；存储按 app ID 命名空间，网络默认拒绝，授权来源是服务端审核元数据。边界不包括桥本身的漏洞，因此仍需消息 schema、channel token、限流、URL 重定向和响应大小限制、CSP 与审计。”

### 9. 手写一个并发上限为 n 的任务执行器。

```ts
async function runWithLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('limit must be a positive integer')
  }

  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
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

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()))
  return results
}
```

**讲解标准：** 固定数量 worker 共享递增索引，因此同时最多运行 n 个任务；结果按原任务顺序写入，并保留每个任务的成功或失败。继续追问时应说明取消、动态任务、fail-fast 和公平性要另加语义。

### 10. 讲一个项目不足，以及你准备怎么验证改进。

**标准回答：**

> “当前 AI 对话会发送完整历史，长对话下输入 token、延迟和噪声会持续增加。我的改进不是直接截断，而是先记录不同轮数下的 token、首 token 延迟和回答质量；把已确认约束和会话摘要结构化保留，较老原文按需召回。用一组需要引用早期细节的问题做回归，比较完整历史、滑动窗口和摘要方案的质量—延迟—成本，再决定策略。”

---

## 模拟二：Agent 应用工程（55 分钟）

### 1. 为什么这个需求要用 Agent，而不是 Workflow？

**标准回答：**

> “我先看步骤能否穷举。如果流程稳定、分支明确，我会用 Workflow。只有任务目标清楚但行动路径依赖中间结果，例如要跨多个系统调查并动态选择下一步，Agent 才提供明显价值。即便使用 Agent，我也会让代码控制权限、预算和终止，把高风险写操作放进确定性节点。选型要用同一任务集比较质量、P95、成本和失败面。”

### 2. 画出一次工具调用的完整链路。

**标准回答：**

> “宿主把候选工具及 schema 给模型；模型返回 tool name、arguments 和 call ID；宿主做解析、schema、业务、用户权限和风险校验；通过带超时和幂等的执行器调用真实服务；结果按大小与敏感性处理后，以同一 call ID 回填；模型继续决策或结束；外部验收器检查目标，整条链记录 trace。模型从不直接执行函数。”

### 3. 有 200 个工具，如何保证选对并控制 token？

**标准回答：**

> “先按用户权限和工作流状态过滤，再通过命名空间和工具检索取 top-k 候选，核心高频工具常驻，长尾按需展开 schema。评测路由 top-k recall、最终选择准确率和误调用风险。描述重叠就重构边界。工具列表保持稳定排序以利缓存，不能只把 200 个 schema 全塞给模型。”

### 4. RAG 的答案错了，怎么判断是哪一层？

**标准回答：**

> “先看正确证据是否在库，再依次查解析、切分、召回、过滤、融合、重排和最终上下文；正确证据进入上下文后仍答错才定位生成和引用。Trace 要保存每层候选和版本。评测也分检索 Recall@k/MRR、生成 faithfulness/correctness、系统延迟成本，不能只给最终答案打一个总分。”

### 5. Function Calling 和 MCP 的关系是什么？

**标准回答：**

> “Function Calling 是模型输出结构化调用意图的一类能力；MCP 是 Host/Client/Server 之间发现与交换工具、资源、提示等能力的开放协议。MCP Server 的工具可以被宿主适配给不同模型的 Function Calling。MCP 提升互操作性，但鉴权、工具正确性、幂等和注入防护仍由应用负责。”

### 6. Agent 怎样中断恢复且不重复执行写操作？

**标准回答：**

> “关键节点保存 versioned checkpoint 和 append-only 事件，工具调用有幂等键与状态。恢复时读取最后 checkpoint，对 succeeded 直接复用，对 failed 按策略重试，对 unknown 先查询外部状态。写操作分 preview/commit，提交结果与幂等键绑定。Prompt、模型和工具 schema 版本也保存在任务上。”

### 7. 如何防间接 Prompt Injection？

**标准回答：**

> “网页、邮件、RAG 文档和工具输出都视为不可信数据，不能覆盖系统策略。模型可被诱导这一点无法只靠 Prompt 根治，所以宿主做最小权限、网络和文件白名单、短期凭据、敏感动作策略校验与人工确认；内容标记来源，输出再校验，全链审计，并用注入样本持续回归。”

### 8. 怎么建立 Agent 评测？

**标准回答：**

> “每条任务定义初始环境、允许工具、成功条件、禁止动作和预算。优先用测试、schema 和环境状态做确定性 grader；语义质量再用经过人工金标校准的 Judge。结果层看成功率，轨迹层看工具选择和无效步骤，系统层看延迟、成本和人工介入。非确定性任务多次运行报告分布，线上失败脱敏回流。”

### 9. 线上 Agent 陷入循环，怎么止损和修复？

**标准回答：**

> “运行时由外部控制器的最大步数、总预算、deadline 和重复动作检测立即终止，必要时熔断该版本并降级。排查 trace 看是工具返回不明确、状态没有更新、终止条件缺失还是 Prompt/模型变更。修复可能包括结构化 observation、显式 progress invariant、重复调用指纹和外部验收器，最后把失败轨迹加入回归集。”

### 10. 设计一个面试学习 Agent。

**标准回答：**

> “我会让题库检索、回答保存、评分和计划更新成为四个边界明确的工具。状态图是选题、作答、规则/模型评分、反馈、更新计划和结束；计划写入前给用户 preview。评分 rubric 按正确性、完整性、表达和追问拆分，30 条人工样本校准 Judge。最大步数、取消、checkpoint、幂等、trace 都由宿主控制。成功指标是薄弱题复答通过率和计划完成率，而不是对话轮数。”

---

## 模拟三：项目拷打快问快答（20 分钟）

### 1. 你说“做了性能优化”，基线在哪里？

**标准回答：**

> “我只报告实际保存的构建和 RUM 数据。基线要包含版本、设备、网络、样本量和 P50/P75/P95；如果当前没有，我会明确说尚未建立，先补观测再谈提升，不编百分比。”

### 2. 为什么不是直接用成熟框架？

**标准回答：**

> “我会比较需求复杂度、团队认知、可观测、锁定成本和定制边界。成熟框架能加快验证，但关键状态、权限、幂等和评测仍应掌握在自己的控制层。没有特殊需求时我会用框架，不为自研而自研。”

### 3. 最严重的一次技术决策错误是什么？

**标准回答模板：**

> “我当时基于【假设】选择【方案】，但漏掉【约束】，导致【可观察影响】。我通过【证据】定位后，先【止损】，再改为【新方案】并补【测试/监控/评审机制】。最大的复盘不是某行代码，而是以后在决策前必须验证【通用原则】。”

### 4. 这个项目如果流量扩大 100 倍，哪里先出问题？

**标准回答：**

> “我不会假设一定是哪层。先按请求、并发连接、数据量和第三方配额建容量模型。流式 AI 常先受上游限流、长连接数、内存缓冲和数据库写入影响；前端知识库可能受整包 JSON 体积影响。对应做限流排队、连接中止、流式背压、批量写、CDN 分片和压测，并定义降级顺序。”

### 5. 如果让你再做一次，第一件事会改什么？

**标准回答：**

> “我会更早建立可观测基线和契约测试。项目已经有较清晰的功能边界，但没有指标时，很难证明优化收益；没有协议测试时，流式事件和沙箱消息的边界错误容易静默发生。我会先为关键链路定义 SLO、trace 字段和失败样例，再继续加功能。”

---

## 面试结束复盘表

| 题目             | 得分 0～3 | 卡住原因     | 正确的一句话结论                                    | 下次复习日 |
| ---------------- | --------: | ------------ | --------------------------------------------------- | ---------- |
| 示例：Vue 响应式 |         1 | 只说了 Proxy | Proxy 拦截 + effect 依赖 + scheduler + render patch | 周三       |
|                  |           |              |                                                     |            |
|                  |           |              |                                                     |            |
|                  |           |              |                                                     |            |

复盘时只记录导致失分的核心缺口，不全文抄答案。下一轮模拟必须先重问上轮所有 0～1 分题。

---

## 参考来源

- [牛客：前端高频题汇总](https://www.nowcoder.com/discuss/889546972099584000)
- [牛客：Agent 开发面经总结](https://www.nowcoder.com/discuss/877151327091027968)
- [Vue 官方：Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)
- [Anthropic：Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Anthropic：Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
