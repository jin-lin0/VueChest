// racing 赛车模型：升级版低多边形 F1/卡丁车造型，含尾翼、座舱、轮毂、排气管与氮气火焰。
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { RacingCar } from './config'
import type { LiveryId } from './game'

const CAR_MODEL_URLS: Record<number, string> = {
  1: '/assets/racing/cars/lightning.glb',
  2: '/assets/racing/cars/storm.glb',
  3: '/assets/racing/cars/blaze.glb',
  4: '/assets/racing/cars/phantom.glb',
}

const carLoader = new GLTFLoader()
const loadedCarSources = new Map<number, THREE.Group>()
const failedCarSources = new Set<number>()
const carLoadPromises = new Map<number, Promise<void>>()
const liveryTextureCanvases = new Map<string, HTMLCanvasElement>()

const LIVERY_COLORS: Record<LiveryId, [string, string]> = {
  classic: ['#ffffff', '#1b2233'],
  duotone: ['#fff2cf', '#273c75'],
  sandstorm: ['#f2a65a', '#693f2f'],
  glacier: ['#c9f7ff', '#5577ff'],
  'champion-metal': ['#ffe27a', '#8f6b18'],
  'champion-stripe': ['#fff4d6', '#e43f5a'],
}

function buildLiveryTexture(
  source: THREE.Texture,
  config: RacingCar,
  livery: LiveryId,
): THREE.Texture {
  const key = `${config.id}:${livery}`
  let canvas = liveryTextureCanvases.get(key)
  if (!canvas) {
    const image = source.image as CanvasImageSource & { width?: number; height?: number }
    const width = image.width ?? 512
    const height = image.height ?? 512
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(image, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height)
    const primary = new THREE.Color(livery === 'classic' ? config.color : LIVERY_COLORS[livery][0])
    const secondary = new THREE.Color(LIVERY_COLORS[livery][1])
    const primaryHex = primary.getHex(THREE.SRGBColorSpace)
    const secondaryHex = secondary.getHex(THREE.SRGBColorSpace)
    const primaryRgb = [(primaryHex >> 16) & 255, (primaryHex >> 8) & 255, primaryHex & 255]
    const secondaryRgb = [(secondaryHex >> 16) & 255, (secondaryHex >> 8) & 255, secondaryHex & 255]
    const cells = 4

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const red = pixels.data[offset]
        const green = pixels.data[offset + 1]
        const blue = pixels.data[offset + 2]
        const max = Math.max(red, green, blue)
        const min = Math.min(red, green, blue)
        // 黑色轮胎、深色玻璃与金属件保留原色，只重绘车身使用的彩色色块。
        if (max < 58 || max - min < 24) continue
        const cellX = Math.min(cells - 1, Math.floor((x / width) * cells))
        const cellY = Math.min(cells - 1, Math.floor((y / height) * cells))
        const warmPaletteCell = red >= green && red >= blue
        const useSecondary =
          livery !== 'classic' &&
          (livery === 'champion-stripe'
            ? cellX === 1 || cellX === 2
            : warmPaletteCell || (cellX + cellY + config.id) % 4 === 0)
        const target = useSecondary ? secondaryRgb : primaryRgb
        const shade = 0.68 + (max / 255) * 0.38
        pixels.data[offset] = Math.min(255, target[0] * shade)
        pixels.data[offset + 1] = Math.min(255, target[1] * shade)
        pixels.data[offset + 2] = Math.min(255, target[2] * shade)
      }
    }
    context.putImageData(pixels, 0, 0)
    liveryTextureCanvases.set(key, canvas)
  }

  const texture = source.clone()
  texture.image = canvas
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function applyLivery(root: THREE.Object3D, config: RacingCar, livery: LiveryId) {
  const [primaryHex, secondaryHex] = LIVERY_COLORS[livery]
  const primary = livery === 'classic' ? new THREE.Color(config.color) : new THREE.Color(primaryHex)
  const secondary = new THREE.Color(secondaryHex)
  let index = 0
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    // 每个实例独占可释放的 geometry/material/texture；否则销毁一辆车会连带
    // 破坏缓存源模型与其他车辆实例。
    object.geometry = object.geometry.clone()
    object.castShadow = true
    object.receiveShadow = true
    const source = Array.isArray(object.material) ? object.material : [object.material]
    const materials = source.map((material) => {
      const clone = material.clone()
      for (const key of Object.keys(clone)) {
        const value = (clone as unknown as Record<string, unknown>)[key]
        if (value instanceof THREE.Texture) {
          ;(clone as unknown as Record<string, unknown>)[key] = value.clone()
        }
      }
      const colorMaterial = clone as THREE.Material & {
        color?: THREE.Color
        metalness?: number
        roughness?: number
        map?: THREE.Texture | null
      }
      if (colorMaterial.color instanceof THREE.Color) {
        const name = `${object.name} ${clone.name}`.toLowerCase()
        const protectedPart = /wheel|tire|glass|window|light|driver/.test(name)
        if (!protectedPart && colorMaterial.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.14) {
          const sourceMap = (material as typeof colorMaterial).map
          if (sourceMap) {
            colorMaterial.map?.dispose()
            colorMaterial.map = buildLiveryTexture(sourceMap, config, livery)
            colorMaterial.color.set(0xffffff)
          } else {
            colorMaterial.color.copy(index++ % 4 === 0 ? secondary : primary)
          }
          if (typeof colorMaterial.metalness === 'number') {
            colorMaterial.metalness = livery.includes('champion')
              ? 0.82
              : Math.max(colorMaterial.metalness, 0.35)
          }
          if (typeof colorMaterial.roughness === 'number') {
            colorMaterial.roughness = livery.includes('champion')
              ? 0.2
              : Math.min(colorMaterial.roughness, 0.48)
          }
        }
      }
      return clone
    })
    object.material = Array.isArray(object.material) ? materials : materials[0]
  })
}

/** 解析并缓存真实 CC0 车模。同一辆车在展厅、比赛和幽灵间只解析一次。 */
export async function preloadCarModels(
  carIds: number[],
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  const ids = [...new Set(carIds)].filter((id) => CAR_MODEL_URLS[id])
  let completed = 0
  await Promise.all(
    ids.map(async (id) => {
      if (!loadedCarSources.has(id) && !failedCarSources.has(id)) {
        let pending = carLoadPromises.get(id)
        if (!pending) {
          pending = carLoader
            .loadAsync(CAR_MODEL_URLS[id])
            .then((gltf) => {
              loadedCarSources.set(id, gltf.scene)
            })
            .catch(() => {
              failedCarSources.add(id)
            })
            .finally(() => {
              carLoadPromises.delete(id)
            })
          carLoadPromises.set(id, pending)
        }
        await pending
      }
      completed++
      onProgress?.(completed, ids.length)
    }),
  )
}

export function hasCarModelFailed(carId: number): boolean {
  return failedCarSources.has(carId)
}

export interface CarMeshes {
  group: THREE.Group
  /** 氮气火焰锥（默认隐藏，氮气时显示并脉动） */
  nitroFlame: THREE.Mesh
  /** 四个车轮，用于行驶中滚动 */
  wheels: THREE.Mesh[]
}

function buildNitroFlame(): THREE.Mesh {
  const flameGeo = new THREE.ConeGeometry(0.26, 1.4, 10)
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const nitroFlame = new THREE.Mesh(flameGeo, flameMat)
  nitroFlame.rotation.x = -Math.PI / 2
  nitroFlame.position.set(0, 0.5, -2.6)
  nitroFlame.visible = false
  nitroFlame.userData.racingEffect = true
  return nitroFlame
}

/**
 * 从已解析缓存同步创建真实车模。资源尚未就绪时返回 null，绝不先创建旧车再替换。
 */
export function buildLoadedCarMesh(config: RacingCar, livery: LiveryId): CarMeshes | null {
  const source = loadedCarSources.get(config.id)
  if (!source) return null

  const car = new THREE.Group()
  const model = source.clone(true)
  applyLivery(model, config, livery)
  const bounds = new THREE.Box3().setFromObject(model)
  const size = bounds.getSize(new THREE.Vector3())
  const scale = 4.4 / Math.max(size.z, size.x, 0.001)
  model.scale.setScalar(scale)
  model.rotation.y = Math.PI
  const centered = new THREE.Box3().setFromObject(model)
  const center = centered.getCenter(new THREE.Vector3())
  model.position.set(-center.x, -centered.min.y, -center.z)
  model.userData.racingVisual = true
  car.add(model)

  const wheels: THREE.Mesh[] = []
  model.traverse((object) => {
    if (object instanceof THREE.Mesh && /wheel|tire/i.test(object.name)) wheels.push(object)
  })
  const nitroFlame = buildNitroFlame()
  car.add(nitroFlame)
  return { group: car, nitroFlame, wheels }
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
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    metalness: 0.6,
    roughness: 0.4,
  })
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
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x555555,
    metalness: 0.9,
    roughness: 0.3,
  })
  const exhaustL = new THREE.Mesh(exhaustGeo, exhaustMat)
  exhaustL.rotation.x = Math.PI / 2
  exhaustL.position.set(-0.35, 0.5, -2.15)
  const exhaustR = new THREE.Mesh(exhaustGeo, exhaustMat)
  exhaustR.rotation.x = Math.PI / 2
  exhaustR.position.set(0.35, 0.5, -2.15)
  car.add(exhaustL)
  car.add(exhaustR)

  // 氮气火焰（默认隐藏）
  const nitroFlame = buildNitroFlame()
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
