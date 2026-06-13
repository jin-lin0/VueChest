import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 贪吃蛇触控 & 键盘输入 composable
 */
export function useSnakeTouch(onDirection: (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void) {
  const touchStart = ref<{ x: number; y: number } | null>(null)

  // ─── 键盘 ─────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault()
        onDirection('UP')
        break
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault()
        onDirection('DOWN')
        break
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault()
        onDirection('LEFT')
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault()
        onDirection('RIGHT')
        break
    }
  }

  // ─── 触控手势 ─────────────────────
  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 0) return
    touchStart.value = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (!touchStart.value || e.changedTouches.length === 0) return
    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const dx = endX - touchStart.value.x
    const dy = endY - touchStart.value.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // 最小滑动距离 20px
    if (Math.max(absDx, absDy) < 20) {
      touchStart.value = null
      return
    }

    if (absDx > absDy) {
      onDirection(dx > 0 ? 'RIGHT' : 'LEFT')
    } else {
      onDirection(dy > 0 ? 'DOWN' : 'UP')
    }

    touchStart.value = null
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('touchstart', handleTouchStart)
    document.removeEventListener('touchend', handleTouchEnd)
  })

  // 方向键按钮回调
  function pressDir(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') {
    onDirection(dir)
  }

  return { pressDir, handleTouchStart, handleTouchEnd }
}
