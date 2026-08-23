import { afterEach, describe, expect, it, vi } from 'vitest'
import { GhostRecorder, interpolateGhost, loadGhost, saveGhost } from '../ghost'

describe('幽灵车', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('以 20Hz 限制采样并生成独立帧副本', () => {
    const recorder = new GhostRecorder(0.05)
    recorder.sample({ time: 0, x: 0, z: 0, rotation: 0, speed: 0 })
    recorder.sample({ time: 0.02, x: 1, z: 0, rotation: 0, speed: 1 })
    recorder.sample({ time: 0.05, x: 2, z: 0, rotation: 0, speed: 2 })
    const lap = recorder.finish('forest', 1, 30)
    expect(lap.frames).toHaveLength(2)
    expect(lap.frames[1].x).toBe(2)
  })

  it('在相邻帧之间平滑插值', () => {
    const value = interpolateGhost(
      [
        { time: 0, x: 0, z: 10, rotation: 0, speed: 20 },
        { time: 1, x: 10, z: 20, rotation: Math.PI / 2, speed: 40 },
      ],
      0.5,
    )
    expect(value?.x).toBeCloseTo(5)
    expect(value?.z).toBeCloseTo(15)
    expect(value?.speed).toBeCloseTo(30)
  })

  it('IndexedDB 不可用时安静回退', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('disabled') } })
    await expect(loadGhost('forest', 1)).resolves.toBeNull()
    await expect(saveGhost({ version: 1, trackId: 'forest', carId: 1, lapTime: 30, frames: [] })).resolves.toBeUndefined()
  })
})
