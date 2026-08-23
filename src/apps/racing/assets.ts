import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { FixedTrackId, QualityPreset, TrackId } from './game'

export const TRACK_ENVIRONMENT_URLS: Record<FixedTrackId, string> = {
  forest: '/assets/racing/forest/tief_etz_1k.hdr',
  desert: '/assets/racing/desert/quarry_01_1k.hdr',
  snow: '/assets/racing/snow/snowy_field_1k.hdr',
}

const TRACK_PROP_URLS: Record<FixedTrackId, [string, string]> = {
  forest: [
    '/assets/racing/props/forest/tree-oak.glb',
    '/assets/racing/props/forest/rock-large.glb',
  ],
  desert: [
    '/assets/racing/props/desert/cactus-tall.glb',
    '/assets/racing/props/desert/rock-tall.glb',
  ],
  snow: ['/assets/racing/props/snow/tree-snow-a.glb', '/assets/racing/props/snow/rocks-large.glb'],
}

const COMMON_PROP_URLS = [
  '/assets/racing/props/common/bannerTowerRed.glb',
  '/assets/racing/props/common/grandStandCovered.glb',
] as const

const propLoader = new GLTFLoader()
const environmentLoader = new HDRLoader()
const propSourceCache = new Map<string, THREE.Group>()
const propLoadPromises = new Map<string, Promise<THREE.Group | null>>()
const environmentSourceCache = new Map<FixedTrackId, THREE.DataTexture>()
const environmentLoadPromises = new Map<FixedTrackId, Promise<THREE.DataTexture | null>>()

function loadPropSource(url: string): Promise<THREE.Group | null> {
  const cached = propSourceCache.get(url)
  if (cached) return Promise.resolve(cached)
  const existing = propLoadPromises.get(url)
  if (existing) return existing
  const pending = propLoader
    .loadAsync(url)
    .then((gltf) => {
      propSourceCache.set(url, gltf.scene)
      return gltf.scene
    })
    .catch(() => null)
    .finally(() => propLoadPromises.delete(url))
  propLoadPromises.set(url, pending)
  return pending
}

function loadEnvironmentSource(trackId: FixedTrackId): Promise<THREE.DataTexture | null> {
  const cached = environmentSourceCache.get(trackId)
  if (cached) return Promise.resolve(cached)
  const existing = environmentLoadPromises.get(trackId)
  if (existing) return existing
  const pending = environmentLoader
    .loadAsync(TRACK_ENVIRONMENT_URLS[trackId])
    .then((texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping
      environmentSourceCache.set(trackId, texture)
      return texture
    })
    .catch(() => null)
    .finally(() => environmentLoadPromises.delete(trackId))
  environmentLoadPromises.set(trackId, pending)
  return pending
}

/** 赛前预取当前赛道文件；真实车模由 car.ts 直接解析缓存，避免重复请求与二次替换。 */
export async function preloadRaceAssets(
  trackId: TrackId,
  onProgress: (percent: number, label: string) => void,
): Promise<void> {
  if (trackId === 'random') {
    onProgress(100, '程序化赛道就绪')
    return
  }
  const tasks: Array<() => Promise<unknown>> = [
    async () => {
      const response = await fetch(`/assets/racing/${trackId}/manifest.json`)
      if (response.ok) await response.json()
    },
    () => loadEnvironmentSource(trackId),
    ...[...TRACK_PROP_URLS[trackId], ...COMMON_PROP_URLS].map((url) => () => loadPropSource(url)),
  ]
  let completed = 0
  onProgress(4, '准备赛车资源')
  await Promise.all(
    tasks.map(async (task) => {
      try {
        await task()
      } catch {
        // 离线、缓存写入失败或单个资源缺失都不阻止比赛。
      } finally {
        completed++
        onProgress(
          Math.round((completed / tasks.length) * 100),
          completed === tasks.length ? '资源就绪' : '载入赛道资源',
        )
      }
    }),
  )
}

function cloneModel(source: THREE.Group): THREE.Group {
  const clone = source.clone(true)
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry = object.geometry.clone()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const clonedMaterials = materials.map((material) => {
      const clonedMaterial = material.clone()
      for (const key of Object.keys(clonedMaterial)) {
        const value = (clonedMaterial as unknown as Record<string, unknown>)[key]
        if (value instanceof THREE.Texture) {
          ;(clonedMaterial as unknown as Record<string, unknown>)[key] = value.clone()
        }
      }
      return clonedMaterial
    })
    object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0]
  })
  return clone
}

function normalizeModel(root: THREE.Group, targetHeight: number) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  const bounds = new THREE.Box3().setFromObject(root)
  const height = Math.max(bounds.max.y - bounds.min.y, 0.001)
  root.scale.setScalar(targetHeight / height)
  const scaled = new THREE.Box3().setFromObject(root)
  root.position.y = -scaled.min.y
}

function disposeModel(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
}

/** 把每个主题实际用到的 CC0 道具实例化到赛道边，低画质自动减少实例数。 */
export async function loadTrackProps(
  scene: THREE.Scene,
  trackId: TrackId,
  points: THREE.Vector3[],
  trackWidth: number,
  quality: QualityPreset,
  cancelled: () => boolean,
): Promise<void> {
  if (trackId === 'random' || points.length === 0) return
  try {
    const sources = await Promise.all([
      loadPropSource(TRACK_PROP_URLS[trackId][0]),
      loadPropSource(TRACK_PROP_URLS[trackId][1]),
      loadPropSource(COMMON_PROP_URLS[0]),
      loadPropSource(COMMON_PROP_URLS[1]),
    ])
    if (sources.some((source) => !source) || cancelled()) return
    const [themeA, themeB, banner, grandstand] = sources.map((source) => cloneModel(source!))
    if (cancelled()) {
      ;[themeA, themeB, banner, grandstand].forEach(disposeModel)
      return
    }
    normalizeModel(themeA, trackId === 'desert' ? 8 : 11)
    normalizeModel(themeB, 5)
    normalizeModel(banner, 8)
    normalizeModel(grandstand, 7)

    const count = quality === 'low' ? 12 : quality === 'medium' ? 20 : 30
    for (let i = 0; i < count; i++) {
      const template = i % 4 === 0 ? themeB : themeA
      const instance = cloneModel(template)
      const index = Math.floor((i / count) * points.length)
      const point = points[index]
      const next = points[(index + 1) % points.length]
      const dx = next.x - point.x
      const dz = next.z - point.z
      const length = Math.hypot(dx, dz) || 1
      const side = i % 2 === 0 ? 1 : -1
      const offset = trackWidth / 2 + 5 + (i % 3) * 3
      instance.position.x += point.x + (-dz / length) * offset * side
      instance.position.z += point.z + (dx / length) * offset * side
      instance.rotation.y = (i * 2.399) % (Math.PI * 2)
      scene.add(instance)
    }

    const start = points[0]
    const next = points[1]
    const dx = next.x - start.x
    const dz = next.z - start.z
    const length = Math.hypot(dx, dz) || 1
    banner.position.x += start.x + (-dz / length) * (trackWidth / 2 + 7)
    banner.position.z += start.z + (dx / length) * (trackWidth / 2 + 7)
    banner.rotation.y = Math.atan2(dx, dz)
    scene.add(banner)
    grandstand.position.x += start.x - (-dz / length) * (trackWidth / 2 + 15)
    grandstand.position.z += start.z - (dx / length) * (trackWidth / 2 + 15)
    grandstand.rotation.y = Math.atan2(dx, dz) + Math.PI
    scene.add(grandstand)
    disposeModel(themeA)
    disposeModel(themeB)
  } catch {
    // 程序化环境始终存在，素材加载失败只减少装饰密度。
  }
}

export async function loadTrackEnvironment(trackId: TrackId): Promise<THREE.DataTexture | null> {
  if (trackId === 'random') return null
  const source = await loadEnvironmentSource(trackId)
  if (!source) return null
  const texture = source.clone()
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.needsUpdate = true
  return texture
}
