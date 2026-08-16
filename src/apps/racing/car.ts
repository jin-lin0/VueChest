// racing 赛车模型：升级版低多边形 F1/卡丁车造型，含尾翼、座舱、轮毂、排气管与氮气火焰。
import * as THREE from 'three'
import type { RacingCar } from './config'

export interface CarMeshes {
  group: THREE.Group
  /** 氮气火焰锥（默认隐藏，氮气时显示并脉动） */
  nitroFlame: THREE.Mesh
  /** 四个车轮，用于行驶中滚动 */
  wheels: THREE.Mesh[]
}

/**
 * 组装一辆赛车。车身朝向 +Z 为车头（与移动公式 x=sin(rot), z=cos(rot) 一致）。
 */
export function buildCarMesh(config: RacingCar): CarMeshes {
  const car = new THREE.Group()
  const bodyColor = new THREE.Color(config.color)

  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.7,
    roughness: 0.25,
  })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x223344,
    metalness: 0.9,
    roughness: 0.08,
  })

  // 下底盘
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 4.2), bodyMat)
  chassis.position.y = 0.45
  chassis.castShadow = true
  car.add(chassis)

  // 车身上盖（略窄，形成层次）
  const upper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 2.8), bodyMat)
  upper.position.set(0, 0.85, 0.2)
  upper.castShadow = true
  car.add(upper)

  // 座舱玻璃
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.5), glassMat)
  cockpit.position.set(0, 1.2, -0.2)
  cockpit.castShadow = true
  car.add(cockpit)

  // 前翼
  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.7), darkMat)
  frontWing.position.set(0, 0.28, 2.05)
  car.add(frontWing)

  // 尾翼（两根支柱 + 翼片）
  const strutGeo = new THREE.BoxGeometry(0.12, 0.55, 0.4)
  const strutL = new THREE.Mesh(strutGeo, darkMat)
  strutL.position.set(-0.5, 1.05, -1.85)
  const strutR = new THREE.Mesh(strutGeo, darkMat)
  strutR.position.set(0.5, 1.05, -1.85)
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.6), bodyMat)
  wing.position.set(0, 1.32, -1.9)
  wing.castShadow = true
  car.add(strutL)
  car.add(strutR)
  car.add(wing)

  // 车轮（外胎 + 轮毂）
  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 16)
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.34, 8)
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.8, roughness: 0.3 })
  const wheelPositions = [
    { x: -1.0, z: 1.35 },
    { x: 1.0, z: 1.35 },
    { x: -1.0, z: -1.35 },
    { x: 1.0, z: -1.35 },
  ]
  const wheels: THREE.Mesh[] = []
  wheelPositions.forEach((pos) => {
    const wheel = new THREE.Group()
    const tire = new THREE.Mesh(tireGeo, tireMat)
    tire.rotation.z = Math.PI / 2
    tire.castShadow = true
    const hub = new THREE.Mesh(hubGeo, hubMat)
    hub.rotation.z = Math.PI / 2
    wheel.add(tire)
    wheel.add(hub)
    wheel.position.set(pos.x, 0.38, pos.z)
    car.add(wheel)
    // 滚动动画统一作用在 group 上
    wheels.push(wheel as unknown as THREE.Mesh)
  })

  // 排气管
  const exhaustGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.35, 8)
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.3 })
  const exhaustL = new THREE.Mesh(exhaustGeo, exhaustMat)
  exhaustL.rotation.x = Math.PI / 2
  exhaustL.position.set(-0.35, 0.5, -2.15)
  const exhaustR = new THREE.Mesh(exhaustGeo, exhaustMat)
  exhaustR.rotation.x = Math.PI / 2
  exhaustR.position.set(0.35, 0.5, -2.15)
  car.add(exhaustL)
  car.add(exhaustR)

  // 氮气火焰（默认隐藏）
  const flameGeo = new THREE.ConeGeometry(0.26, 1.4, 10)
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const nitroFlame = new THREE.Mesh(flameGeo, flameMat)
  nitroFlame.rotation.x = -Math.PI / 2 // 锥尖朝 -Z（车尾）
  nitroFlame.position.set(0, 0.5, -2.6)
  nitroFlame.visible = false
  car.add(nitroFlame)

  // 车灯
  const lightGeo = new THREE.SphereGeometry(0.18, 8, 8)
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff8cc,
    emissive: 0xffee99,
    emissiveIntensity: 0.8,
  })
  const headlightL = new THREE.Mesh(lightGeo, headlightMat)
  headlightL.position.set(-0.65, 0.6, 2.05)
  const headlightR = new THREE.Mesh(lightGeo, headlightMat)
  headlightR.position.set(0.65, 0.6, 2.05)
  car.add(headlightL)
  car.add(headlightR)

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xff2222,
    emissiveIntensity: 0.6,
  })
  const taillightL = new THREE.Mesh(lightGeo, taillightMat)
  taillightL.position.set(-0.65, 0.6, -2.05)
  const taillightR = new THREE.Mesh(lightGeo, taillightMat)
  taillightR.position.set(0.65, 0.6, -2.05)
  car.add(taillightL)
  car.add(taillightR)

  return { group: car, nitroFlame, wheels }
}
