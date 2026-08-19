// racing 选车 3D 展厅：独立小场景 + 独立 renderer，把 buildCarMesh 的真车模搬上旋转展台。
// 只服务菜单界面：start()/stop() 由 App.vue 按 gameState 控制，组件卸载时 dispose()。
import * as THREE from 'three'
import { buildCarMesh } from './car'
import { disposeObject } from './track'
import type { RacingCar } from './config'

/** 展台槽位：转盘 + 车 + 发光环 + 交换动画状态机。 */
interface ShowroomSlot {
  root: THREE.Group
  pivot: THREE.Group
  ringMat: THREE.MeshStandardMaterial
  ringColor: THREE.Color
  car: THREE.Group | null
  carId: number
  /** 交换动画进度（0..1），1 = 空闲 */
  swapT: number
  /** 本次交换是否已在中点完成新旧车替换 */
  swapped: boolean
  pendingCar: RacingCar | null
  /** 换车时的额外转速，随时间指数衰减 */
  spinBoost: number
  x: number
  targetX: number
}

const ROT_SPEED = 0.55 // 展台基础转速（rad/s）
const SWAP_DURATION = 0.55 // 换车动画时长（秒）
const DOUBLE_X = 2.7 // 双展台（本地双人）时的横向偏移

/** 回弹缓动：换车登场时轻微 overshoot，更有弹性 */
function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export class CarShowroom {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private slots: ShowroomSlot[]
  private slotCount: 1 | 2 = 1
  private rafId = 0
  private running = false
  private lastTime = 0
  private elapsed = 0
  private resizeObserver: ResizeObserver

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // 上下文丢失时阻止默认行为，浏览器才会触发 restored 让 three 自动重建
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault())

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    this.camera.position.set(0, 3.8, 11)

    // 灯光：半球光打底 + 主平行光（投影）+ 冷色轮廓光，小场景阴影相机 ±8 即可
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2038, 0.9))
    const key = new THREE.DirectionalLight(0xfff2dd, 2.2)
    key.position.set(5, 10, 6)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -8
    key.shadow.camera.right = 8
    key.shadow.camera.top = 8
    key.shadow.camera.bottom = -8
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x88aaff, 1.2)
    rim.position.set(-6, 4, -8)
    this.scene.add(rim)

    // 地面 + 极坐标网格（展厅氛围）
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: 0x11162e, roughness: 0.85, metalness: 0.25 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
    const grid = new THREE.PolarGridHelper(9, 12, 5, 48, 0x2a3560, 0x1c2444)
    grid.position.y = 0.01
    this.scene.add(grid)

    this.slots = [this.makeSlot(), this.makeSlot()]
    this.slots.forEach((s) => this.scene.add(s.root))
    this.applyLayout(true)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  /** 切换展台数量：单人 1 个居中，双人 2 个并排（横移带平滑）。 */
  setSlots(count: 1 | 2): void {
    this.slotCount = count
    this.applyLayout()
  }

  /** 换车：触发放大登场/缩小退场动画；同 id 幂等。 */
  setCar(index: number, config: RacingCar): void {
    const slot = this.slots[index]
    if (!slot || slot.carId === config.id) return
    slot.pendingCar = config
    slot.carId = config.id
    // 首次出场直接走动画后半段（从 0 弹出来）；之后走完整"缩没→换新→弹出"
    slot.swapT = slot.car ? 0 : 0.5
    slot.swapped = false
    slot.spinBoost = 7
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    const loop = () => {
      if (!this.running) return
      this.rafId = requestAnimationFrame(loop)
      const now = performance.now()
      // clamp 大步长，防止切后台回来动画跳变
      const delta = Math.min((now - this.lastTime) / 1000, 0.05)
      this.lastTime = now
      this.elapsed += delta
      this.update(delta)
      this.renderer.render(this.scene, this.camera)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  dispose(): void {
    this.stop()
    this.resizeObserver.disconnect()
    disposeObject(this.scene)
    this.renderer.dispose()
  }

  private makeSlot(): ShowroomSlot {
    const root = new THREE.Group()

    // 展台底座
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.8, 0.3, 48),
      new THREE.MeshStandardMaterial({ color: 0x1c2444, roughness: 0.4, metalness: 0.7 }),
    )
    podium.position.y = 0.15
    podium.receiveShadow = true
    root.add(podium)

    // 发光环（颜色跟随当前赛车）
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d1f,
      emissive: 0xffffff,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      metalness: 0.2,
    })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.055, 12, 64), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.31
    root.add(ring)

    const pivot = new THREE.Group()
    pivot.position.y = 0.3
    root.add(pivot)

    return {
      root,
      pivot,
      ringMat,
      ringColor: new THREE.Color(0xffffff),
      car: null,
      carId: -1,
      swapT: 1,
      swapped: true,
      pendingCar: null,
      spinBoost: 0,
      x: 0,
      targetX: 0,
    }
  }

  private applyLayout(snap = false): void {
    this.slots.forEach((slot, i) => {
      slot.root.visible = i < this.slotCount
      slot.targetX = this.slotCount === 1 ? 0 : i === 0 ? -DOUBLE_X : DOUBLE_X
      if (snap) {
        slot.x = slot.targetX
        slot.root.position.x = slot.x
      }
    })
  }

  /** 中点换车：释放旧车 GPU 资源再挂新车，防止反复切换导致显存泄漏 */
  private attachCar(slot: ShowroomSlot, config: RacingCar): void {
    if (slot.car) {
      slot.pivot.remove(slot.car)
      disposeObject(slot.car)
    }
    slot.car = buildCarMesh(config).group
    slot.pivot.add(slot.car)
    slot.ringColor.set(config.color)
  }

  private update(delta: number): void {
    for (const slot of this.slots) {
      if (!slot.root.visible) continue

      // 单/双展台布局切换时横移平滑过渡
      slot.x += (slot.targetX - slot.x) * (1 - Math.exp(-8 * delta))
      slot.root.position.x = slot.x

      // 转盘：基础转速 + 换车加速，加速随时间衰减
      slot.spinBoost *= Math.exp(-3 * delta)
      slot.root.rotation.y += (ROT_SPEED + slot.spinBoost) * delta

      // 发光环：颜色向当前车渐变 + 呼吸脉动
      slot.ringMat.emissive.lerp(slot.ringColor, 1 - Math.exp(-10 * delta))
      slot.ringMat.emissiveIntensity = 1.3 + Math.sin(this.elapsed * 3) * 0.4

      // 换车动画：前半段缩小退场 → 中点换新 → 后半段回弹登场
      if (slot.swapT < 1) {
        slot.swapT = Math.min(1, slot.swapT + delta / SWAP_DURATION)
        if (!slot.swapped && slot.swapT >= 0.5 && slot.pendingCar) {
          this.attachCar(slot, slot.pendingCar)
          slot.pendingCar = null
          slot.swapped = true
        }
        const scale =
          slot.swapT < 0.5
            ? Math.max(1 - slot.swapT * 2, 0)
            : Math.max(easeOutBack((slot.swapT - 0.5) * 2), 0.001)
        slot.pivot.scale.setScalar(scale)
      }
    }

    // 相机轻微漂移，画面更活
    this.camera.position.x = Math.sin(this.elapsed * 0.3) * 0.5
    this.camera.lookAt(0, 1.1, 0)
  }

  private resize(): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }
}
