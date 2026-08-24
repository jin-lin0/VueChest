export interface AppModule {
  id: number
  name: string
  icon: string
  route: string
  description: string
  devOnly?: boolean
  defaultHidden?: boolean
}

// 这里只保留纯元数据。不要从各应用的 index.ts 导入定义，否则首页入口会把
// Three.js、图表、编辑器和游戏引擎全部拉进首屏依赖图。
export const APP_MODULES: AppModule[] = [
  { id: 18, name: '游戏中心', icon: '🎮', route: '/games', description: '集中查看游戏、挑战、成绩与本机成就' },
  { id: 17, name: '星渊幸存者', icon: '🚀', route: '/neon-survivor', description: '六分钟霓虹肉鸽射击：双摇杆战斗、随机强化、精英敌潮与三阶段 Boss', defaultHidden: true },
  { id: 16, name: '音游', icon: '🎹', route: '/rhythm', description: '自动分析音乐节拍生成谱面，4 键下落式音游', defaultHidden: true },
  { id: 14, name: 'B站字幕', icon: '📝', route: '/bilibili-subtitle', description: '粘贴 B站视频链接，一键提取字幕文本用于分析' },
  { id: 13, name: 'PK贪吃蛇', icon: '🐍', route: '/snake', description: '贪吃蛇双人对战 & 人机对战，在方块中一决高下', defaultHidden: true },
  { id: 15, name: '开发工具箱', icon: '🧰', route: '/dev-toolbox', description: 'Base64 编解码、时间戳转换、文本/JSON 转换等常用开发小工具集合' },
  { id: 12, name: '面试题库', icon: '📚', route: '/interview', description: '专项训练、掌握度追踪与随机模拟，建立可复盘的面试学习路径' },
  { id: 11, name: '3D赛车', icon: '🏎️', route: '/racing', description: '3D赛车竞速：AI对手、漂移氮气、道具技能，支持本地双人分屏', defaultHidden: true },
  { id: 9, name: '股票查询', icon: '📈', route: '/stock', description: '查询A股历史行情，分析开盘收盘价' },
  { id: 10, name: '音乐播放', icon: '🎵', route: '/music', description: '搜索歌曲，在线播放，歌词同步显示' },
  { id: 8, name: 'AI 对话', icon: '🤖', route: '/ai-chat', description: '基于大模型的智能对话助手' },
  { id: 1, name: 'API 工作台', icon: '🔗', route: '/api-manager', description: '发现实用 API，配置请求并在线调试响应' },
]
