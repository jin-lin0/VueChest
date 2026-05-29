export const APP_CONFIG = {
  name: 'VueChest',
  fullName: 'VueChest - 轻量实用工具集',
  description: '一站式个人效率工具箱，包含待办事项、笔记、番茄钟、记账本、AI对话等实用工具',
  version: '1.0.0',
  theme: {
    primary: '#667eea',
    secondary: '#764ba2',
    background: '#f5f7fa',
    surface: '#ffffff',
    text: '#333333',
    textSecondary: '#666666',
  },
  pwa: {
    shortName: 'VueChest',
    themeColor: '#667eea',
    backgroundColor: '#f5f7fa',
    display: 'standalone',
    orientation: 'portrait-primary',
    lang: 'zh-CN',
    categories: ['productivity', 'utilities'],
  },
} as const
