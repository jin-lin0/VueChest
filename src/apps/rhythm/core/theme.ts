/**
 * 音游视觉设计令牌。
 *
 * 单独抽出来的原因：Canvas 渲染（renderer.ts）与 DOM 样式（App.vue / PlayView.vue）
 * 必须用同一套色值，否则轨道里的音符和轨道外的键位胶囊会对不上。
 * Canvas 读不到 CSS 变量，所以真相必须放在 TS 里，再由 CSS 侧镜像一份。
 *
 * 配色方向：赛博霓虹。四条轨道用「洋红 → 青 → 青绿 → 洋红」的镜像排布，
 * 而不是四个各不相同的色相——镜像让左右手的对应关系一眼可见，
 * 同时避免四色并置显得杂乱。
 */

/** 轨道主色，下标 = 轨道号 */
export const LANE_COLORS = ['#ff2e63', '#3ddad7', '#00e5ff', '#ff2e63'] as const

/** 轨道辅色（渐变的另一端），让音符本身有体积感而非纯色块 */
export const LANE_COLORS_ALT = ['#ff7b54', '#7af5c8', '#5fb8ff', '#ff5fa8'] as const

/** 判定等级配色 */
export const JUDGE_COLORS = {
  perfect: '#ffd166',
  great: '#3ddad7',
  good: '#5fb8ff',
  miss: '#ff2e63',
} as const

export const JUDGE_TEXT = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  miss: 'MISS',
} as const

/** 舞台底色与结构线 */
export const STAGE = {
  /** 跑道内部底色（比页面背景略亮，形成"舞台"感） */
  laneFill: 'rgba(16, 12, 32, 0.55)',
  /** 轨道之间的分隔线 */
  laneDivider: 'rgba(255, 255, 255, 0.055)',
  /** 跑道左右外框——设计稿里这两条竖线是发光的洋红 */
  railColor: '#ff2e63',
  /** 判定线 */
  judgeLine: '#ffffff',
} as const

/**
 * 把 #rrggbb 转成 rgba()。
 *
 * Canvas 不支持 CSS 的 color-mix()，而每种状态（正常/断线/淡出）都需要
 * 不同透明度。硬编码一套 rgba 字符串会让改色变成噩梦，所以运行时转换。
 */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
