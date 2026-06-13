export interface AppModule {
  id: number
  name: string
  icon: string
  route: string
  description: string
  devOnly?: boolean // 仅开发环境显示
}

export const APP_MODULES: AppModule[] = [
  {
    id: 13,
    name: '贪吃蛇·本地对战',
    icon: '🐍',
    route: '/snake/local',
    description: '本地双人对战贪吃蛇，WASD vs 方向键！',
    devOnly: true, // 仅开发环境显示
  },
  {
    id: 12,
    name: '面试题库',
    icon: '📚',
    route: '/interview',
    description: '前端面试高频题目，支持随机抽题和分类练习',
  },
  {
    id: 11,
    name: '3D赛车',
    icon: '🏎️',
    route: '/racing',
    description: '刺激的3D赛车竞速，支持移动端触控和技能系统',
  },
  {
    id: 9,
    name: '股票查询',
    icon: '📈',
    route: '/stock',
    description: '查询A股历史行情，分析开盘收盘价',
  },
  {
    id: 10,
    name: '音乐播放',
    icon: '🎵',
    route: '/music',
    description: '搜索歌曲，在线播放，歌词同步显示',
  },
  {
    id: 8,
    name: 'AI 对话',
    icon: '🤖',
    route: '/ai-chat',
    description: '基于大模型的智能对话助手',
  },
  {
    id: 1,
    name: 'API管理器',
    icon: '🔗',
    route: '/api-manager',
    description: '管理免费API，配置参数，在线执行',
  },
  {
    id: 2,
    name: '书签管理',
    icon: '🔖',
    route: '/bookmark',
    description: '收藏和管理常用网站链接',
  },
  {
    id: 3,
    name: '待办事项',
    icon: '📝',
    route: '/todo',
    description: '管理您的日常任务和待办事项',
  },
  {
    id: 4,
    name: '笔记本',
    icon: '📓',
    route: '/notes',
    description: '记录和保存您的想法和笔记',
  },
  {
    id: 5,
    name: '番茄钟',
    icon: '🍅',
    route: '/pomodoro',
    description: '专注工作计时，提升效率',
  },
  {
    id: 6,
    name: '记账本',
    icon: '💰',
    route: '/expense',
    description: '记录收入支出，管理个人财务',
  },
  {
    id: 7,
    name: '特殊日子',
    icon: '🎉',
    route: '/special-days',
    description: '记录生日、纪念日等重要日子',
  },
]

export const DEFAULT_TODOS = [
  {
    id: 1,
    text: '完成Vue项目',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    text: '学习TypeScript',
    completed: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    text: '购买生活用品',
    completed: false,
    createdAt: new Date().toISOString(),
  },
]

export const DEFAULT_NOTES = [
  {
    id: 1,
    title: '欢迎使用笔记本',
    content:
      '这是一个简单的笔记应用，您可以在这里记录您的想法和灵感。\n\n支持 **Markdown** 语法，可以轻松创建格式丰富的笔记！',
    isMarkdown: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'Markdown 示例',
    content:
      '# Markdown 功能演示\n\n## 基础语法\n\n- **粗体文本**\n- *斜体文本*\n- ~~删除线~~\n- `行内代码`\n\n## 代码块\n\n```javascript\nfunction hello() {\n  console.log("Hello, Markdown!")\n}\n```\n\n## 列表\n\n1. 第一项\n2. 第二项\n3. 第三项\n\n> 这是一段引用文本\n\n---\n\n[链接示例](https://vuejs.org)',
    isMarkdown: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

export const DEFAULT_BOOKMARKS = [
  {
    id: 1,
    title: 'Vue.js 官方文档',
    url: 'https://vuejs.org',
    category: '开发',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'TypeScript 文档',
    url: 'https://www.typescriptlang.org',
    category: '开发',
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    title: 'GitHub',
    url: 'https://github.com',
    category: '工具',
    createdAt: new Date().toISOString(),
  },
]

export const DEFAULT_POMODORO_SETTINGS = {
  work: 25,
  break: 5,
  longBreak: 15,
  sound: 'chime' as const,
}

export const EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '住房', '医疗', '教育', '其他']
export const INCOME_CATEGORIES = ['工资', '奖金', '兼职', '理财', '红包', '其他']

export const DEFAULT_APIS = [
  {
    id: 1,
    name: '随机笑话',
    url: 'https://official-joke-api.appspot.com/random_joke',
    method: 'GET' as const,
    category: '娱乐',
    description: '获取一个随机的英文笑话',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: '随机猫咪图片',
    url: 'https://api.thecatapi.com/v1/images/search',
    method: 'GET' as const,
    category: '图片',
    description: '获取一张随机的猫咪图片',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: '随机狗狗图片',
    url: 'https://dog.ceo/api/breeds/image/random',
    method: 'GET' as const,
    category: '图片',
    description: '获取一张随机的狗狗图片',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 4,
    name: '获取用户信息',
    url: 'https://jsonplaceholder.typicode.com/users/1',
    method: 'GET' as const,
    category: '测试',
    description: '获取JSONPlaceholder的用户信息（测试用）',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 5,
    name: '随机名言',
    url: 'https://api.quotable.io/random',
    method: 'GET' as const,
    category: '娱乐',
    description: '获取一条随机的名人名言',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 6,
    name: 'GitHub用户信息',
    url: 'https://api.github.com/users/{username}',
    method: 'GET' as const,
    category: '开发',
    description: '通过用户名获取GitHub用户信息',
    params: [
      {
        name: 'username',
        type: 'string' as const,
        defaultValue: 'octocat',
        required: true,
        description: 'GitHub用户名',
      },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 7,
    name: '天气查询',
    url: 'https://wttr.in/{city}?format=j1',
    method: 'GET' as const,
    category: '工具',
    description: '查询指定城市的天气信息',
    params: [
      {
        name: 'city',
        type: 'string' as const,
        defaultValue: 'Beijing',
        required: true,
        description: '城市名称（英文）',
      },
    ],
    createdAt: new Date().toISOString(),
  },
]

export const DEFAULT_APP_ORDER = APP_MODULES.map((app) => app.id)

export const AI_CHAT_CONFIG = {
  defaultApiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
  availableModels: [
    { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2' },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
  ],
  defaultModel: 'deepseek-ai/DeepSeek-V3.2',
}
