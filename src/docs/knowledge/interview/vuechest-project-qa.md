---
group: 项目与模拟
order: 1
---

# VueChest 项目深挖标准问答

本文把当前仓库中已经存在、可以被代码证明的设计整理成项目话术。回答时只陈述自己真实参与的部分；所有性能数字必须实际测量后再替换，不能把模板中的目标当成结果。

---

## 一、项目总述

### Q1：请介绍一下 VueChest 项目。

**面试者标准回答：**

> “VueChest 是一个基于 Vue 3、TypeScript 和 Vite 的应用中心，前端包含 AI 对话、面试题库、知识库、开发工具箱、应用市场、股票分析和小游戏等模块，后端使用 Node.js / Express。
>
> 我把它当作一个长期演进的平台，而不是单页 Demo。前端路由按应用懒加载，通用 UI、composable、有副作用的服务和纯工具分层；应用市场里的第三方代码不进入主页面执行，而是放进 iframe 沙箱，通过白名单能力桥与宿主通信；AI 对话使用 POST 流式响应，支持取消和会话切换竞态保护；知识内容则能从对象存储运行时加载，更新时不需要重新构建前端。
>
> 如果只挑三个值得展开的技术点，我会讲流式对话的一致性、第三方应用沙箱和内容独立发布链路。”

**面试官可能追问：**

- 为什么做成应用中心，而不是多个独立站点？
- 模块之间怎样隔离，公共能力怎样复用？
- 哪个部分是你本人设计和实现的？
- 目前真实用户、数据量、错误率和性能基线是什么？

### Q2：项目的前端架构怎么分层？

**面试者标准回答：**

> “我按变化原因分层：`apps` 放相对独立的业务应用，`views` 放页面级入口，`components/common` 和 `components/business` 区分通用与业务组件，`composables` 复用 Vue 状态逻辑，`stores` 管跨页面客户端状态，`lib` 放数据库、网络和 Markdown 等有副作用服务，`utils` 只放纯函数。
>
> 这样做的核心不是目录好看，而是让依赖方向更清楚。例如组件不应该到处直接拼 API，业务状态也不应该塞进通用组件。路由组件采用动态 import，把不相关应用拆成独立 chunk。后续如果应用继续增长，我会为每个 app 加明确的 public API 和边界检查，并用 bundle analyzer 观察公共 chunk 是否膨胀。”

### Q3：为什么选择 Vue 3、TypeScript、Vite 和 Pinia？

**面试者标准回答：**

> “Vue 3 的 Composition API 适合把流式请求、主题和复杂交互拆成可复用逻辑，响应式和模板在多应用 UI 中开发效率高；TypeScript 约束组件、消息协议和接口模型，降低重构时的隐式错误；Vite 对 Vue 3 集成成熟，开发期按需 ESM 和 HMR 适合模块较多的项目；Pinia 用于跨页面的客户端共享状态，API 简洁且类型推导好。
>
> 这些不是无条件最优。例如后端返回值仍需运行时验证，TypeScript 不能替代它；服务端缓存数据不应全部复制到 Pinia；如果项目需要更强 SEO 和首屏直出，我会评估 Nuxt 或预渲染，而不是只靠当前 CSR。”

---

## 二、AI 流式对话

### Q4：AI 对话的流式链路是怎样的？

**面试者标准回答：**

> “前端通过 POST 把会话、模型和消息发给自己的服务端，服务端再中转上游模型，密钥不下发到浏览器。前端读取 `response.body` 的 `ReadableStream`，用 `TextDecoder` 增量解码；因为网络 chunk 不等于一条业务消息，所以我维护 buffer，按换行拆出 `data:` 事件，解析增量内容，通过 async generator 向页面 yield。
>
> 页面侧累加当前 assistant 内容。滚动不是每个 token 都直接操作 DOM，而是用 `requestAnimationFrame` 合并；正常结束、异常和取消都会释放 reader。这个设计把协议消费封装在 composable 中，页面只处理消息状态和交互。”

**可指向的代码证据：**

- `src/apps/ai-chat/composables/useChatStream.ts`
- `src/apps/ai-chat/App.vue`
- 后端 `VueChestServer/routes/aiChat.js`

### Q5：切换会话时怎样避免旧流写入新会话？

**面试者标准回答：**

> “这是一个典型异步竞态。发起新请求时我先中止旧的 `AbortController`，切换会话或组件卸载也会 abort。仅依赖取消仍不够，因为取消信号与已到达的回调可能竞争，所以每条流还记录自己的 session ID；写入增量前再次确认当前激活会话仍是该 ID，不一致就跳过。
>
> 我把 AbortError 视为用户主动行为，不展示成系统错误；其他错误会移除空占位消息并给出可见反馈。这个思路可以推广到搜索联想、分页请求和任何‘旧响应覆盖新状态’的场景：取消资源，加请求身份校验双保险。”

### Q6：流式解析有哪些边界情况？

**面试者标准回答：**

> “首先，UTF-8 字符可能跨 chunk，所以 `TextDecoder` 要用流式模式；其次，一个 chunk 可能含半条、多条事件，必须 buffer；还要识别结束事件、空行、HTTP 非 2xx、响应体为空和 JSON 解析失败。
>
> 如果继续增强，我会把事件协议写成可测试的独立 parser，处理 CRLF、多行 data、末尾无换行的残留 buffer，并区分可忽略心跳和格式错误；为每个增量增加序号或 cursor，服务端支持时可做断线续传。当前代码对异常 JSON 选择忽略，生产环境还应记录受采样的解析错误，避免静默丢内容。”

### Q7：Markdown 流式渲染怎样兼顾性能和安全？

**面试者标准回答：**

> “安全上，模型输出是不可信内容。项目把 Markdown 渲染集中到统一管线，并用 DOMPurify 清洗最终 HTML，避免业务组件各自 `v-html`。链接协议、图片来源和代码高亮也要限制，不能认为模型生成内容天然安全。
>
> 性能上，不能每来一个 token 就全量解析全部 Markdown 和强制滚动。我会按帧或按较大文本块更新，流式阶段可使用轻量展示，结束后再做完整解析；同时尊重用户手动上滚，只有用户仍在底部时自动跟随。长对话再配虚拟列表或消息折叠。”

---

## 三、第三方应用沙箱

### Q8：为什么第三方应用不能直接插入主页面执行？

**面试者标准回答：**

> “应用市场的 bundle 是不可信代码。如果直接 `eval` 或动态插入主页面，它就拥有和宿主相同的 DOM、Cookie、存储、路由和网络权限，XSS 会升级成整个平台接管。
>
> 当前方案把 bundle 放进带 `sandbox` 的独立 iframe，只开放脚本等必要能力，不开启 `allow-same-origin`，让它处于 opaque origin。第三方代码不能直接访问主站 DOM、IndexedDB 和同源凭据；它只能通过 `postMessage` 请求宿主暴露的少量能力。安全边界由浏览器隔离和宿主白名单共同承担。”

### Q9：沙箱能力桥是怎样设计的？

**面试者标准回答：**

> “父页面只接收来源确实是当前 iframe `contentWindow` 的消息，消息带请求 ID，宿主处理后回传相同 ID，让沙箱结算 Promise。存储 key 默认加 `sandbox:{appId}:` 前缀，避免应用互相读取；网络默认拒绝，只有服务端审核元数据声明的 host 白名单才放行，并设置请求超时。
>
> 能力采用 allowlist，不识别的能力直接拒绝。主题和存储快照在 bootstrap 时注入，避免给沙箱直接访问主站存储。这里最重要的原则是：bundle 自己不能给自己授权，权限真源必须在宿主或服务端。”

### Q10：`postMessage('*')` 安全吗？当前方案还可以怎样加固？

**面试者标准回答：**

> “不能脱离上下文判断。由于 sandbox iframe 没有 `allow-same-origin`，它是 opaque origin，父页面向其发送时常需要使用 `*`；父页面接收侧必须严格校验 `event.source`，沙箱回父页面则应使用 bootstrap 下发的精确父站 origin。
>
> 进一步加固我会给 bootstrap 建立随机 channel token，所有消息同时校验 source、channel 和 schema；限制消息大小、请求频率和并发；网络代理禁止私网、重定向绕过和危险方法，响应头与 body 也做限额；高风险共享存储键单独审批。还应配 CSP、应用签名或内容哈希、安装审核和版本撤回。”

**易错点：** iframe sandbox 只是隔离基础，不等于所有桥接能力自动安全；真正风险会转移到宿主暴露的 capability 上。

### Q11：网络白名单要防哪些绕过？

**面试者标准回答：**

> “白名单比较应基于规范化后的 URL 和 `hostname`，明确协议、端口、子域规则，不能用简单字符串包含。要拒绝 `file:`、`data:` 等非预期协议和本机、内网、云元数据地址；还要处理 DNS rebinding、重定向到非白名单目标、超大响应和慢响应。
>
> 当前浏览器侧代理已经有默认拒绝、host 规则和超时；如果它要承载更高风险能力，我会把网络代理放到服务端统一做出站策略和审计，因为浏览器环境无法覆盖所有 SSRF 风险与企业网络控制。”

---

## 四、知识库和文档中心

### Q12：知识库为什么运行时从对象存储加载？

**面试者标准回答：**

> “股票知识库内容更新频率和前端代码发布周期不同。如果把全部数据打进 bundle，每次内容变化都要重新构建部署，包体也会持续增长。因此项目把原始数据聚合成 index、atoms 和 graph 三类 JSON，发布到对象存储；前端运行时先取轻量 index，再用其中的生成版本并发加载数据和图谱。
>
> 这样内容更新不依赖前端发版，CDN 也能缓存大文件。代价是首开多一次网络链路，所以需要 loading、错误重试、本地缓存和兼容旧版本的 schema。当前版本查询串用于内容更新后绕过旧缓存，后续可以改成内容哈希和原子 alias 切换。”

### Q13：如何避免一次不完整发布覆盖线上知识库？

**面试者标准回答：**

> “发布脚本在聚合前做结构校验，检查条目的必填字段、章节、分类、可信度和引用；发布前还比较本地 raw 是否覆盖远端全量，避免只拉了部分数据就把线上覆盖成子集。生成产物完成后再发布，前端以 index 的版本读取同一批数据。
>
> 如果提升到生产级，我会使用 staging 前缀上传整套不可变产物，完成 checksum、schema 和抽样查询后，再原子更新 current manifest；保留前一版本快速回滚。任何 `--force` 跳过保护都应进入审计，并限制在受控 CI 环境。”

### Q14：文档为什么可以新增 Markdown 后自动注册？

**面试者标准回答：**

> “知识文档通过 Vite 的 `import.meta.glob` 在构建时扫描 Markdown，读取 frontmatter 的 category、group 和 order，再构造成导航树。新增文档只需遵守目录和元数据约定，不再手改集中注册表，降低漏注册和合并冲突。
>
> 这是约定优于配置的做法。它仍要配校验：文档 ID 唯一、frontmatter 合法、标题存在、链接有效、代码块有语言标签。因为当前是 eager 导入，文档量很大时会增加初始 bundle；届时可把目录元数据与正文拆开，正文按文档懒加载。”

---

## 五、工程质量与复盘

### Q15：项目如何保证类型和构建质量？

**面试者标准回答：**

> “生产构建会同时跑 `vue-tsc` 类型检查和 Vite 构建，日常用 ESLint、Prettier 和 Vitest。对高风险模块，我更关注行为测试而不只是覆盖率，例如沙箱存储只能删除当前 app 命名空间、流切换不能写错会话、Markdown 必须经过清洗。
>
> 下一步我会把 type-check、unit test、build 和关键 E2E 放进 CI 必过门禁，增加依赖漏洞与 bundle 预算检查。测试重点按风险排序：权限边界、数据丢失和跨会话污染优先于纯展示组件。”

### Q16：项目里最值得讲的技术难点是什么？

**面试者标准回答：**

> “我会选择第三方应用沙箱，而不是只讲页面复杂。难点在于既要执行外部 bundle，又不能让它获得宿主权限；完全隔离又会失去存储、主题和网络等必要能力。
>
> 我的方案是 iframe sandbox 建安全边界，`postMessage` 做受控 RPC，能力采用默认拒绝和白名单，存储按 app ID 隔离，网络权限由服务端元数据决定。这个方案的权衡是通信协议和调试复杂度上升，而且桥本身成为新的安全关键点，因此需要 schema、限流、审计和安全测试。这样回答能体现问题、约束、决策和后续演进，而不是只说‘用了 iframe’。”

### Q17：讲一次失败或仍未完成的地方。

**面试者标准回答模板：**

> “当前项目的不足是【必须填真实问题】。当时我先采用【原方案】，它在【条件】下出现【可观察问题】。我通过【日志、性能录制、测试或最小复现】确认根因是【根因】，随后做了【修复】并补了【防回归措施】。现在仍有【边界】没有解决；如果继续做，我会先建立【指标/实验】，再比较【方案 A/B】。”

**可选真实方向，必须核实后使用：**

- 流式协议解析错误目前缺少可观测指标。
- 文档 eager 导入在内容持续增长后可能扩大首屏 bundle。
- 沙箱网络能力还需要更完整的 URL、重定向、响应大小和速率约束。
- AI 会话发送完整历史，长对话需要摘要、截断和 token 预算。
- 前端监控、E2E 与线上 RUM 仍可进一步补全。

### Q18：如何量化这个项目，而不是只说“做了优化”？

**面试者标准回答：**

> “我会先承认当前已经测到什么、没测到什么。前端至少记录路由级 bundle 大小、LCP/INP/CLS、接口和流首 token 延迟、错误率；AI 对话看请求成功率、中止率、首 token 和完整响应 P95；沙箱看启动时间、能力调用错误率和拒绝次数；知识库看产物体积、首开时间、缓存命中和更新成功率。
>
> 我会固定设备、网络、构建版本和样本，保存优化前基线，再做单项变更和多次测量。没有真实数据时我不会在面试中虚构，只会说明已完成的机制，以及下一步怎样建立指标。”

---

## 六、把项目写进简历

以下是基于当前代码可以使用的事实型表达，需根据个人贡献删改：

- 基于 Vue 3、TypeScript 与 Vite 构建模块化应用中心，通过路由级动态导入隔离多个业务应用，并沉淀组件、composable、服务与纯函数分层约定。
- 封装 AI 对话流式消费链路，使用 `ReadableStream`、增量解码和 async generator 处理事件分片，通过 `AbortController` 与会话身份校验避免切换会话后的脏写。
- 设计第三方应用 iframe 沙箱与 `postMessage` 能力桥，采用 opaque origin、默认拒绝网络、域名白名单和按 app ID 的存储命名空间，降低外部 bundle 对宿主的攻击面。
- 将知识数据与前端发布解耦，构建校验、聚合、对象存储发布与运行时版本加载链路，使内容更新无需重新构建前端。
- 使用统一 Markdown 渲染与 DOMPurify 清洗模型/文档内容，减少分散 `v-html` 带来的 XSS 风险。

不要直接添加“提升 X%”等数字，除非已有可复现的测量报告。

---

## 参考来源

- [Vue 官方：Composables](https://vuejs.org/guide/reusability/composables.html)
- [Vue Router：Lazy Loading Routes](https://router.vuejs.org/guide/advanced/lazy-loading.html)
- [MDN：Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
- [MDN：AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN：iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)
- [MDN：Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [OWASP：HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [Vite：Glob Import](https://vite.dev/guide/features.html#glob-import)
