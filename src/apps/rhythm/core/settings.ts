// 玩家设置的本地持久化。
//
// 为什么值得单独一个模块：延迟校准（userOffset）是**每个人的设备特有值**，
// 靠打一局看平均误差才能定下来。如果刷新就丢，玩家每次都要重新校准，
// 这个设置项等于形同虚设。下落速度同理——手感偏好不会天天变。
//
// 只存"玩家偏好"，不存"当前选了哪首歌"：歌曲状态属于会话，
// 恢复一个可能已经失效的歌曲 URL 只会带来困惑。

import { DEFAULT_APPROACH_TIME } from './renderer'

const STORAGE_KEY = 'rhythm:settings'
/** 可持久化的玩家设置。全部可选——旧版本存档缺字段时走默认值 */
export interface RhythmSettings {
  /** 音符下落时间（秒） */
  noteSpeed: number
  /** 延迟校准（毫秒） */
  userOffset: number
  /** 难度预设 key，或 'custom' */
  preset: string
  /** 目标密度（音符/秒） */
  targetDensity: number
  /** 双押比例 0~1 */
  chordRatio: number
  /** 整拍强度倍率 */
  beatBias: number
  /** 是否生成长按 */
  holdEnabled: boolean
  /** 长按 RMS 分位数门槛 */
  holdRmsPercentile: number
  /** 量化网格：1=1/4 拍、2=1/8、4=1/16 */
  quantizeDivision: number
}

/**
 * 默认值。**这里是唯一真相** —— App.vue 的 ref 初值也从这里取，
 * 避免两处默认值各写一份后悄悄不一致。
 */
export const DEFAULT_SETTINGS: RhythmSettings = {
  // 下落速度的真相在 renderer.ts —— 渲染和设置必须用同一个值，
  // 否则「未指定 approachTime 时的表现」和「设置面板的默认档」会不一致
  noteSpeed: DEFAULT_APPROACH_TIME,
  // -20ms：判定窗口整体往前挪 20ms。多数设备的音频输出链路
  // 存在 baseLatency/outputLatency 之外补偿不到的残余延迟，
  // 表现为玩家总是"打晚了"，故给一个负的初始偏移
  userOffset: -20,
  preset: 'normal',
  targetDensity: 2.5,
  chordRatio: 0.15,
  beatBias: 2.5,
  holdEnabled: true,
  holdRmsPercentile: 0.25,
  quantizeDivision: 2,
}

/**
 * 每个字段的合法区间，与 UI 滑块的 min/max 保持一致。
 *
 * 为什么要校验而不是直接信任存档：localStorage 是用户可改的，
 * 手写一个 noteSpeed: 0 进去会让 renderer 的 pxPerSec 变成 Infinity，
 * 整个画面直接崩。这类"读外部数据"的边界必须自己守。
 */
const RANGES: Record<string, [number, number]> = {
  noteSpeed: [0.4, 2.2],
  userOffset: [-150, 150],
  targetDensity: [0.8, 6],
  chordRatio: [0, 0.4],
  beatBias: [1, 4],
  holdRmsPercentile: [0.1, 0.6],
}

const VALID_DIVISIONS = [1, 2, 4]

function clampNumber(key: string, value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const range = RANGES[key]
  if (!range) return value
  return Math.min(range[1], Math.max(range[0], value))
}

/**
 * 读取设置。任何异常（禁用 localStorage、JSON 损坏、字段被改坏）
 * 都退回默认值——设置读取失败绝不该阻止玩家进游戏。
 */
export function loadSettings(): RhythmSettings {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    /* 隐私模式等场景下 localStorage 不可用 */
  }
  if (!raw) return { ...DEFAULT_SETTINGS }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }

  const o = parsed as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    noteSpeed: clampNumber('noteSpeed', o.noteSpeed, d.noteSpeed),
    userOffset: clampNumber('userOffset', o.userOffset, d.userOffset),
    preset: typeof o.preset === 'string' ? o.preset : d.preset,
    targetDensity: clampNumber('targetDensity', o.targetDensity, d.targetDensity),
    chordRatio: clampNumber('chordRatio', o.chordRatio, d.chordRatio),
    beatBias: clampNumber('beatBias', o.beatBias, d.beatBias),
    holdEnabled: typeof o.holdEnabled === 'boolean' ? o.holdEnabled : d.holdEnabled,
    holdRmsPercentile: clampNumber('holdRmsPercentile', o.holdRmsPercentile, d.holdRmsPercentile),
    quantizeDivision:
      typeof o.quantizeDivision === 'number' && VALID_DIVISIONS.includes(o.quantizeDivision)
        ? o.quantizeDivision
        : d.quantizeDivision,
  }
}

/** 保存设置。写入失败静默忽略——存不下也不该影响正在玩的这局 */
export function saveSettings(s: RhythmSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* 配额满或不可用时忽略 */
  }
}

/** 清除存档，用于「恢复默认」 */
export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 忽略 */
  }
}
