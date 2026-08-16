// racing 赛道 & 环境搭建：路面 ribbon、路缘石、起跑格线、检查点门楼、围墙、场景装饰。
// 全部程序化几何，无外部贴图资源。
import * as THREE from 'three'
import { RACING_TRACK } from './config'

export interface Collectible {
  mesh: THREE.Mesh
  collected: boolean
  baseY: number
}

export interface CheckpointGate {
  group: THREE.Group
  /** 门楣材质，用于"下一个检查点"高亮 */
  barMaterial: THREE.MeshStandardMaterial
  pillarMaterial: THREE.MeshStandardMaterial
}

export interface TrackBuild {
  trackPoints: THREE.Vector3[]
  checkpoints: THREE.Vector3[]
  gates: CheckpointGate[]
  wallMeshes: THREE.Mesh[]
  collectibles: Collectible[]
}

/** 生成带随机扰动的环形赛道中心线（与原有一致的正弦叠加，限制弯密度）。 */
export function generateTrackPoints(): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const segments = RACING_TRACK.SEGMENTS
  const radius = RACING_TRACK.RADIUS
  const wave1 = 10 + Math.random() * 10
  const wave2 = 8 + Math.random() * 10
  const freq1 = 2
  const freq2 = 3
  const phase1 = Math.random() * Math.PI * 2
  const phase2 = Math.random() * Math.PI * 2

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const x = Math.cos(angle) * radius + Math.sin(angle * freq1 + phase1) * wave1
    const z = Math.sin(angle) * radius + Math.cos(angle * freq2 + phase2) * wave2
    points.push(new THREE.Vector3(x, 0, z))
  }
  return points
}

/** 点 i 处的赛道切向与法向（指向左侧）。 */
export function trackFrameAt(points: THREE.Vector3[], i: number): { dir: THREE.Vector3; perp: THREE.Vector3 } {
  const n = points.length
  const dir = new THREE.Vector3().subVectors(points[(i + 1) % n], points[i]).normalize()
  const perp = new THREE.Vector3(-dir.z, 0, dir.x)
  return { dir, perp }
}

export interface TrackQuery {
  /** 到中心线的最近距离 */
  dist: number
  /** 最近线段索引 */
  segIndex: number
  /** 最近点在线段上的参数 0~1 */
  segParam: number
}

/** 查询 (x,z) 到赛道中心线的最近距离与所在线段（碰撞 & 名次进度共用）。 */
export function queryTrack(points: THREE.Vector3[], x: number, z: number): TrackQuery {
  let minDist = Infinity
  let segIndex = 0
  let segParam = 0
  const n = points.length

  for (let i = 0; i < n; i++) {
    const current = points[i]
    const next = points[(i + 1) % n]
    const A = x - current.x
    const B = z - current.z
    const C = next.x - current.x
    const D = next.z - current.z
    const lenSq = C * C + D * D
    let param = lenSq !== 0 ? (A * C + B * D) / lenSq : -1

    let xx: number
    let zz: number
    if (param < 0) {
      param = 0
      xx = current.x
      zz = current.z
    } else if (param > 1) {
      param = 1
      xx = next.x
      zz = next.z
    } else {
      xx = current.x + param * C
      zz = current.z + param * D
    }

    const dist = Math.hypot(x - xx, z - zz)
    if (dist < minDist) {
      minDist = dist
      segIndex = i
      segParam = param
    }
  }
  return { dist: minDist, segIndex, segParam }
}

/** 沿中心线生成一条水平条带（offsetA→offsetB 为相对法向的内外偏移）。 */
function buildStrip(
  points: THREE.Vector3[],
  offsetA: number,
  offsetB: number,
  y: number,
  colorAt?: (segIndex: number) => THREE.Color,
): THREE.BufferGeometry {
  const n = points.length
  const positions = new Float32Array(n * 2 * 3)
  const colors = new Float32Array(n * 2 * 3)
  const indices: number[] = []
  const white = new THREE.Color(0xffffff)

  for (let i = 0; i < n; i++) {
    const { perp } = trackFrameAt(points, i)
    const p = points[i]
    positions[(i * 2) * 3 + 0] = p.x + perp.x * offsetA
    positions[(i * 2) * 3 + 1] = y
    positions[(i * 2) * 3 + 2] = p.z + perp.z * offsetA
    positions[(i * 2 + 1) * 3 + 0] = p.x + perp.x * offsetB
    positions[(i * 2 + 1) * 3 + 1] = y
    positions[(i * 2 + 1) * 3 + 2] = p.z + perp.z * offsetB

    const c = colorAt ? colorAt(i) : white
    colors[(i * 2) * 3 + 0] = c.r
    colors[(i * 2) * 3 + 1] = c.g
    colors[(i * 2) * 3 + 2] = c.b
    colors[(i * 2 + 1) * 3 + 0] = c.r
    colors[(i * 2 + 1) * 3 + 1] = c.g
    colors[(i * 2 + 1) * 3 + 2] = c.b

    const j = (i + 1) % n
    indices.push(i * 2, i * 2 + 1, j * 2)
    indices.push(i * 2 + 1, j * 2 + 1, j * 2)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex(indices)
  const normals = new Float32Array(n * 2 * 3)
  for (let i = 0; i < n * 2; i++) normals[i * 3 + 1] = 1
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geo
}

/** 起跑线黑白格贴图（Canvas 程序化生成）。 */
function createCheckerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 16
  const ctx = canvas.getContext('2d')!
  const cell = 8
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#f5f5f5' : '#151515'
      ctx.fillRect(col * cell, row * cell, cell, cell)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 搭建整条赛道，返回游戏逻辑所需的全部引用。 */
export function buildTrack(scene: THREE.Scene): TrackBuild {
  const trackPoints = generateTrackPoints()
  const halfWidth = RACING_TRACK.WIDTH / 2

  // 沥青路面（比地面略高，避免 z-fighting）
  const roadGeo = buildStrip(trackPoints, -halfWidth, halfWidth, 0.02)
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3b3f47, roughness: 0.95, vertexColors: false })
  const road = new THREE.Mesh(roadGeo, roadMat)
  road.receiveShadow = true
  scene.add(road)

  // 红白相间路缘石（左右各一条，略抬高）
  const curbW = 1.4
  const red = new THREE.Color(0xd23c3c)
  const white = new THREE.Color(0xe8e8e8)
  const curbColor = (i: number) => (i % 2 === 0 ? red : white)
  const curbLeft = new THREE.Mesh(
    buildStrip(trackPoints, halfWidth - curbW, halfWidth, 0.06, curbColor),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
  )
  const curbRight = new THREE.Mesh(
    buildStrip(trackPoints, -halfWidth, -(halfWidth - curbW), 0.06, curbColor),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
  )
  curbLeft.receiveShadow = true
  curbRight.receiveShadow = true
  scene.add(curbLeft)
  scene.add(curbRight)

  // 中央虚线
  const dashPoints: THREE.Vector3[] = []
  for (let i = 0; i <= trackPoints.length; i++) {
    const p = trackPoints[i % trackPoints.length]
    dashPoints.push(new THREE.Vector3(p.x, 0.05, p.z))
  }
  const dashGeo = new THREE.BufferGeometry().setFromPoints(dashPoints)
  const dashMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 2, gapSize: 2.5, transparent: true, opacity: 0.7 })
  const dashLine = new THREE.Line(dashGeo, dashMat)
  dashLine.computeLineDistances()
  scene.add(dashLine)

  // 起跑格线
  const { dir: startDir, perp: startPerp } = trackFrameAt(trackPoints, 0)
  const startGeo = new THREE.PlaneGeometry(RACING_TRACK.WIDTH, 3)
  startGeo.rotateX(-Math.PI / 2)
  const startLine = new THREE.Mesh(
    startGeo,
    new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.8 }),
  )
  startLine.position.set(trackPoints[0].x, 0.045, trackPoints[0].z)
  startLine.rotation.y = Math.atan2(-startPerp.z, startPerp.x)
  scene.add(startLine)

  // 围墙：长度跟随真实分段，不再有缺口
  const wallMeshes: THREE.Mesh[] = []
  const wallHeight = RACING_TRACK.WALL_HEIGHT
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.85 })
  for (let i = 0; i < trackPoints.length; i++) {
    const p = trackPoints[i]
    const { dir, perp } = trackFrameAt(trackPoints, i)
    const segLen = trackPoints[(i + 1) % trackPoints.length].distanceTo(p) + 0.4
    for (const side of [1, -1]) {
      const geo = new THREE.BoxGeometry(0.6, wallHeight, segLen)
      const wall = new THREE.Mesh(geo, wallMat)
      wall.position.set(p.x + perp.x * (halfWidth + 0.5) * side, wallHeight / 2, p.z + perp.z * (halfWidth + 0.5) * side)
      wall.lookAt(wall.position.clone().add(dir))
      // 不投影：120 段围墙进阴影 pass 太贵，只接收阴影
      wall.receiveShadow = true
      scene.add(wall)
      wallMeshes.push(wall)
    }
  }
  void startDir

  // 检查点门楼
  const checkpoints: THREE.Vector3[] = []
  const gates: CheckpointGate[] = []
  const pillarGeo = new THREE.BoxGeometry(0.5, 6, 0.5)
  const barGeo = new THREE.BoxGeometry(RACING_TRACK.WIDTH - 1, 0.6, 0.6)
  for (let i = 0; i < RACING_TRACK.CHECKPOINTS; i++) {
    const index = Math.floor((i / RACING_TRACK.CHECKPOINTS) * trackPoints.length)
    const point = trackPoints[index]
    checkpoints.push(point.clone())

    const { perp } = trackFrameAt(trackPoints, index)
    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: 0x00d5ff,
      emissive: 0x00d5ff,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    })
    const barMaterial = new THREE.MeshStandardMaterial({
      color: 0x00d5ff,
      emissive: 0x00d5ff,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    })
    const group = new THREE.Group()
    const pillarL = new THREE.Mesh(pillarGeo, pillarMaterial)
    pillarL.position.set(-(halfWidth - 0.8), 3, 0)
    const pillarR = new THREE.Mesh(pillarGeo, pillarMaterial)
    pillarR.position.set(halfWidth - 0.8, 3, 0)
    const bar = new THREE.Mesh(barGeo, barMaterial)
    bar.position.set(0, 6, 0)
    pillarL.castShadow = true
    pillarR.castShadow = true
    group.add(pillarL)
    group.add(pillarR)
    group.add(bar)
    group.position.set(point.x, 0, point.z)
    group.rotation.y = Math.atan2(-perp.z, perp.x)
    scene.add(group)
    gates.push({ group, barMaterial, pillarMaterial })
  }

  // 收集物（金币）
  const collectibles: Collectible[] = []
  const coinGeo = new THREE.OctahedronGeometry(0.8)
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffd700,
    emissiveIntensity: 0.5,
    metalness: 0.6,
    roughness: 0.3,
  })
  for (let i = 0; i < 20; i++) {
    const mesh = new THREE.Mesh(coinGeo, coinMat)
    const pointIndex = Math.floor(Math.random() * trackPoints.length)
    const point = trackPoints[pointIndex]
    const { perp } = trackFrameAt(trackPoints, pointIndex)
    const offset = (Math.random() - 0.5) * (RACING_TRACK.WIDTH - 6)
    mesh.position.set(point.x + perp.x * offset, 1.5, point.z + perp.z * offset)
    scene.add(mesh)
    collectibles.push({ mesh, collected: false, baseY: 1.5 })
  }

  return { trackPoints, checkpoints, gates, wallMeshes, collectibles }
}

/** 环境装饰：地面、树、楼、云、远山。 */
export function buildEnvironment(scene: THREE.Scene): void {
  const groundGeo = new THREE.PlaneGeometry(800, 800)
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  ground.receiveShadow = true
  scene.add(ground)

  // 树
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 })
  const leavesGeo = new THREE.ConeGeometry(2, 4, 8)
  const leafMats = [0x228b22, 0x2e9e2e, 0x1e7d32].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
  )
  for (let i = 0; i < 90; i++) {
    const tree = new THREE.Group()
    const trunk = new THREE.Mesh(trunkGeo, trunkMat)
    trunk.position.y = 1.5
    const leaves = new THREE.Mesh(leavesGeo, leafMats[i % leafMats.length])
    leaves.position.y = 4
    tree.add(trunk)
    tree.add(leaves)
    const angle = Math.random() * Math.PI * 2
    const distance = 125 + Math.random() * 110
    const scale = 0.8 + Math.random() * 0.8
    tree.scale.set(scale, scale, scale)
    tree.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
    scene.add(tree)
  }

  // 楼
  for (let i = 0; i < 16; i++) {
    const width = 5 + Math.random() * 10
    const height = 10 + Math.random() * 22
    const depth = 5 + Math.random() * 10
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 0.15, 0.45 + Math.random() * 0.2),
        roughness: 0.7,
      }),
    )
    mesh.position.y = height / 2
    const angle = Math.random() * Math.PI * 2
    const distance = 170 + Math.random() * 110
    mesh.position.set(Math.cos(angle) * distance, height / 2, Math.sin(angle) * distance)
    scene.add(mesh)
  }

  // 云（几坨压扁的白色球）
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 })
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group()
    const puffs = 2 + Math.floor(Math.random() * 3)
    for (let j = 0; j < puffs; j++) {
      const r = 4 + Math.random() * 5
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat)
      puff.position.set(j * r * 1.1 - (puffs * r) / 2, Math.random() * 2, Math.random() * 4)
      puff.scale.y = 0.55
      cloud.add(puff)
    }
    const angle = Math.random() * Math.PI * 2
    const distance = 60 + Math.random() * 240
    cloud.position.set(Math.cos(angle) * distance, 48 + Math.random() * 24, Math.sin(angle) * distance)
    scene.add(cloud)
  }

  // 远山剪影
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x6b7f94, roughness: 1 })
  for (let i = 0; i < 14; i++) {
    const r = 30 + Math.random() * 35
    const h = 40 + Math.random() * 45
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mountainMat)
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.3
    const distance = 310 + Math.random() * 60
    mountain.position.set(Math.cos(angle) * distance, h / 2 - 2, Math.sin(angle) * distance)
    scene.add(mountain)
  }
}

/** 递归释放场景对象的几何体 / 材质 / 贴图，避免重开比赛时 GPU 资源泄漏。 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial)
    } else if (material) {
      disposeMaterial(material)
    }
  })
}

function disposeMaterial(material: THREE.Material): void {
  const withMaps = material as THREE.MeshStandardMaterial
  withMaps.map?.dispose()
  material.dispose()
}
