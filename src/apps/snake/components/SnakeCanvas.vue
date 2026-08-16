<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { BOARD_SIZE, PLAYER_COLORS } from '../types'
import type { SnakeState, ItemState } from '../types'
import { getAppTheme } from '../../../composables/useTheme'

/**
 * 画布配色：底色与网格必须跟随全站主题，道具内部对比标记（十字/爱心/边框）
 * 也需随主题切换，否则浅色底上白色标记会“看不见”。
 * 蛇身/道具的品牌色（绿/红/紫）保留，保证游戏美术一致性。
 */
interface CanvasPalette {
  bg: string
  grid: string
  mark: string
}
const DARK_PALETTE: CanvasPalette = {
  bg: '#1a1a2e',
  grid: 'rgba(255,255,255,0.05)',
  mark: '#ffffff',
}
const LIGHT_PALETTE: CanvasPalette = {
  bg: '#f1f5f9',
  grid: 'rgba(15,23,42,0.07)',
  mark: '#0f172a',
}

const appTheme = getAppTheme()
function getPalette(): CanvasPalette {
  return appTheme.isDark ? DARK_PALETTE : LIGHT_PALETTE
}

const props = defineProps<{
  snakes: SnakeState[]
  items: ItemState[]
  myPlayerId: number | null
  canvasWidth: number
  invincibleTimers?: Map<number, number>
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const cellSize = Math.floor(w / BOARD_SIZE)

  const palette = getPalette()

  // 清屏（画布底色跟随主题）
  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, w, w)

  // 网格线（跟随主题）
  ctx.strokeStyle = palette.grid
  ctx.lineWidth = 0.5
  for (let i = 0; i <= BOARD_SIZE; i++) {
    ctx.beginPath()
    ctx.moveTo(i * cellSize, 0)
    ctx.lineTo(i * cellSize, w)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * cellSize)
    ctx.lineTo(w, i * cellSize)
    ctx.stroke()
  }

  // 道具
  for (const item of props.items) {
    const cx = item.x * cellSize + cellSize / 2
    const cy = item.y * cellSize + cellSize / 2
    const r = cellSize * 0.35

    if (item.type === 'supply') {
      // 绿色十字（生命补给）
      ctx.fillStyle = '#00e676'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()

      // + 符号（跟随主题的对比色）
      ctx.strokeStyle = palette.mark
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.4, cy)
      ctx.lineTo(cx + r * 0.4, cy)
      ctx.moveTo(cx, cy - r * 0.4)
      ctx.lineTo(cx, cy + r * 0.4)
      ctx.stroke()
    } else if (item.type === 'big_supply') {
      // 大血包 — 红色发光圆 + ♥
      const br = r * 1.3
      // 发光效果
      ctx.shadowColor = '#ff1744'
      ctx.shadowBlur = 12
      ctx.fillStyle = '#ff1744'
      ctx.beginPath()
      ctx.arc(cx, cy, br, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // 白色边框（跟随主题的对比色）
      ctx.strokeStyle = palette.mark
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, br, 0, Math.PI * 2)
      ctx.stroke()

      // ♥ 符号（跟随主题的对比色）
      ctx.fillStyle = palette.mark
      ctx.font = `bold ${Math.round(br * 1.1)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('♥', cx, cy)
    } else {
      // 紫色毒蜘蛛
      ctx.fillStyle = '#7b1fa2'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()

      // 蜘蛛腿
      ctx.strokeStyle = '#7b1fa2'
      ctx.lineWidth = 2
      const legs = [
        [-r * 0.7, -r * 0.5, -r * 1.1, -r * 0.3],
        [-r * 0.7, r * 0.5, -r * 1.1, r * 0.3],
        [r * 0.7, -r * 0.5, r * 1.1, -r * 0.3],
        [r * 0.7, r * 0.5, r * 1.1, r * 0.3],
      ]
      for (const [x1, y1, x2, y2] of legs) {
        ctx.beginPath()
        ctx.moveTo(cx + x1, cy + y1)
        ctx.lineTo(cx + x2, cy + y2)
        ctx.stroke()
      }

      // 眼睛
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(cx - r * 0.25, cy - r * 0.15, r * 0.15, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + r * 0.25, cy - r * 0.15, r * 0.15, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(cx - r * 0.25, cy - r * 0.15, r * 0.07, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + r * 0.25, cy - r * 0.15, r * 0.07, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 蛇
  for (const snake of props.snakes) {
    if (!snake.alive) continue
    const colors = PLAYER_COLORS[snake.id] || { head: '#888', body: '#aaa', outline: '#555' }
    const inv = (props.invincibleTimers?.get(snake.id) || 0) > 0

    // 无敌状态：半透明 + 发光效果
    if (inv) {
      ctx.save()
      ctx.globalAlpha = 0.45
      ctx.shadowColor = colors.head
      ctx.shadowBlur = 10
    }

    for (let i = snake.body.length - 1; i >= 0; i--) {
      const seg = snake.body[i]
      const x = seg.x * cellSize
      const y = seg.y * cellSize
      const padding = 1
      const size = cellSize - padding * 2
      const isHead = i === 0

      if (isHead) {
        // 蛇头 - 圆角方块
        const radius = 4
        ctx.fillStyle = colors.head
        ctx.beginPath()
        ctx.moveTo(x + padding + radius, y + padding)
        ctx.lineTo(x + padding + size - radius, y + padding)
        ctx.quadraticCurveTo(
          x + padding + size,
          y + padding,
          x + padding + size,
          y + padding + radius,
        )
        ctx.lineTo(x + padding + size, y + padding + size - radius)
        ctx.quadraticCurveTo(
          x + padding + size,
          y + padding + size,
          x + padding + size - radius,
          y + padding + size,
        )
        ctx.lineTo(x + padding + radius, y + padding + size)
        ctx.quadraticCurveTo(
          x + padding,
          y + padding + size,
          x + padding,
          y + padding + size - radius,
        )
        ctx.lineTo(x + padding, y + padding + radius)
        ctx.quadraticCurveTo(x + padding, y + padding, x + padding + radius, y + padding)
        ctx.closePath()
        ctx.fill()

        // 蛇头边框
        ctx.strokeStyle = colors.outline
        ctx.lineWidth = 1.5
        ctx.stroke()

        // 眼睛
        const eyeR = cellSize * 0.08
        const eyeOffset = cellSize * 0.2
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(x + cellSize / 2 - eyeOffset, y + cellSize / 2 - eyeOffset, eyeR, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x + cellSize / 2 + eyeOffset, y + cellSize / 2 - eyeOffset, eyeR, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#111'
        ctx.beginPath()
        ctx.arc(
          x + cellSize / 2 - eyeOffset,
          y + cellSize / 2 - eyeOffset,
          eyeR * 0.5,
          0,
          Math.PI * 2,
        )
        ctx.fill()
        ctx.beginPath()
        ctx.arc(
          x + cellSize / 2 + eyeOffset,
          y + cellSize / 2 - eyeOffset,
          eyeR * 0.5,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      } else {
        // 蛇身 - 圆点
        ctx.fillStyle = colors.body
        ctx.beginPath()
        ctx.arc(x + cellSize / 2, y + cellSize / 2, (size - 2) / 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (inv) {
      ctx.restore()
    }
  }
}

watch(
  () => [props.snakes, props.items],
  () => {
    nextTick(draw)
  },
  { deep: true },
)

let unsubscribe: (() => void) | null = null

onMounted(() => {
  nextTick(draw)
  // 订阅主题切换：切换时立即用新配色重绘（画布底色/网格/标记跟随主题）
  unsubscribe = appTheme.onChange(() => {
    draw()
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <canvas ref="canvasRef" :width="canvasWidth" :height="canvasWidth" class="snake-canvas" />
</template>

<style scoped>
.snake-canvas {
  display: block;
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  width: v-bind('canvasWidth + "px"');
  height: v-bind('canvasWidth + "px"');
  max-width: 100%;
}
</style>
