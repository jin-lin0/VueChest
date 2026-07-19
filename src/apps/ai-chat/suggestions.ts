export interface Suggestion {
  text: string
  message: string
}

export const suggestionPool: Suggestion[] = [
  {
    text: 'AI 前端项目架构',
    message: '设计一个AI聊天应用的前端架构，包含消息流、状态管理和会话管理',
  },
  { text: 'Vue3 AI 聊天界面', message: '使用Vue3 + TypeScript实现一个现代化AI聊天界面' },
  { text: 'AI 流式输出实现', message: '前端如何实现AI回答的流式输出效果' },
  { text: 'Markdown 渲染方案', message: '前端如何优雅渲染AI返回的Markdown内容' },
  { text: '代码高亮组件', message: '实现一个支持多语言的代码高亮组件，适用于AI聊天场景' },
  { text: '聊天记录持久化', message: 'AI聊天应用如何实现本地聊天记录持久化' },
  { text: 'SSE 与 WebSocket 对比', message: 'AI聊天为什么常用SSE而不是WebSocket，详细对比一下' },
  { text: 'AI 输入框交互设计', message: '设计一个类似ChatGPT的输入框交互体验' },
  { text: 'OpenAI 接口封装', message: '使用TypeScript封装一个优雅的OpenAI请求SDK' },
  { text: 'AI 打字机效果', message: '前端如何实现AI逐字输出的打字机动画效果' },
  { text: 'AI 聊天性能优化', message: 'AI聊天页面有哪些性能优化技巧' },
  { text: '虚拟列表聊天优化', message: '聊天消息很多时，如何使用虚拟列表优化渲染性能' },
  { text: 'AI 多轮对话实现', message: '前端如何管理AI多轮上下文对话' },
  { text: 'Prompt 管理系统', message: '设计一个前端Prompt管理与收藏功能' },
  { text: 'AI 聊天主题切换', message: '实现一个支持暗黑模式和主题切换的AI聊天UI' },
  { text: '消息撤回与重试', message: 'AI聊天中如何实现消息重试、撤回与重新生成功能' },
  { text: 'Vue3 组合式封装', message: '使用Composition API封装一个AI聊天hooks' },
  { text: 'AI 聊天动画设计', message: '推荐一些适合AI聊天界面的前端动画效果' },
  { text: '大模型 Token 计算', message: '前端如何估算和统计AI对话Token消耗' },
  { text: 'AI 文件上传解析', message: '实现一个支持拖拽上传和AI文件解析的前端方案' },
  { text: 'AI 图片生成界面', message: '设计一个AI绘图应用的前端交互界面' },
  { text: 'RAG 前端展示方案', message: 'AI知识库问答中，前端如何展示引用来源和上下文' },
  { text: 'AI 聊天移动端适配', message: 'AI聊天页面在移动端有哪些适配细节' },
  { text: 'Tailwind 聊天UI', message: '使用Tailwind CSS实现一个高级感AI聊天界面' },
  { text: 'AI Agent 前端设计', message: 'AI Agent产品的前端交互应该如何设计' },
  { text: '聊天消息懒加载', message: '实现聊天记录分页加载与无限滚动' },
  { text: 'AI 应用权限系统', message: 'AI SaaS系统如何设计前端权限管理' },
  { text: '前端 AI SDK 对比', message: '对比OpenAI SDK、Vercel AI SDK和LangChain.js的使用场景' },
  { text: 'AI 对话分享功能', message: '实现一个类似ChatGPT的对话分享页面' },
  { text: 'AI 聊天错误处理', message: 'AI请求失败、超时、限流时前端如何处理用户体验' },
]
