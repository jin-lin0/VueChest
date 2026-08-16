// racing 轻量粒子系统：漂移烟雾 / 碰撞火花。对象池复用 Mesh，避免每帧 new。
import * as THREE from 'three'

interface Particle {
  mesh: THREE.Mesh
  life: number
  maxLife: number
  vx: number
  vy: number
  vz: number
  grow: number
  gravity: number
  startOpacity: number
}

const MAX_PARTICLES = 160

export class ParticleSystem {
  private scene: THREE.Scene
  private active: Particle[] = []
  private pool: THREE.Mesh[] = []
  private smokeGeo = new THREE.PlaneGeometry(1, 1)
  private sparkGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18)

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  private acquire(geometry: THREE.BufferGeometry, color: number, opacity: number): THREE.Mesh | null {
    if (this.active.length >= MAX_PARTICLES) return null
    const mesh = this.pool.pop() || new THREE.Mesh()
    mesh.geometry = geometry
    mesh.material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    })
    mesh.visible = true
    this.scene.add(mesh)
    return mesh
  }

  /** 漂移烟雾：缓慢上升、变大、淡出。 */
  spawnSmoke(x: number, y: number, z: number): void {
    const mesh = this.acquire(this.smokeGeo, 0xcccccc, 0.45)
    if (!mesh) return
    mesh.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6)
    mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI)
    const s = 0.6 + Math.random() * 0.5
    mesh.scale.set(s, s, s)
    this.active.push({
      mesh,
      life: 0,
      maxLife: 0.7 + Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 1.2,
      vy: 1.2 + Math.random(),
      vz: (Math.random() - 0.5) * 1.2,
      grow: 2.2,
      gravity: 0,
      startOpacity: 0.45,
    })
  }

  /** 碰撞火花：向外溅射、受重力下落。 */
  spawnSparks(x: number, y: number, z: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      const mesh = this.acquire(this.sparkGeo, Math.random() > 0.4 ? 0xffcc44 : 0xff7733, 1)
      if (!mesh) return
      mesh.position.set(x, y, z)
      const angle = Math.random() * Math.PI * 2
      const speed = 4 + Math.random() * 7
      this.active.push({
        mesh,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
        vx: Math.cos(angle) * speed,
        vy: 2 + Math.random() * 4,
        vz: Math.sin(angle) * speed,
        grow: 0,
        gravity: 18,
        startOpacity: 1,
      })
    }
  }

  update(delta: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]
      p.life += delta
      if (p.life >= p.maxLife) {
        p.mesh.visible = false
        this.scene.remove(p.mesh)
        ;(p.mesh.material as THREE.Material).dispose()
        this.pool.push(p.mesh)
        this.active.splice(i, 1)
        continue
      }
      const t = p.life / p.maxLife
      p.vy -= p.gravity * delta
      p.mesh.position.x += p.vx * delta
      p.mesh.position.y += p.vy * delta
      p.mesh.position.z += p.vz * delta
      if (p.grow > 0) {
        const s = p.mesh.scale.x + p.grow * delta
        p.mesh.scale.set(s, s, s)
      }
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = p.startOpacity * (1 - t)
    }
  }

  /** 换场/重开时清空所有粒子（保留池）。 */
  clear(): void {
    for (const p of this.active) {
      p.mesh.visible = false
      this.scene.remove(p.mesh)
      ;(p.mesh.material as THREE.Material).dispose()
      this.pool.push(p.mesh)
    }
    this.active.length = 0
  }

  /** 场景销毁前调用：清空粒子并释放共享几何体。 */
  dispose(): void {
    this.clear()
    this.smokeGeo.dispose()
    this.sparkGeo.dispose()
  }
}
