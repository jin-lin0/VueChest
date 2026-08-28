import type {
  Bullet,
  Enemy,
  FloatingText,
  GameInput,
  Particle,
  Pickup,
  Player,
  Star,
  Vector,
} from './types'

const TAU = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

export interface NeonRenderFrame {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
  worldWidth: number
  worldHeight: number
  camera: Vector
  screenShake: number
  damageFlash: number
  vignetteGradient: CanvasGradient | null
  elapsed: number
  reducedEffects: boolean
  stars: Star[]
  pickups: Pickup[]
  bullets: Bullet[]
  enemies: Enemy[]
  player: Player
  particles: Particle[]
  texts: FloatingText[]
  input: GameInput
}

const renderers = new WeakMap<CanvasRenderingContext2D, FrameRenderer>()

export function renderNeonFrame(frame: NeonRenderFrame) {
  let renderer = renderers.get(frame.ctx)
  if (!renderer) {
    renderer = new FrameRenderer()
    renderers.set(frame.ctx, renderer)
  }
  renderer.draw(frame)
}

class FrameRenderer {
  private frame!: NeonRenderFrame

  draw(frame: NeonRenderFrame) {
    this.frame = frame
    const { ctx, dpr, width, height } = this.frame
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#050813'
    ctx.fillRect(0, 0, width, height)

    const shakeX = this.frame.screenShake
      ? randomBetween(-this.frame.screenShake, this.frame.screenShake)
      : 0
    const shakeY = this.frame.screenShake
      ? randomBetween(-this.frame.screenShake, this.frame.screenShake)
      : 0
    ctx.save()
    ctx.translate(shakeX, shakeY)
    this.drawBackground()
    this.drawPickups()
    this.drawBullets()
    this.drawEnemies()
    this.drawPlayer()
    this.drawParticles()
    ctx.restore()

    if (this.frame.vignetteGradient) {
      ctx.fillStyle = this.frame.vignetteGradient
      ctx.fillRect(0, 0, width, height)
    }
    if (this.frame.damageFlash > 0) {
      ctx.fillStyle = `rgba(255, 40, 93, ${this.frame.damageFlash * 0.2})`
      ctx.fillRect(0, 0, width, height)
    }
  }

  private drawBackground() {
    const { ctx, camera, width, height, elapsed, worldWidth, worldHeight } = this.frame
    const nebulae = [
      { x: 650, y: 500, color: 'rgba(95, 59, 255, .15)', radius: 520 },
      { x: 2850, y: 520, color: 'rgba(0, 229, 255, .11)', radius: 600 },
      { x: 2650, y: 1950, color: 'rgba(255, 41, 174, .1)', radius: 650 },
    ]
    for (const nebula of nebulae) {
      const x = nebula.x - camera.x
      const y = nebula.y - camera.y
      if (
        x < -nebula.radius ||
        y < -nebula.radius ||
        x > width + nebula.radius ||
        y > height + nebula.radius
      ) {
        continue
      }
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, nebula.radius)
      gradient.addColorStop(0, nebula.color)
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(x - nebula.radius, y - nebula.radius, nebula.radius * 2, nebula.radius * 2)
    }

    for (const star of this.frame.stars) {
      const x = star.x - camera.x * star.layer
      const y = star.y - camera.y * star.layer
      if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue
      const pulse = 0.72 + Math.sin(elapsed * (1 + star.layer) + star.x) * 0.24
      ctx.fillStyle = `rgba(196, 235, 255, ${star.alpha * pulse})`
      ctx.beginPath()
      ctx.arc(x, y, star.size, 0, TAU)
      ctx.fill()
    }

    const grid = 72
    const offsetX = -((camera.x * 0.6) % grid)
    const offsetY = -((camera.y * 0.6) % grid)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(91, 134, 188, 0.075)'
    ctx.beginPath()
    for (let x = offsetX; x < width; x += grid) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    for (let y = offsetY; y < height; y += grid) {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()

    ctx.strokeStyle = 'rgba(93, 244, 255, 0.22)'
    ctx.lineWidth = 2
    ctx.strokeRect(-camera.x, -camera.y, worldWidth, worldHeight)
  }

  private drawPickups() {
    const { ctx, camera, width, height, reducedEffects } = this.frame
    for (const pickup of this.frame.pickups) {
      const x = pickup.x - camera.x
      const y = pickup.y - camera.y + Math.sin(pickup.phase) * 3
      if (x < -24 || y < -24 || x > width + 24 || y > height + 24) continue
      const color = pickup.kind === 'xp' ? '#5fffe0' : '#78ff8f'
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(pickup.phase * 0.35)
      ctx.shadowColor = color
      ctx.shadowBlur = reducedEffects ? 0 : 10
      ctx.fillStyle = color
      if (pickup.kind === 'xp') {
        ctx.beginPath()
        ctx.moveTo(0, -pickup.radius)
        ctx.lineTo(pickup.radius, 0)
        ctx.lineTo(0, pickup.radius)
        ctx.lineTo(-pickup.radius, 0)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillRect(-2.5, -pickup.radius, 5, pickup.radius * 2)
        ctx.fillRect(-pickup.radius, -2.5, pickup.radius * 2, 5)
      }
      ctx.restore()
    }
  }

  private drawBullets() {
    const { ctx, camera, width, height, reducedEffects } = this.frame
    ctx.lineCap = 'round'
    ctx.shadowBlur = reducedEffects ? 0 : 8
    for (const bullet of this.frame.bullets) {
      if (bullet.life <= 0) continue
      const x = bullet.x - camera.x
      const y = bullet.y - camera.y
      if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue

      const velocity = Math.hypot(bullet.vx, bullet.vy) || 1
      const trailLength = bullet.enemy ? 17 : 24
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - (bullet.vx / velocity) * trailLength, y - (bullet.vy / velocity) * trailLength)
      ctx.strokeStyle = bullet.enemy ? 'rgba(255, 66, 151, .34)' : 'rgba(90, 245, 255, .36)'
      ctx.lineWidth = bullet.radius * 1.05
      ctx.stroke()

      ctx.shadowColor = bullet.color
      ctx.fillStyle = bullet.color
      ctx.beginPath()
      ctx.arc(x, y, bullet.radius, 0, TAU)
      ctx.fill()
    }
    ctx.shadowBlur = 0
  }

  private drawEnemies() {
    const { camera, width, height } = this.frame
    for (const enemy of this.frame.enemies) {
      const x = enemy.x - camera.x
      const y = enemy.y - camera.y
      if (x < -100 || y < -100 || x > width + 100 || y > height + 100) continue
      this.drawEnemy(enemy, x, y)
    }
  }

  private drawEnemy(enemy: Enemy, x: number, y: number) {
    const { ctx, elapsed, reducedEffects } = this.frame
    const color = enemy.hitFlash > 0 ? '#ffffff' : enemy.color
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(enemy.angle)
    ctx.shadowColor = enemy.color
    ctx.shadowBlur =
      reducedEffects && !enemy.elite && enemy.kind !== 'boss'
        ? 0
        : enemy.elite
          ? 20
          : enemy.kind === 'boss'
            ? 26
            : 10
    ctx.lineWidth = enemy.elite ? 3 : 2
    ctx.strokeStyle = color
    ctx.fillStyle = `${enemy.color}26`

    if (enemy.kind === 'drone') {
      this.polygonPath(6, enemy.radius, Math.PI / 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = color
      ctx.fillRect(-enemy.radius * 0.2, -3, enemy.radius * 1.25, 6)
    } else if (enemy.kind === 'brute') {
      ctx.rotate(elapsed * 0.25)
      ctx.strokeRect(
        -enemy.radius * 0.72,
        -enemy.radius * 0.72,
        enemy.radius * 1.44,
        enemy.radius * 1.44,
      )
      ctx.rotate(-elapsed * 0.5)
      ctx.strokeRect(
        -enemy.radius * 0.48,
        -enemy.radius * 0.48,
        enemy.radius * 0.96,
        enemy.radius * 0.96,
      )
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(0, 0, 5, 0, TAU)
      ctx.fill()
    } else if (enemy.kind === 'shooter') {
      this.polygonPath(3, enemy.radius, 0)
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = '#f2d7ff'
      ctx.beginPath()
      ctx.arc(0, 0, enemy.radius * 0.43, 0, TAU)
      ctx.stroke()
    } else if (enemy.kind === 'splitter') {
      ctx.rotate(Math.PI / 4 + Math.sin(elapsed * 3 + enemy.orbit) * 0.14)
      ctx.strokeRect(
        -enemy.radius * 0.62,
        -enemy.radius * 0.62,
        enemy.radius * 1.24,
        enemy.radius * 1.24,
      )
      ctx.fillRect(-5, -5, 10, 10)
    } else {
      ctx.rotate(elapsed * 0.32)
      this.polygonPath(8, enemy.radius, 0)
      ctx.fill()
      ctx.stroke()
      ctx.rotate(-elapsed * 0.78)
      ctx.strokeStyle = '#ffb1f0'
      this.polygonPath(6, enemy.radius * 0.68, 0)
      ctx.stroke()
      ctx.rotate(elapsed * 0.46)
      ctx.fillStyle = '#fff'
      ctx.shadowBlur = 32
      ctx.beginPath()
      ctx.arc(0, 0, 11 + Math.sin(elapsed * 5) * 2, 0, TAU)
      ctx.fill()
    }

    if (enemy.elite) {
      ctx.rotate(-enemy.angle + elapsed * 0.8)
      ctx.strokeStyle = '#ffe06b'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 7])
      ctx.beginPath()
      ctx.arc(0, 0, enemy.radius + 7, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.restore()

    if (enemy.hp < enemy.maxHp && enemy.kind !== 'boss') {
      const width = enemy.radius * 2
      this.drawBar(x - width / 2, y - enemy.radius - 11, width, 3, enemy.hp / enemy.maxHp, enemy.color)
    }
  }

  private drawPlayer() {
    const { ctx, player, camera, elapsed, input } = this.frame
    const x = player.x - camera.x
    const y = player.y - camera.y
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(player.angle)
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 20) % 2 === 0) {
      ctx.globalAlpha = 0.46
    }

    ctx.shadowColor = '#58f5ff'
    ctx.shadowBlur = 24
    ctx.strokeStyle = '#b9fbff'
    ctx.fillStyle = 'rgba(50, 197, 255, .18)'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(24, 0)
    ctx.lineTo(-13, 14)
    ctx.lineTo(-7, 0)
    ctx.lineTo(-13, -14)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    const exhaust = 8 + Math.sin(elapsed * 24) * 3
    const exhaustGradient = ctx.createLinearGradient(-6, 0, -30 - exhaust, 0)
    exhaustGradient.addColorStop(0, '#ecfdff')
    exhaustGradient.addColorStop(0.35, '#62f4ff')
    exhaustGradient.addColorStop(1, 'rgba(99, 74, 255, 0)')
    ctx.fillStyle = exhaustGradient
    ctx.beginPath()
    ctx.moveTo(-8, -5)
    ctx.lineTo(-28 - exhaust, 0)
    ctx.lineTo(-8, 5)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.shadowBlur = 18
    ctx.beginPath()
    ctx.arc(2, 0, 5.5, 0, TAU)
    ctx.fill()
    ctx.restore()

    if (player.dashTimer <= 0) {
      ctx.strokeStyle = 'rgba(102, 246, 255, .45)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, player.radius + 8 + Math.sin(elapsed * 4) * 2, 0, TAU)
      ctx.stroke()
    }

    if (input.pointerActive && !input.touchAiming) this.drawCrosshair()
  }

  private drawCrosshair() {
    const { ctx, input, elapsed } = this.frame
    const { x, y } = input.pointer
    const radius = 10 + Math.sin(elapsed * 8) * 1.5
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = 'rgba(137, 250, 255, .8)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = '#65f4ff'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, TAU)
    ctx.moveTo(-radius - 7, 0)
    ctx.lineTo(-radius + 2, 0)
    ctx.moveTo(radius - 2, 0)
    ctx.lineTo(radius + 7, 0)
    ctx.moveTo(0, -radius - 7)
    ctx.lineTo(0, -radius + 2)
    ctx.moveTo(0, radius - 2)
    ctx.lineTo(0, radius + 7)
    ctx.stroke()
    ctx.restore()
  }

  private drawParticles() {
    const { ctx, camera, width, height, reducedEffects } = this.frame
    ctx.globalCompositeOperation = 'lighter'
    for (const particle of this.frame.particles) {
      const x = particle.x - camera.x
      const y = particle.y - camera.y
      if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue
      const alpha = clamp(particle.life / particle.maxLife, 0, 1)
      ctx.globalAlpha = alpha
      ctx.fillStyle = particle.color
      ctx.beginPath()
      ctx.arc(x, y, particle.size * (0.4 + alpha * 0.6), 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const text of this.frame.texts) {
      ctx.globalAlpha = clamp(text.life * 2, 0, 1)
      ctx.fillStyle = text.color
      ctx.font = `700 ${text.size}px Inter, system-ui, sans-serif`
      ctx.shadowColor = text.color
      ctx.shadowBlur = reducedEffects ? 0 : 8
      ctx.fillText(text.text, text.x - camera.x, text.y - camera.y)
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }

  private polygonPath(sides: number, radius: number, offset: number) {
    const { ctx } = this.frame
    ctx.beginPath()
    for (let index = 0; index < sides; index++) {
      const angle = offset + (index / sides) * TAU
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  private drawBar(
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    color: string,
  ) {
    const { ctx } = this.frame
    ctx.fillStyle = 'rgba(0, 0, 0, .55)'
    ctx.fillRect(x, y, width, height)
    ctx.fillStyle = color
    ctx.fillRect(x, y, width * clamp(ratio, 0, 1), height)
  }
}
