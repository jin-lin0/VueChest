export function useTrackedEffects() {
  const intervals: ReturnType<typeof setInterval>[] = []
  const timeouts: ReturnType<typeof setTimeout>[] = []
  const animationFrames: number[] = []

  function trackInterval(fn: () => void, milliseconds: number): ReturnType<typeof setInterval> {
    const id = setInterval(fn, milliseconds)
    intervals.push(id)
    return id
  }

  function trackTimeout(fn: () => void, milliseconds: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(fn, milliseconds)
    timeouts.push(id)
    return id
  }

  function trackRaf(callback: FrameRequestCallback): number {
    const id = requestAnimationFrame(callback)
    animationFrames.push(id)
    return id
  }

  function clearTrackedEffects() {
    intervals.forEach((id) => clearInterval(id))
    timeouts.forEach((id) => clearTimeout(id))
    animationFrames.forEach((id) => cancelAnimationFrame(id))
    intervals.length = 0
    timeouts.length = 0
    animationFrames.length = 0
  }

  return { trackInterval, trackTimeout, trackRaf, clearTrackedEffects }
}
