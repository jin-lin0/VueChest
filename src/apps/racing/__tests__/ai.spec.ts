import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { updateAI, raceProgress, type AICarState } from '../ai'
import { RACING_CARS, RACING_DRIFT } from '../config'
import { TRACKS, type FixedTrackId } from '../game'
import { checkpointPointIndices, generateTrackPoints, isOutsideTrack, trackFrameAt } from '../track'
import { createPlayerData, resetPlayerData } from '../types'

function createAI(trackId: FixedTrackId): {
  ai: AICarState
  points: THREE.Vector3[]
  checkpoints: THREE.Vector3[]
} {
  const track = TRACKS[trackId]
  const points = generateTrackPoints(track)
  const checkpoints = checkpointPointIndices(points.length, track.checkpoints).map((index) =>
    points[index].clone(),
  )
  const frame = trackFrameAt(points, 0)
  const data = createPlayerData()
  resetPlayerData(
    data,
    points[0].x,
    points[0].z,
    Math.atan2(frame.dir.x, frame.dir.z),
    checkpoints.length,
  )
  return {
    points,
    checkpoints,
    ai: {
      data,
      mesh: new THREE.Group(),
      nitroFlame: new THREE.Mesh(),
      car: RACING_CARS[0],
      laneOffset: 0,
      paceFactor: 1,
      personality: 'drifter',
      isDrifting: false,
      mistakeTimer: 0,
      itemCooldown: 0,
      stuckTimer: 0,
      lastProgress: -Infinity,
      resetCooldown: 0,
    },
  }
}

describe('AI 驾驶规则', () => {
  it('淘汰后立即停止移动并关闭所有可交互表现', () => {
    const { ai, points, checkpoints } = createAI('forest')
    const before = { ...ai.data.position }
    ai.data.speed = 24
    ai.data.eliminated = true
    ai.nitroFlame.visible = true

    updateAI(ai, {
      points,
      checkpoints,
      delta: 1 / 60,
      totalLaps: 3,
      gameTime: 10,
      trackWidth: TRACKS.forest.width,
      allowTankNitro: true,
      playerProgress: 0,
      difficulty: 'standard',
    })

    expect(ai.data.position).toEqual(before)
    expect(ai.data.speed).toBe(0)
    expect(ai.mesh.visible).toBe(false)
    expect(ai.nitroFlame.visible).toBe(false)
  })

  it('连续三秒没有有效进度时自动后退复位并罚时', () => {
    const { ai, points, checkpoints } = createAI('ridge')
    const start = { ...ai.data.position }

    for (let frame = 0; frame < 60 * 3.5; frame++) {
      updateAI(ai, {
        points,
        checkpoints,
        delta: 1 / 60,
        totalLaps: 1,
        gameTime: frame / 60,
        // 可行驶半宽为 0，稳定模拟被墙体完全卡住。
        trackWidth: 2,
        allowTankNitro: true,
        playerProgress: 0,
        difficulty: 'expert',
        random: () => 1,
      })
    }

    expect(ai.data.penaltyTime).toBe(2.5)
    expect(ai.data.speed).toBeGreaterThanOrEqual(0)
    expect(ai.resetCooldown).toBeGreaterThan(0)
    expect(Math.hypot(ai.data.position.x - start.x, ai.data.position.z - start.z)).toBeLessThan(20)
  })

  it.each(['forest', 'desert', 'ridge'] as const)(
    '%s 会漂移且全程遵守赛道与车辆极速',
    (trackId) => {
      const { ai, points, checkpoints } = createAI(trackId)
      const track = TRACKS[trackId]
      let sawDrift = false
      let sawContinuousNitroGain = false
      let maxSpeed = 0

      for (let frame = 0; frame < 60 * 120 && !ai.data.finished; frame++) {
        const gameTime = frame / 60
        const nitroBefore = ai.data.nitro
        updateAI(ai, {
          points,
          checkpoints,
          delta: 1 / 60,
          totalLaps: 1,
          gameTime,
          trackWidth: track.width,
          allowTankNitro: true,
          playerProgress: raceProgress(points, ai.data),
          difficulty: 'expert',
          random: () => 1,
        })
        sawDrift ||= ai.isDrifting
        sawContinuousNitroGain ||= ai.isDrifting && ai.data.nitro > nitroBefore
        maxSpeed = Math.max(maxSpeed, ai.data.speed)
        expect(isOutsideTrack(points, ai.data.position.x, ai.data.position.z, track.width)).toBe(
          false,
        )
      }

      expect(sawDrift).toBe(true)
      expect(sawContinuousNitroGain).toBe(true)
      expect(
        ai.data.finished,
        JSON.stringify({
          checkpoint: ai.data.checkpointIndex,
          lap: ai.data.currentLap,
          position: ai.data.position,
          speed: ai.data.speed,
          progress: raceProgress(points, ai.data),
        }),
      ).toBe(true)
      expect(ai.data.penaltyTime).toBe(0)
      expect(maxSpeed).toBeLessThanOrEqual(
        (ai.car.speed / 5) * RACING_DRIFT.BOOST_MAX_SPEED_MULTIPLIER,
      )
    },
  )

  it('静止玩家的名次只会下降，不会因组合弯跳段获得虚假超车', () => {
    const track = TRACKS.desert
    const first = createAI('desert')
    const points = first.points
    const checkpoints = first.checkpoints
    const startFrame = trackFrameAt(points, 0)
    const player = createPlayerData()
    resetPlayerData(
      player,
      points[0].x,
      points[0].z,
      Math.atan2(startFrame.dir.x, startFrame.dir.z),
      checkpoints.length,
    )
    const opponents = [first.ai, createAI('desert').ai, createAI('desert').ai]
    opponents.forEach((ai, index) => {
      ai.car = RACING_CARS[index + 1]
      ai.paceFactor = 0.96 + index * 0.025
      ai.laneOffset = (index - 1) * 2.5
      const back = 6 + Math.floor(index / 2) * 6
      const side = index % 2 === 0 ? 3.2 : -3.2
      resetPlayerData(
        ai.data,
        points[0].x - startFrame.dir.x * back + startFrame.perp.x * side,
        points[0].z - startFrame.dir.z * back + startFrame.perp.z * side,
        Math.atan2(startFrame.dir.x, startFrame.dir.z),
        checkpoints.length,
      )
    })

    let previousRank = 1
    for (let frame = 0; frame < 60 * 45; frame++) {
      const gameTime = frame / 60
      for (const ai of opponents) {
        updateAI(ai, {
          points,
          checkpoints,
          delta: 1 / 60,
          totalLaps: 3,
          gameTime,
          trackWidth: track.width,
          allowTankNitro: true,
          playerProgress: raceProgress(points, player),
          difficulty: 'standard',
          random: () => 1,
        })
      }
      const rank =
        1 + opponents.filter((opponent) => raceProgress(points, opponent.data) > 0).length
      expect(
        rank,
        JSON.stringify(
          opponents.map((opponent) => ({
            progress: raceProgress(points, opponent.data),
            checkpoint: opponent.data.checkpointIndex,
            lap: opponent.data.currentLap,
          })),
        ),
      ).toBeGreaterThanOrEqual(previousRank)
      previousRank = rank
    }
    expect(previousRank).toBe(4)
  })
})
