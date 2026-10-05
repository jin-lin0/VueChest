import App from './App.vue'

export default {
  component: App,
  route: '/m/ai-notes',
  meta: {
    name: 'AI 速记',
    icon: '📝',
    description: '本地优先、可跨设备同步的速记本，支持 AI 摘要与润色',
    version: '1.0.0',
    // 声明需要的能力：云端同步 / AI / 通知 / 剪贴板
    permissions: ['cloud', 'ai', 'notify', 'clipboard'],
  },
}
