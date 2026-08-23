// racing 赛道 & 环境搭建：路面 ribbon、路缘石、起跑格线、检查点门楼、围墙、场景装饰。
// 全部程序化几何，无外部贴图资源。
import * as THREE from 'three'
import { RACING_TRACK } from './config'
import { seededRandom, type QualityPreset, type TrackDefinition } from './game'

export interface Collectible {
  mesh: THREE.Mesh
  collected: boolean
  baseY: number
  kind: 'coin' | 'item'
  respawnAt: number
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

/** 检查点按赛道顺序排布，最后一个固定落在起终点，用它完成圈数结算。 */
export function checkpointPointIndices(pointCount: number, checkpointCount: number): number[] {
  return Array.from(
    { length: checkpointCount },
    (_, index) => Math.floor(((index + 1) / checkpointCount) * pointCount) % pointCount,
  )
}

/** 生成带随机扰动的环形赛道中心线（与原有一致的正弦叠加，限制弯密度）。 */
export function generateTrackPoints(definition?: TrackDefinition): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const segments = definition?.id === 'ridge' ? 72 : RACING_TRACK.SEGMENTS
  const radius = RACING_TRACK.RADIUS
  const random = definition ? seededRandom(definition.seed) : Math.random
  const profile =
    definition?.id === 'ridge'
      ? { wave1: 7, wave2: 10, freq1: 5, freq2: 6 }
      : definition?.id === 'desert'
        ? { wave1: 14, wave2: 9, freq1: 3, freq2: 4 }
        : definition?.id === 'snow'
          ? { wave1: 8, wave2: 12, freq1: 2, freq2: 4 }
          : definition?.id === 'forest'
            ? { wave1: 10, wave2: 8, freq1: 3, freq2: 4 }
            : { wave1: 10 + random() * 10, wave2: 8 + random() * 10, freq1: 2, freq2: 3 }
  const phase1 = random() * Math.PI * 2
  const phase2 = random() * Math.PI * 2

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const x = Math.cos(angle) * radius + Math.sin(angle * profile.freq1 + phase1) * profile.wave1
    const z = Math.sin(angle) * radius + Math.cos(angle * profile.freq2 + phase2) * profile.wave2
    points.push(new THREE.Vector3(x, 0, z))
  }
  return points
}

/** 点 i 处的赛道切向与法向（指向左侧）。 */
export function trackFrameAt(
  points: THREE.Vector3[],
  i: number,
): { dir: THREE.Vector3; perp: THREE.Vector3 } {
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

/** 玩家与 AI 共用的赛道边界判定。 */
export function isOutsideTrack(
  points: THREE.Vector3[],
  x: number,
  z: number,
  trackWidth: number,
  carHalfWidth = 1,
): boolean {
  return queryTrack(points, x, z).dist > trackWidth / 2 - carHalfWidth
}

/**
 * 折线顶点的斜接偏移点。相比直接取下一段法线，急弯两侧不会出现裂缝或翻折。
 */
export function trackOffsetAt(points: THREE.Vector3[], i: number, offset: number): THREE.Vector3 {
  const n = points.length
  const previous = trackFrameAt(points, (i - 1 + n) % n)
  const current = trackFrameAt(points, i)
  const miter = previous.perp.clone().add(current.perp)
  if (miter.lengthSq() < 1e-8) return points[i].clone().addScaledVector(current.perp, offset)
  miter.normalize()
  const scale = offset / Math.max(0.35, miter.dot(current.perp))
  return points[i].clone().addScaledVector(miter, scale)
}

/** 查询 (x,z) 到整条赛道中心线的最近距离与所在线段（主要用于碰撞）。 */
export function queryTrack(points: THREE.Vector3[], x: number, z: number): TrackQuery {
  return queryTrackRange(points, x, z, 0, points.length)
}

/**
 * 只在指定的不跨圈线段区间内查询。比赛进度用当前检查点区间约束，避免组合弯误跳段。
 */
export function queryTrackRange(
  points: THREE.Vector3[],
  x: number,
  z: number,
  startIndex: number,
  endIndex: number,
): TrackQuery {
  let minDist = Infinity
  let segIndex = startIndex
  let segParam = 0
  const n = points.length

  for (let i = startIndex; i < endIndex; i++) {
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
    const pointA = trackOffsetAt(points, i, offsetA)
    const pointB = trackOffsetAt(points, i, offsetB)
    positions[i * 2 * 3 + 0] = pointA.x
    positions[i * 2 * 3 + 1] = y
    positions[i * 2 * 3 + 2] = pointA.z
    positions[(i * 2 + 1) * 3 + 0] = pointB.x
    positions[(i * 2 + 1) * 3 + 1] = y
    positions[(i * 2 + 1) * 3 + 2] = pointB.z

    const c = colorAt ? colorAt(i) : white
    colors[i * 2 * 3 + 0] = c.r
    colors[i * 2 * 3 + 1] = c.g
    colors[i * 2 * 3 + 2] = c.b
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

/** 沿路面边缘生成连续竖直墙体，避免长方体墙段在急弯处互相穿插或留缝。 */
function buildWallGeometry(
  points: THREE.Vector3[],
  offset: number,
  height: number,
): THREE.BufferGeometry {
  const n = points.length
  const positions = new Float32Array(n * 2 * 3)
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const point = trackOffsetAt(points, i, offset)
    positions[i * 6] = point.x
    positions[i * 6 + 1] = 0
    positions[i * 6 + 2] = point.z
    positions[i * 6 + 3] = point.x
    positions[i * 6 + 4] = height
    positions[i * 6 + 5] = point.z
    const next = (i + 1) % n
    indices.push(i * 2, next * 2, i * 2 + 1)
    indices.push(i * 2 + 1, next * 2, next * 2 + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
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
export function buildTrack(
  scene: THREE.Scene,
  definition?: TrackDefinition,
  options: { itemMode?: boolean } = {},
): TrackBuild {
  const random = definition ? seededRandom(definition.seed + 91) : Math.random
  const trackPoints = generateTrackPoints(definition)
  const trackWidth = definition?.width ?? RACING_TRACK.WIDTH
  const checkpointCount = definition?.checkpoints ?? RACING_TRACK.CHECKPOINTS
  const halfWidth = trackWidth / 2
  const theme = definition?.id ?? 'forest'
  const trackStyle = {
    forest: {
      road: 0x303b38,
      curbA: 0xe9f7ed,
      curbB: 0x24a85a,
      center: 0xcff6dc,
      wall: 0x526761,
      gate: 0x45e38a,
    },
    desert: {
      road: 0x58443c,
      curbA: 0xffd37a,
      curbB: 0x2b2421,
      center: 0xffd68a,
      wall: 0xa65c39,
      gate: 0xff9f43,
    },
    snow: {
      road: 0x53657b,
      curbA: 0xf4fbff,
      curbB: 0x4fc9ed,
      center: 0xcdf7ff,
      wall: 0x91b5d4,
      gate: 0x71ebff,
    },
    ridge: {
      road: 0x272a3d,
      curbA: 0xf5d76e,
      curbB: 0xa45cff,
      center: 0xd7c7ff,
      wall: 0x4d4a68,
      gate: 0xc58cff,
    },
  }[theme]

  // 沥青路面（比地面略高，避免 z-fighting）
  const roadGeo = buildStrip(trackPoints, -halfWidth, halfWidth, 0.02)
  const roadMat = new THREE.MeshStandardMaterial({
    color: trackStyle.road,
    roughness: theme === 'snow' ? 0.72 : 0.95,
    metalness: theme === 'snow' ? 0.08 : 0,
    vertexColors: false,
  })
  const road = new THREE.Mesh(roadGeo, roadMat)
  road.receiveShadow = true
  scene.add(road)

  // 红白相间路缘石（左右各一条，略抬高）
  const curbW = 1.4
  const curbA = new THREE.Color(trackStyle.curbA)
  const curbB = new THREE.Color(trackStyle.curbB)
  const curbColor = (i: number) => (i % 2 === 0 ? curbA : curbB)
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
  const dashMat = new THREE.LineDashedMaterial({
    color: trackStyle.center,
    dashSize: theme === 'snow' ? 3.2 : 2,
    gapSize: theme === 'snow' ? 2 : 2.5,
    transparent: true,
    opacity: 0.82,
  })
  const dashLine = new THREE.Line(dashGeo, dashMat)
  dashLine.computeLineDistances()
  scene.add(dashLine)

  // 起跑格线
  const { dir: startDir, perp: startPerp } = trackFrameAt(trackPoints, 0)
  const startGeo = new THREE.PlaneGeometry(trackWidth, 3)
  startGeo.rotateX(-Math.PI / 2)
  const startLine = new THREE.Mesh(
    startGeo,
    new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.8 }),
  )
  startLine.position.set(trackPoints[0].x, 0.045, trackPoints[0].z)
  startLine.rotation.y = Math.atan2(-startPerp.z, startPerp.x)
  scene.add(startLine)

  // 连续围墙：与路面共用斜接边界，不再用长方体墙段拼接。
  const wallMeshes: THREE.Mesh[] = []
  const wallHeight = RACING_TRACK.WALL_HEIGHT
  const wallMat = new THREE.MeshStandardMaterial({
    color: trackStyle.wall,
    roughness: 0.85,
    side: THREE.DoubleSide,
  })
  for (const side of [1, -1]) {
    const wall = new THREE.Mesh(
      buildWallGeometry(trackPoints, (halfWidth + 0.5) * side, wallHeight),
      wallMat,
    )
    wall.receiveShadow = true
    scene.add(wall)
    wallMeshes.push(wall)
  }
  void startDir

  // 检查点门楼
  const checkpoints: THREE.Vector3[] = []
  const gates: CheckpointGate[] = []
  const pillarGeo = new THREE.BoxGeometry(0.5, 6, 0.5)
  const barGeo = new THREE.BoxGeometry(trackWidth - 1, 0.6, 0.6)
  const checkpointIndices = checkpointPointIndices(trackPoints.length, checkpointCount)
  for (let i = 0; i < checkpointCount; i++) {
    const index = checkpointIndices[i]
    const point = trackPoints[index]
    checkpoints.push(point.clone())

    const { perp } = trackFrameAt(trackPoints, index)
    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: trackStyle.gate,
      emissive: trackStyle.gate,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    })
    const barMaterial = new THREE.MeshStandardMaterial({
      color: trackStyle.gate,
      emissive: trackStyle.gate,
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
  const itemMat = new THREE.MeshStandardMaterial({
    color: 0xff5e9c,
    emissive: 0x8f2fff,
    emissiveIntensity: 0.9,
    metalness: 0.35,
    roughness: 0.25,
  })
  for (let i = 0; i < 20; i++) {
    const kind = options.itemMode ? 'item' : 'coin'
    const mesh = new THREE.Mesh(
      kind === 'item' ? new THREE.DodecahedronGeometry(0.9) : coinGeo,
      kind === 'item' ? itemMat : coinMat,
    )
    const pointIndex = Math.floor(random() * trackPoints.length)
    const point = trackPoints[pointIndex]
    const { perp } = trackFrameAt(trackPoints, pointIndex)
    const offset = (random() - 0.5) * (trackWidth - 6)
    mesh.position.set(point.x + perp.x * offset, 1.5, point.z + perp.z * offset)
    scene.add(mesh)
    collectibles.push({ mesh, collected: false, baseY: 1.5, kind, respawnAt: 0 })
  }

  return { trackPoints, checkpoints, gates, wallMeshes, collectibles }
}

/** 环境装饰：地面、树、楼、云、远山。 */
export function buildEnvironment(
  scene: THREE.Scene,
  definition?: TrackDefinition,
  quality: QualityPreset = 'high',
): void {
  const random = definition ? seededRandom(definition.seed + 311) : Math.random
  const theme = definition?.id ?? 'forest'
  const density = quality === 'low' ? 0.45 : quality === 'medium' ? 0.72 : 1
  const groundGeo = new THREE.PlaneGeometry(800, 800)
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ color: definition?.ground ?? 0x4a7c3f, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  ground.receiveShadow = true
  scene.add(ground)

  // 树
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3)
  const trunkMat = new THREE.MeshStandardMaterial({
    color: theme === 'snow' || theme === 'ridge' ? 0x6b5b52 : 0x8b4513,
    roughness: 0.9,
  })
  const leavesGeo = new THREE.ConeGeometry(2, 4, 8)
  const leafColors =
    theme === 'desert'
      ? [0x7f8b3a, 0xa6883a, 0x6f7930]
      : theme === 'snow'
        ? [0xe9f4ff, 0xb8d3e6, 0xf7fbff]
        : theme === 'ridge'
          ? [0xc8d2e8, 0x7784aa, 0xa8b3cf]
          : [0x228b22, 0x2e9e2e, 0x1e7d32]
  const leafMats = leafColors.map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
  )
  const treeCount = theme === 'desert' ? 10 : theme === 'snow' ? 74 : theme === 'ridge' ? 52 : 96
  for (let i = 0; i < Math.round(treeCount * density); i++) {
    const tree = new THREE.Group()
    const trunk = new THREE.Mesh(trunkGeo, trunkMat)
    trunk.position.y = 1.5
    const leaves = new THREE.Mesh(leavesGeo, leafMats[i % leafMats.length])
    leaves.position.y = 4
    tree.add(trunk)
    tree.add(leaves)
    const angle = random() * Math.PI * 2
    const distance = 125 + random() * 110
    const scale = 0.8 + random() * 0.8
    tree.scale.set(scale, scale, scale)
    tree.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
    scene.add(tree)
  }

  // 楼
  for (let i = 0; i < Math.round(16 * density); i++) {
    const width = 5 + random() * 10
    const height = 10 + random() * 22
    const depth = 5 + random() * 10
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color:
          theme === 'desert'
            ? new THREE.Color().setHSL(0.06 + random() * 0.04, 0.45, 0.42 + random() * 0.18)
            : theme === 'snow' || theme === 'ridge'
              ? new THREE.Color().setHSL(0.58 + random() * 0.08, 0.2, 0.65 + random() * 0.18)
              : new THREE.Color().setHSL(0.55 + random() * 0.1, 0.15, 0.45 + random() * 0.2),
        roughness: 0.7,
      }),
    )
    mesh.position.y = height / 2
    const angle = random() * Math.PI * 2
    const distance = 170 + random() * 110
    mesh.position.set(Math.cos(angle) * distance, height / 2, Math.sin(angle) * distance)
    scene.add(mesh)
  }

  // 云（几坨压扁的白色球）
  const cloudMat = new THREE.MeshStandardMaterial({
    color:
      theme === 'desert'
        ? 0xffd5a3
        : theme === 'snow'
          ? 0xe6f5ff
          : theme === 'ridge'
            ? 0xc6cce0
            : 0xffffff,
    roughness: 1,
    transparent: true,
    opacity: theme === 'desert' ? 0.58 : theme === 'ridge' ? 0.66 : 0.9,
  })
  const cloudCount = theme === 'desert' ? 5 : theme === 'ridge' ? 8 : 12
  for (let i = 0; i < Math.round(cloudCount * density); i++) {
    const cloud = new THREE.Group()
    const puffs = 2 + Math.floor(random() * 3)
    for (let j = 0; j < puffs; j++) {
      const r = 4 + random() * 5
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat)
      puff.position.set(j * r * 1.1 - (puffs * r) / 2, random() * 2, random() * 4)
      puff.scale.y = 0.55
      cloud.add(puff)
    }
    const angle = random() * Math.PI * 2
    const distance = 60 + random() * 240
    cloud.position.set(Math.cos(angle) * distance, 48 + random() * 24, Math.sin(angle) * distance)
    scene.add(cloud)
  }

  // 远山剪影
  const mountainMat = new THREE.MeshStandardMaterial({
    color:
      theme === 'desert'
        ? 0x9d4f32
        : theme === 'snow'
          ? 0xa9c9e5
          : theme === 'ridge'
            ? 0x444a69
            : 0x526d62,
    roughness: 1,
  })
  for (let i = 0; i < Math.round(14 * density); i++) {
    const r = 30 + random() * 35
    const h = 40 + random() * 45
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mountainMat)
    const angle = (i / 14) * Math.PI * 2 + random() * 0.3
    const distance = 310 + random() * 60
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
