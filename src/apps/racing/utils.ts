// racing 模块纯函数 / 无副作用辅助（不触碰 Three.js 对象生命周期）。
import type { Ref } from 'vue'
import * as THREE from 'three'
import { RACING_CARS, type RacingCar } from './config'

/**
 * 按 id 查找赛车配置。合并 createCar / getCarMaxSpeed / getCarHandling
 * 中重复的 cars.find((c) => c.id === id) 逻辑。
 */
export function getCarById(
  id: number,
  cars: RacingCar[] = RACING_CARS,
): RacingCar | undefined {
  return cars.find((c) => c.id === id)
}

/**
 * 在赛车列表中循环切换选中项（prevCar/nextCar 的公共逻辑）。
 * 直接修改传入的响应式 ref，去掉对 player1/player2 的重复分支。
 * @param target 当前选中赛车 id 的响应式引用
 * @param dir -1 上一个 / 1 下一个
 */
export function cycleCar(target: Ref<number>, dir: -1 | 1, cars: RacingCar[] = RACING_CARS): void {
  const currentIndex = cars.findIndex((c) => c.id === target.value)
  target.value = cars[(currentIndex + dir + cars.length) % cars.length].id
}

/** 双人分屏渲染所需的玩家数据子集（避免引入组件内部类型）。 */
export interface SplitScreenPlayerView {
  position: { x: number; z: number }
  rotation: number
}

/**
 * 计算并设置分屏视角中单个相机的位姿参数。
 * 纯参数计算：只操作传入的相机对象（不创建/销毁 Three 对象，不动 renderer/viewport）。
 * 合并 gameLoop 中 camera1Offset / camera2Offset 两段几乎相同的逻辑。
 */
export function renderSplitScreenView(
  camera: THREE.PerspectiveCamera,
  playerData: SplitScreenPlayerView,
  halfWidth: number,
): void {
  const offset = new THREE.Vector3(0, 8, -15)
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerData.rotation)
  camera.position.set(
    playerData.position.x + offset.x,
    offset.y,
    playerData.position.z + offset.z,
  )
  camera.lookAt(playerData.position.x, 2, playerData.position.z)
  camera.aspect = halfWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
