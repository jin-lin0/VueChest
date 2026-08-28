import type { RacingCar } from './config'
import type { LiveryId, Medal } from './game'
import type { DriftLevel, ItemId } from './rules'

export const DRIFT_LEVEL_LABELS: Record<DriftLevel, string> = {
  none: '',
  good: 'GOOD',
  great: 'GREAT',
  perfect: 'PERFECT',
}

export const MEDAL_LABELS: Record<Medal, string> = {
  none: '未获奖牌',
  bronze: '铜牌',
  silver: '银牌',
  gold: '金牌',
}

export const ITEM_LABELS: Record<ItemId, string> = {
  nitro: '涡轮冲刺',
  shield: '护盾',
  missile: '追踪导弹',
  magnet: '磁铁',
  oil: '油渍',
  roadblock: '路障',
  jammer: '干扰器',
}

export const LIVERY_LABELS: Record<string, string> = {
  duotone: '基础双色',
  sandstorm: '沙暴车漆',
  glacier: '冰川车漆',
  'champion-metal': '冠军金属',
  'champion-stripe': '冠军条纹与称号',
}

export const LIVERY_UNLOCK_HINTS: Record<LiveryId, string> = {
  classic: '默认可用',
  duotone: '获得任意一枚奖牌后解锁',
  sandstorm: '任意三条固定赛道获得铜牌后解锁',
  glacier: '任意三条固定赛道获得银牌后解锁',
  'champion-metal': '任意三条固定赛道获得金牌后解锁',
  'champion-stripe': '赢得一次三站锦标赛后解锁',
}

export function formatLap(time: number): string {
  if (time <= 0) return '00:00.0'
  const minutes = Math.floor(time / 60)
  const seconds = time % 60
  return `${String(minutes).padStart(2, '0')}:${seconds < 10 ? '0' : ''}${seconds.toFixed(1)}`
}

export function formatRaceDelta(value: number): string {
  return `${Math.abs(value).toFixed(2)}s`
}

export function carTrait(car: RacingCar): string {
  if (car.speed >= 190) return '极速型'
  if (car.handling >= 85) return '操控型'
  return '均衡型'
}

export function itemLabel(item: ItemId | null): string {
  return item ? ITEM_LABELS[item] : '等待拾取'
}

export function liveryOptionsFor(car: RacingCar, unlockedLiveries: LiveryId[]) {
  return [
    {
      id: 'classic' as LiveryId,
      label: '经典',
      paint: `linear-gradient(135deg, ${car.color}, #23293a)`,
    },
    {
      id: 'duotone' as LiveryId,
      label: '双色',
      paint: 'linear-gradient(135deg, #fff2cf 50%, #273c75 50%)',
    },
    {
      id: 'sandstorm' as LiveryId,
      label: '沙暴',
      paint: 'linear-gradient(135deg, #f2a65a 50%, #693f2f 50%)',
    },
    {
      id: 'glacier' as LiveryId,
      label: '冰川',
      paint: 'linear-gradient(135deg, #c9f7ff 50%, #5577ff 50%)',
    },
    {
      id: 'champion-metal' as LiveryId,
      label: '冠军',
      paint: 'linear-gradient(135deg, #ffe27a 50%, #8f6b18 50%)',
    },
    {
      id: 'champion-stripe' as LiveryId,
      label: '条纹',
      paint: 'linear-gradient(135deg, #fff4d6 38%, #e43f5a 38% 58%, #273c75 58%)',
    },
  ].map((option) => ({
    ...option,
    unlocked: unlockedLiveries.includes(option.id),
    unlockHint: LIVERY_UNLOCK_HINTS[option.id],
  }))
}
