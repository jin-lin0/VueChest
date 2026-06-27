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
    name: 'PK贪吃蛇',
    icon: '🐍',
    route: '/snake',
    description: '贪吃蛇双人对战 & 人机对战，在方块中一决高下',
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
]

export const DEFAULT_APP_ORDER = APP_MODULES.map((app) => app.id)

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

export const AI_CHAT_CONFIG = {
  defaultApiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
  availableModels: [
    { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2' },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
  ],
  defaultModel: 'deepseek-ai/DeepSeek-V3.2',
}
