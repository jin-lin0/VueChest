import type { UpgradeDefinition } from './types'

export const UPGRADES: UpgradeDefinition[] = [
  {
    id: 'damage',
    icon: '◆',
    title: '高能弹芯',
    rarity: 'common',
    maxLevel: 6,
    describe: () => '子弹伤害提高 24%',
    apply: (player) => {
      player.damage *= 1.24
    },
  },
  {
    id: 'firerate',
    icon: 'ϟ',
    title: '超频扳机',
    rarity: 'common',
    maxLevel: 6,
    describe: () => '射速提高 18%',
    apply: (player) => {
      player.fireRate *= 1.18
    },
  },
  {
    id: 'multishot',
    icon: '⋔',
    title: '棱镜阵列',
    rarity: 'epic',
    maxLevel: 3,
    describe: (level) => `每次额外发射 1 枚子弹 · 当前 ${level + 1} 发`,
    apply: (player) => {
      player.multishot += 1
      player.spread = Math.min(0.2, player.spread + 0.018)
    },
  },
  {
    id: 'pierce',
    icon: '➵',
    title: '相位穿透',
    rarity: 'rare',
    maxLevel: 3,
    describe: (level) => `子弹额外穿透 1 个敌人 · 当前 ${level}`,
    apply: (player) => {
      player.pierce += 1
    },
  },
  {
    id: 'vitality',
    icon: '♥',
    title: '再生装甲',
    rarity: 'rare',
    maxLevel: 4,
    describe: () => '最大生命提高 25，并恢复 35 生命',
    apply: (player) => {
      player.maxHp += 25
      player.hp = Math.min(player.maxHp, player.hp + 35)
    },
  },
  {
    id: 'speed',
    icon: '»',
    title: '矢量推进',
    rarity: 'common',
    maxLevel: 4,
    describe: () => '移动速度提高 12%',
    apply: (player) => {
      player.speed *= 1.12
    },
  },
  {
    id: 'magnet',
    icon: '⌁',
    title: '引力涡轮',
    rarity: 'common',
    maxLevel: 4,
    describe: () => '拾取范围增加 55',
    apply: (player) => {
      player.magnet += 55
    },
  },
  {
    id: 'regen',
    icon: '✚',
    title: '纳米修复',
    rarity: 'rare',
    maxLevel: 4,
    describe: () => '每秒恢复 0.7 生命',
    apply: (player) => {
      player.regen += 0.7
    },
  },
  {
    id: 'crit',
    icon: '✦',
    title: '弱点解析',
    rarity: 'rare',
    maxLevel: 4,
    describe: () => '暴击概率提高 9%',
    apply: (player) => {
      player.critChance = Math.min(0.55, player.critChance + 0.09)
    },
  },
  {
    id: 'armor',
    icon: '⬡',
    title: '偏转力场',
    rarity: 'rare',
    maxLevel: 4,
    describe: () => '受到的伤害降低 8%',
    apply: (player) => {
      player.armor = Math.min(0.42, player.armor + 0.08)
    },
  },
  {
    id: 'dash',
    icon: '◈',
    title: '闪烁核心',
    rarity: 'epic',
    maxLevel: 3,
    describe: () => '冲刺冷却缩短 18%',
    apply: (player) => {
      player.dashCooldown *= 0.82
    },
  },
  {
    id: 'caliber',
    icon: '●',
    title: '重型口径',
    rarity: 'common',
    maxLevel: 4,
    describe: () => '子弹体积提高 28%，伤害提高 8%',
    apply: (player) => {
      player.bulletSize *= 1.28
      player.damage *= 1.08
    },
  },
]
