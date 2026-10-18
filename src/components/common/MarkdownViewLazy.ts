import { defineAsyncComponent } from 'vue'

/**
 * 按需加载的 markdown 渲染视图（`MarkdownView.vue` 的懒加载版）。
 *
 * `MarkdownView.vue` 静态依赖 `@/lib/markdown`，那条链上挂着 marked + DOMPurify +
 * highlight.js 及其 plaintext 语言包，实测合计 **47.7 KB gzip**
 * （`_markdown-*.js` 37.0 + `_plaintext-*.js` 10.7，2026-10-15 量于 `dist`）；
 * 连同 MarkdownView 自身的 chunk，整组按需 chunk 在体积闸门里报 **48.6 KB gzip**。
 *
 * 对「首帧就要显示正文」的页面（文档中心 `/docs`、AI 聊天、后台题目管理）
 * 这笔钱省不掉，必须静态引入；但对「点了才显示」的页面——
 * 面试题库的「查看参考答案」、B站字幕分析的结果区、股票知识中心的详情面板——
 * 首帧渲染时一个字都还没有，静态引入等于让用户先下一份 47.7 KB 的空转依赖。
 * 改成懒加载后这三条路由的首屏分别少了 47.7 KB gzip。
 *
 * 注意两点：
 *  - 动态引入只是「换顺序不是减总量」：文件本身没变小，chunk 会在真正要渲染时被取。
 *    因此 `scripts/check-route-budget.mjs` 里对应条目必须把这块记进 `deferredDynamic`
 *    如实报出来，不能把「挪走的」当成「删掉的」。
 *  - 首次展开时会有一次 chunk 请求（此后同会话内命中缓存）。这是刻意的取舍：
 *    这些内容全部出现在用户主动点击之后，让首帧为它付费更不划算。
 */
export default defineAsyncComponent(() => import('./MarkdownView.vue'))
