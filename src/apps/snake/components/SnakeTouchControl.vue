<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Direction } from '../composables/snakeTypes'

const emit = defineEmits<{
  direction: [dir: Direction]
}>()

const JOYSTICK_SIZE = 140
const KNOB_SIZE = 50
const DEADZONE = 15

const containerRef = ref<HTMLDivElement | null>(null)
const center = ref({ x: 0, y: 0 })
const knobOffset = ref({ x: 0, y: 0 })
const isTouching = ref(false)
const currentDir = ref('')

const knobStyle = computed(() => ({
  transform: `translate(calc(-50% + ${knobOffset.value.x}px), calc(-50% + ${knobOffset.value.y}px))`,
}))

function getAngle( dx: number, dy: number): number {
  return Math.atan2(dy, dx) * (180 / Math.PI)
}

function dirFromAngle(angle: number): Direction {
  // Math.atan2 在屏幕坐标中：
  //   0°   = 右（dx>0, dy≈0）
  //   90°  = 下（dx≈0, dy>0）
  //   ±180°= 左（dx<0, dy≈0）
  //  -90°  = 上（dx≈0, dy<0）
  const a = ((angle % 360) + 360) % 360
  if (a >= 315 || a < 45) return 'RIGHT'   // 右
  if (a >= 45 && a < 135) return 'DOWN'    // 下
  if (a >= 135 && a < 225) return 'LEFT'   // 左
  return 'UP'                               // 上
}

function handleTouchStart(e: TouchEvent) {
  e.preventDefault()
  const touch = e.touches[0]
  const rect = containerRef.value!.getBoundingClientRect()
  center.value = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
  isTouching.value = true
  updateKnob(touch.clientX, touch.clientY)
}

function handleTouchMove(e: TouchEvent) {
  e.preventDefault()
  if (!isTouching.value) return
  const touch = e.touches[0]
  updateKnob(touch.clientX, touch.clientY)
}

function handleTouchEnd(e: TouchEvent) {
  e.preventDefault()
  isTouching.value = false
  knobOffset.value = { x: 0, y: 0 }
  currentDir.value = ''
}

function updateKnob(touchX: number, touchY: number) {
  const dx = touchX - center.value.x
  const dy = touchY - center.value.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const maxRadius = JOYSTICK_SIZE / 2 - KNOB_SIZE / 2

  if (dist < DEADZONE) {
    knobOffset.value = { x: 0, y: 0 }
    return
  }

  // 限制 knob 在圆形范围内
  const clampedDist = Math.min(dist, maxRadius)
  const ratio = clampedDist / dist
  const clampedX = dx * ratio
  const clampedY = dy * ratio
  knobOffset.value = { x: clampedX, y: clampedY }

  // 计算方向
  const angle = getAngle(dx, dy)
  const dir = dirFromAngle(angle)
  if (dir !== currentDir.value) {
    currentDir.value = dir
    emit('direction', dir)
  }
}
</script>

<template>
  <div
    ref="containerRef"
    class="joystick-container"
    :style="{ width: JOYSTICK_SIZE + 'px', height: JOYSTICK_SIZE + 'px' }"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- 外圈 -->
    <div class="joystick-base" />
    <!-- 方向标记 -->
    <div class="dir-marker up">▲</div>
    <div class="dir-marker right">▶</div>
    <div class="dir-marker down">▼</div>
    <div class="dir-marker left">◀</div>
    <!-- 摇杆 knob -->
    <div
      class="joystick-knob"
      :class="{ active: isTouching }"
      :style="knobStyle"
    />
  </div>
</template>

<style scoped>
.joystick-container {
  position: relative;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid rgba(255, 255, 255, 0.12);
  touch-action: none;
  user-select: none;
  flex-shrink: 0;
}

.joystick-base {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle at center,
    rgba(255, 255, 255, 0.02) 0%,
    rgba(255, 255, 255, 0.06) 100%
  );
}

.dir-marker {
  position: absolute;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.2);
  pointer-events: none;
}
.dir-marker.up {
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
}
.dir-marker.right {
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
}
.dir-marker.down {
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
}
.dir-marker.left {
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
}

.joystick-knob {
  position: absolute;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle at 40% 35%,
    rgba(255, 255, 255, 0.4) 0%,
    rgba(99, 102, 241, 0.7) 60%,
    rgba(79, 70, 229, 0.9) 100%
  );
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
  transition: box-shadow 0.2s;
  pointer-events: none;
}
.joystick-knob.active {
  box-shadow: 0 4px 25px rgba(99, 102, 241, 0.5);
}
</style>
