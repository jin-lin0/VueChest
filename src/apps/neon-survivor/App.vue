<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getStorage, setStorage } from '@/lib/storage'
import { BOSS_TIMES, NeonSurvivorEngine } from './engine'
import type {
  Difficulty,
  EngineCallbacks,
  GameHud,
  GamePhase,
  RunSummary,
  UpgradeOption,
} from './types'

defineOptions({ name: 'NeonSurvivorApp' })

const BEST_SCORE_KEY = 'neon-survivor:best-score'
const SOUND_KEY = 'neon-survivor:sound'

const router = useRouter()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const phase = ref<GamePhase>('menu')
const difficulty = ref<Difficulty>('normal')
const soundEnabled = ref(getStorage<boolean>(SOUND_KEY, true) !== false)
const bestScore = ref(getStorage<number>(BEST_SCORE_KEY, 0) || 0)
const upgradeOptions = ref<UpgradeOption[]>([])
const summary = ref<RunSummary | null>(null)
const isTouch = ref(false)
const moveKnob = ref({ x: 0, y: 0 })
const aimKnob = ref({ x: 0, y: 0 })

const hud = ref<GameHud>({
  elapsed: 0,
  remaining: BOSS_TIMES[0],
  wave: 1,
  kills: 0,
  score: 0,
  hp: 100,
  maxHp: 100,
  xp: 0,
  nextXp: 28,
  level: 1,
  dashRatio: 1,
  bossHp: 0,
  bossMaxHp: 0,
  bossStage: 1,
  bossTotal: BOSS_TIMES.length,
  combo: 0,
  comboTimer: 0,
})

let engine: NeonSurvivorEngine | null = null
let resizeObserver: ResizeObserver | null = null
let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
type SoundName = Parameters<EngineCallbacks['onSound']>[0]
interface ActiveTone {
  oscillator: OscillatorNode
  gain: GainNode
}

const activeTones = new Set<ActiveTone>()
const soundTimers = new Set<number>()
const lastSoundAt: Partial<Record<SoundName, number>> = {}

const hpRatio = computed(() => `${Math.max(0, (hud.value.hp / hud.value.maxHp) * 100)}%`)
const xpRatio = computed(() => `${Math.min(100, (hud.value.xp / hud.value.nextXp) * 100)}%`)
const dashRatio = computed(() => `${hud.value.dashRatio * 100}%`)
const bossRatio = computed(() =>
  hud.value.bossMaxHp ? `${Math.max(0, (hud.value.bossHp / hud.value.bossMaxHp) * 100)}%` : '0%',
)

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

const phaseLabel = computed(() => {
  if (hud.value.bossMaxHp > 0) return `核心威胁 ${hud.value.bossStage}/${hud.value.bossTotal}`
  return `裂隙波次 ${hud.value.wave}`
})

function ensureAudio() {
  if (!soundEnabled.value) return
  if (!audioContext) {
    audioContext = new AudioContext()
    masterGain = audioContext.createGain()
    masterGain.gain.value = 0.22
    masterGain.connect(audioContext.destination)
  }
  if (audioContext.state === 'suspended') void audioContext.resume()
}

function playTone(
  frequency: number,
  endFrequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const context = audioContext
  const output = masterGain
  if (!soundEnabled.value || !context || context.state === 'closed' || !output) return
  const now = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const tone = { oscillator, gain }
  const release = () => {
    oscillator.onended = null
    oscillator.disconnect()
    gain.disconnect()
    activeTones.delete(tone)
  }

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, now)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration)
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  oscillator.connect(gain)
  gain.connect(output)
  oscillator.onended = release
  activeTones.add(tone)
  oscillator.start(now)
  oscillator.stop(now + duration)
}

function scheduleSound(callback: () => void, delay: number) {
  const timer = window.setTimeout(() => {
    soundTimers.delete(timer)
    callback()
  }, delay)
  soundTimers.add(timer)
}

function shutdownAudio() {
  for (const timer of soundTimers) window.clearTimeout(timer)
  soundTimers.clear()

  for (const tone of activeTones) {
    tone.oscillator.onended = null
    try {
      tone.oscillator.stop()
    } catch {
      // 已自然结束的振荡器可以直接断开。
    }
    tone.oscillator.disconnect()
    tone.gain.disconnect()
  }
  activeTones.clear()

  masterGain?.disconnect()
  const context = audioContext
  masterGain = null
  audioContext = null
  if (context && context.state !== 'closed') void context.close()
}

function playSound(name: SoundName) {
  if (!soundEnabled.value) return
  const now = performance.now()
  const throttle = name === 'pickup' ? 48 : name === 'hit' ? 32 : name === 'kill' ? 28 : 0
  if (throttle && now - (lastSoundAt[name] || 0) < throttle) return
  lastSoundAt[name] = now
  if (name === 'shoot') playTone(620, 240, 0.055, 0.09, 'square')
  else if (name === 'hit') playTone(145, 85, 0.045, 0.045, 'square')
  else if (name === 'kill') playTone(180, 520, 0.09, 0.08, 'triangle')
  else if (name === 'hurt') playTone(125, 45, 0.22, 0.22, 'sawtooth')
  else if (name === 'dash') playTone(240, 880, 0.15, 0.16, 'sine')
  else if (name === 'pickup') playTone(700, 980, 0.07, 0.055, 'sine')
  else if (name === 'level') {
    playTone(440, 660, 0.16, 0.13, 'sine')
    scheduleSound(() => playTone(660, 990, 0.2, 0.12, 'sine'), 90)
  } else if (name === 'boss') playTone(90, 36, 0.7, 0.28, 'sawtooth')
}

function startGame() {
  ensureAudio()
  summary.value = null
  phase.value = 'playing'
  engine?.start(difficulty.value)
  window.setTimeout(() => canvasRef.value?.focus(), 0)
}

function pauseGame() {
  if (phase.value !== 'playing') return
  engine?.pause()
  phase.value = 'paused'
}

function resumeGame() {
  if (phase.value !== 'paused') return
  phase.value = 'playing'
  engine?.resume()
  canvasRef.value?.focus()
}

function quitToMenu() {
  engine?.pause()
  phase.value = 'menu'
  summary.value = null
}

function chooseUpgrade(id: string) {
  phase.value = 'playing'
  engine?.applyUpgrade(id)
  canvasRef.value?.focus()
}

function toggleSound() {
  soundEnabled.value = !soundEnabled.value
  setStorage(SOUND_KEY, soundEnabled.value)
  if (soundEnabled.value) ensureAudio()
  else shutdownAudio()
}

function onKeyDown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const gameKeys = [
    'w',
    'a',
    's',
    'd',
    'j',
    'arrowup',
    'arrowdown',
    'arrowleft',
    'arrowright',
    ' ',
    'shift',
  ]
  if (gameKeys.includes(key) && phase.value === 'playing') event.preventDefault()

  if ((key === 'escape' || key === 'p') && phase.value === 'playing') {
    event.preventDefault()
    pauseGame()
    return
  }
  if ((key === 'escape' || key === 'p') && phase.value === 'paused') {
    event.preventDefault()
    resumeGame()
    return
  }
  if ((phase.value === 'gameover' || phase.value === 'victory') && key === 'enter') {
    startGame()
    return
  }
  if (!engine || phase.value !== 'playing') return
  engine.input.keys.add(key)
  if ((key === ' ' || key === 'shift') && !event.repeat) engine.input.dashQueued = true
}

function onKeyUp(event: KeyboardEvent) {
  engine?.input.keys.delete(event.key.toLowerCase())
}

function updatePointer(event: PointerEvent) {
  if (!engine || !canvasRef.value || event.pointerType !== 'mouse') return
  const rect = canvasRef.value.getBoundingClientRect()
  engine.input.pointer.x = event.clientX - rect.left
  engine.input.pointer.y = event.clientY - rect.top
  engine.input.pointerActive = true
}

function onCanvasPointerDown(event: PointerEvent) {
  if (!engine || event.pointerType !== 'mouse' || event.button !== 0 || phase.value !== 'playing')
    return
  updatePointer(event)
  engine.startFiring()
}

function stopFiring(event?: PointerEvent) {
  if (!engine || (event && event.pointerType !== 'mouse')) return
  engine.input.firing = false
}

function useDash() {
  if (engine && phase.value === 'playing') engine.input.dashQueued = true
}

function updateStick(event: PointerEvent, kind: 'move' | 'aim') {
  if (!engine || phase.value !== 'playing') return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  if (event.type === 'pointerdown') target.setPointerCapture(event.pointerId)
  const rect = target.getBoundingClientRect()
  const maxDistance = rect.width * 0.29
  let x = event.clientX - (rect.left + rect.width / 2)
  let y = event.clientY - (rect.top + rect.height / 2)
  const distance = Math.hypot(x, y)
  if (distance > maxDistance) {
    x = (x / distance) * maxDistance
    y = (y / distance) * maxDistance
  }
  const vector = { x: x / maxDistance, y: y / maxDistance }
  if (kind === 'move') {
    moveKnob.value = { x, y }
    engine.input.moveStick = vector
  } else {
    aimKnob.value = { x, y }
    engine.input.aimStick = vector
    engine.input.touchAiming = true
    engine.input.firing = distance > maxDistance * 0.22
  }
}

function resetStick(event: PointerEvent, kind: 'move' | 'aim') {
  event.preventDefault()
  if (!engine) return
  if (kind === 'move') {
    moveKnob.value = { x: 0, y: 0 }
    engine.input.moveStick = { x: 0, y: 0 }
  } else {
    aimKnob.value = { x: 0, y: 0 }
    engine.input.aimStick = { x: 0, y: 0 }
    engine.input.firing = false
  }
}

function onVisibilityChange() {
  if (document.hidden && phase.value === 'playing') pauseGame()
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  isTouch.value = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760
  engine = new NeonSurvivorEngine(canvas, {
    onHud: (snapshot) => {
      hud.value = snapshot
    },
    onLevelUp: (options) => {
      upgradeOptions.value = options
      phase.value = 'levelup'
    },
    onEnd: (result) => {
      summary.value = result
      phase.value = result.victory ? 'victory' : 'gameover'
      if (result.score > bestScore.value) {
        bestScore.value = result.score
        setStorage(BEST_SCORE_KEY, result.score)
      }
    },
    onSound: playSound,
  })
  resizeObserver = new ResizeObserver(() => engine?.resize())
  resizeObserver.observe(canvas)
  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerup', stopFiring)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  engine?.destroy()
  engine = null
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('pointerup', stopFiring)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  shutdownAudio()
})
</script>

<template>
  <div class="survivor-app" :class="[`phase-${phase}`, { 'is-touch': isTouch }]">
    <canvas
      ref="canvasRef"
      class="game-canvas"
      tabindex="0"
      @pointermove="updatePointer"
      @pointerdown="onCanvasPointerDown"
      @pointerleave="stopFiring"
      @contextmenu.prevent
    ></canvas>

    <div class="scanlines"></div>
    <div class="top-glow"></div>

    <header v-if="phase !== 'menu'" class="game-topbar">
      <button class="icon-button back-button" aria-label="返回菜单" @click="quitToMenu">←</button>
      <div class="mission-block">
        <span class="eyebrow">{{ phaseLabel }}</span>
        <strong v-if="!hud.bossMaxHp">距离下一核心 {{ formatTime(hud.remaining) }}</strong>
        <strong v-else>击破第 {{ hud.bossStage }} 阶段核心</strong>
      </div>
      <div class="score-block">
        <span>得分</span>
        <strong>{{ hud.score.toLocaleString() }}</strong>
      </div>
      <button class="icon-button pause-button" aria-label="暂停游戏" @click="pauseGame">Ⅱ</button>
    </header>

    <template v-if="phase === 'playing' || phase === 'paused' || phase === 'levelup'">
      <section class="combat-hud">
        <div class="vitals glass-chip">
          <div class="vitals-row">
            <span class="hud-label">机体完整度</span>
            <strong>{{ Math.ceil(hud.hp) }} / {{ Math.round(hud.maxHp) }}</strong>
          </div>
          <div class="bar hp-bar"><span :style="{ width: hpRatio }"></span></div>
        </div>

        <div class="level-panel glass-chip">
          <span class="level-badge">LV.{{ hud.level }}</span>
          <div class="xp-wrap">
            <div class="vitals-row">
              <span class="hud-label">同步经验</span>
              <span>{{ Math.floor(hud.xp) }} / {{ hud.nextXp }}</span>
            </div>
            <div class="bar xp-bar"><span :style="{ width: xpRatio }"></span></div>
          </div>
        </div>

        <div class="dash-panel glass-chip">
          <div class="dash-icon">◈</div>
          <div>
            <div class="vitals-row">
              <span class="hud-label">闪烁推进</span>
              <span>{{ hud.dashRatio >= 1 ? '就绪' : '充能' }}</span>
            </div>
            <div class="bar dash-bar"><span :style="{ width: dashRatio }"></span></div>
          </div>
          <kbd>{{ isTouch ? '冲刺' : 'SPACE' }}</kbd>
        </div>
      </section>

      <div v-if="hud.combo >= 3 && hud.comboTimer > 0" class="combo-display">
        <span>连锁歼灭</span>
        <strong>×{{ hud.combo }}</strong>
      </div>

      <div v-if="hud.bossMaxHp" class="boss-hud">
        <div class="boss-title">
          <span>◈</span> ANOMALY CORE · {{ hud.bossStage }}/{{ hud.bossTotal }} <span>◈</span>
        </div>
        <div class="boss-bar"><span :style="{ width: bossRatio }"></span></div>
      </div>

      <div class="kill-counter glass-chip">
        <span class="kill-mark">×</span>
        <div>
          <strong>{{ hud.kills }}</strong
          ><small>已清除</small>
        </div>
      </div>

      <div v-if="!isTouch" class="control-hint">
        <span><kbd>WASD</kbd> 移动</span>
        <i></i>
        <span><kbd>鼠标</kbd> 瞄准 / 射击</span>
        <i></i>
        <span><kbd>SPACE</kbd> 冲刺</span>
      </div>
    </template>

    <div v-if="isTouch && phase === 'playing'" class="mobile-controls">
      <div
        class="joystick move-stick"
        @pointerdown="updateStick($event, 'move')"
        @pointermove="updateStick($event, 'move')"
        @pointerup="resetStick($event, 'move')"
        @pointercancel="resetStick($event, 'move')"
      >
        <span class="stick-label">移动</span>
        <div class="stick-ring"></div>
        <div
          class="stick-knob"
          :style="{ transform: `translate(${moveKnob.x}px, ${moveKnob.y}px)` }"
        ></div>
      </div>
      <button
        class="mobile-dash"
        :class="{ ready: hud.dashRatio >= 1 }"
        @pointerdown.prevent="useDash"
      >
        <span>◈</span><small>冲刺</small>
      </button>
      <div
        class="joystick aim-stick"
        @pointerdown="updateStick($event, 'aim')"
        @pointermove="updateStick($event, 'aim')"
        @pointerup="resetStick($event, 'aim')"
        @pointercancel="resetStick($event, 'aim')"
      >
        <span class="stick-label">瞄准</span>
        <div class="stick-ring"></div>
        <div
          class="stick-knob aim-knob"
          :style="{ transform: `translate(${aimKnob.x}px, ${aimKnob.y}px)` }"
        ></div>
      </div>
    </div>

    <section v-if="phase === 'menu'" class="menu-overlay">
      <div class="menu-orb orb-one"></div>
      <div class="menu-orb orb-two"></div>
      <div class="menu-grid"></div>

      <header class="menu-header">
        <button class="nav-back" @click="router.push('/')">← <span>返回工作台</span></button>
        <div class="menu-brand"><i></i> VUECHEST ARCADE</div>
        <button
          class="sound-toggle"
          :aria-label="soundEnabled ? '关闭音效' : '开启音效'"
          @click="toggleSound"
        >
          {{ soundEnabled ? '♫' : '×' }}
        </button>
      </header>

      <main class="menu-content">
        <div class="hero-copy">
          <div class="status-pill"><span></span> RIFT SIGNAL DETECTED</div>
          <h1><span>星渊</span>幸存者</h1>
          <p class="english-title">NEON RIFT · SURVIVOR PROTOCOL</p>
          <p class="hero-description">
            驾驶最后的棱镜战机，在失控的裂隙中完成六分钟远征。搜集能量、构筑火力，连续击破三阶段异常核心。
          </p>

          <div class="feature-row">
            <div><span>12</span><small>强化模块</small></div>
            <i></i>
            <div><span>5</span><small>敌对单位</small></div>
            <i></i>
            <div><span>3</span><small>核心阶段</small></div>
          </div>

          <div class="difficulty-select">
            <span class="select-label">选择协议</span>
            <div class="segmented">
              <button :class="{ active: difficulty === 'normal' }" @click="difficulty = 'normal'">
                <b>标准协议</b><small>推荐体验</small>
              </button>
              <button :class="{ active: difficulty === 'surge' }" @click="difficulty = 'surge'">
                <b>狂潮协议</b><small>敌人 +32%</small>
              </button>
            </div>
          </div>

          <button class="launch-button" @click="startGame">
            <span class="launch-icon">▶</span>
            <span><b>启动幸存者协议</b><small>ENTER THE RIFT</small></span>
            <i>›</i>
          </button>

          <div class="best-record">
            <span>个人最高记录</span>
            <strong>{{ bestScore.toLocaleString() }}</strong>
          </div>
        </div>

        <div class="hero-visual" aria-hidden="true">
          <div class="orbit orbit-outer"><span></span><span></span><span></span></div>
          <div class="orbit orbit-mid"><span></span><span></span></div>
          <div class="orbit orbit-inner"></div>
          <div class="ship-glow"></div>
          <div class="menu-ship">
            <div class="wing wing-left"></div>
            <div class="wing wing-right"></div>
            <div class="ship-body"></div>
            <div class="ship-core"></div>
            <div class="engine-trail"></div>
          </div>
          <div class="target target-a"></div>
          <div class="target target-b"></div>
          <div class="target target-c"></div>
          <span class="telemetry tel-one">CORE // 100%</span>
          <span class="telemetry tel-two">WEAPON // ONLINE</span>
        </div>
      </main>

      <footer class="menu-footer">
        <span>移动 <kbd>WASD</kbd></span>
        <span>瞄准射击 <kbd>鼠标</kbd></span>
        <span>无敌冲刺 <kbd>SPACE</kbd></span>
        <span class="footer-note">移动端支持双摇杆</span>
      </footer>
    </section>

    <section v-if="phase === 'levelup'" class="modal-overlay level-overlay">
      <div class="level-rays"></div>
      <div class="level-modal">
        <span class="modal-kicker">SYNC COMPLETE</span>
        <div class="level-number">{{ hud.level }}</div>
        <h2>同步等级提升</h2>
        <p>选择一个模块写入战机核心</p>
        <div class="upgrade-grid">
          <button
            v-for="(option, index) in upgradeOptions"
            :key="option.id"
            class="upgrade-card"
            :class="`rarity-${option.rarity}`"
            @click="chooseUpgrade(option.id)"
          >
            <span class="card-index">0{{ index + 1 }}</span>
            <span class="rarity-label">{{
              option.rarity === 'epic' ? '史诗' : option.rarity === 'rare' ? '稀有' : '标准'
            }}</span>
            <span class="upgrade-icon">{{ option.icon }}</span>
            <strong>{{ option.title }}</strong>
            <small>模块等级 {{ option.level }}</small>
            <p>{{ option.description }}</p>
            <span class="install-label">安装模块 <i>›</i></span>
          </button>
        </div>
      </div>
    </section>

    <section v-if="phase === 'paused'" class="modal-overlay">
      <div class="pause-modal panel-modal">
        <div class="pause-symbol">Ⅱ</div>
        <span class="modal-kicker">PROTOCOL SUSPENDED</span>
        <h2>行动暂停</h2>
        <p>裂隙时间已冻结，准备好后继续。</p>
        <div class="modal-actions">
          <button class="primary-action" @click="resumeGame">继续行动</button>
          <button @click="startGame">重新开始</button>
          <button @click="quitToMenu">返回主菜单</button>
        </div>
      </div>
    </section>

    <section
      v-if="phase === 'gameover' || phase === 'victory'"
      class="modal-overlay result-overlay"
    >
      <div class="result-modal panel-modal" :class="{ victory: phase === 'victory' }">
        <div class="result-emblem">{{ phase === 'victory' ? '◇' : '×' }}</div>
        <span class="modal-kicker">{{
          phase === 'victory' ? 'RIFT STABILIZED' : 'SIGNAL LOST'
        }}</span>
        <h2>{{ phase === 'victory' ? '异常核心已清除' : '战机信号中断' }}</h2>
        <p>
          {{ phase === 'victory' ? '你让星渊重新归于寂静。' : '重新编译战术，下一次走得更远。' }}
        </p>
        <div v-if="summary" class="result-stats">
          <div>
            <small>最终得分</small><strong>{{ summary.score.toLocaleString() }}</strong>
          </div>
          <div>
            <small>清除目标</small><strong>{{ summary.kills }}</strong>
          </div>
          <div>
            <small>同步等级</small><strong>LV.{{ summary.level }}</strong>
          </div>
          <div>
            <small>存活时间</small><strong>{{ formatTime(summary.elapsed) }}</strong>
          </div>
        </div>
        <div class="modal-actions horizontal">
          <button class="primary-action" @click="startGame">再次进入</button>
          <button @click="quitToMenu">返回主菜单</button>
        </div>
        <span class="enter-tip">按 ENTER 快速重试</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.survivor-app {
  --cyan: #6cf7ff;
  --violet: #8a65ff;
  --pink: #ff52c8;
  --panel: rgba(8, 13, 30, 0.74);
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 560px;
  overflow: hidden;
  color: #eefcff;
  background: #050813;
  isolation: isolate;
  user-select: none;
}

.game-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  outline: none;
  cursor: crosshair;
  touch-action: none;
}

.phase-menu .game-canvas {
  filter: blur(1px) brightness(0.42) saturate(1.15);
  transform: scale(1.015);
}

.scanlines,
.top-glow {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.scanlines {
  opacity: 0.1;
  background: repeating-linear-gradient(
    0deg,
    transparent 0 3px,
    rgba(255, 255, 255, 0.045) 3px 4px
  );
  mix-blend-mode: soft-light;
}

.phase-playing .scanlines {
  opacity: 0.035;
  mix-blend-mode: normal;
}

.top-glow {
  height: 180px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent);
}

button {
  color: inherit;
}

.game-topbar {
  position: absolute;
  z-index: 5;
  top: 18px;
  left: 22px;
  right: 22px;
  display: grid;
  grid-template-columns: 46px minmax(150px, 1fr) auto 46px;
  align-items: center;
  gap: 14px;
  pointer-events: none;
}

.icon-button,
.game-topbar button {
  pointer-events: auto;
}

.icon-button {
  width: 42px;
  height: 42px;
  border: 1px solid rgba(130, 224, 255, 0.2);
  border-radius: 13px;
  color: #d9fbff;
  background: rgba(7, 14, 30, 0.72);
  backdrop-filter: blur(14px);
  cursor: pointer;
  font-size: 17px;
  transition: 0.2s ease;
}

.icon-button:hover {
  color: #fff;
  border-color: rgba(108, 247, 255, 0.62);
  background: rgba(25, 42, 70, 0.78);
  box-shadow: 0 0 22px rgba(61, 223, 255, 0.14);
}

.mission-block {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.mission-block .eyebrow,
.score-block span,
.hud-label {
  color: rgba(205, 232, 244, 0.55);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.mission-block strong {
  margin-top: 2px;
  font-size: 13px;
}

.score-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 100px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.score-block strong {
  color: var(--cyan);
  font-size: 18px;
  letter-spacing: 0.08em;
  text-shadow: 0 0 16px rgba(108, 247, 255, 0.48);
}

.combat-hud {
  position: absolute;
  z-index: 4;
  right: 22px;
  bottom: 22px;
  left: 22px;
  display: grid;
  grid-template-columns: minmax(190px, 250px) minmax(210px, 300px) minmax(210px, 270px);
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  pointer-events: none;
}

.glass-chip {
  border: 1px solid rgba(122, 203, 255, 0.14);
  background: linear-gradient(135deg, rgba(13, 23, 47, 0.8), rgba(5, 10, 25, 0.65));
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.035),
    0 12px 40px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(16px);
}

.phase-playing .glass-chip,
.phase-playing .icon-button {
  backdrop-filter: none;
}

.vitals,
.level-panel,
.dash-panel {
  min-height: 61px;
  padding: 12px 14px;
  border-radius: 13px;
}

.vitals-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  color: rgba(228, 247, 255, 0.72);
  font-size: 10px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.vitals-row strong {
  color: #f5fbff;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.bar {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.08);
}

.bar span,
.boss-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.12s linear;
}

.hp-bar span {
  background: linear-gradient(90deg, #ff4c86, #ff886e);
  box-shadow: 0 0 13px rgba(255, 74, 132, 0.72);
}

.level-panel {
  display: flex;
  align-items: center;
  gap: 12px;
}

.level-badge {
  flex: 0 0 auto;
  color: var(--cyan);
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-shadow: 0 0 16px rgba(108, 247, 255, 0.48);
}

.xp-wrap {
  min-width: 0;
  flex: 1;
}

.xp-bar span {
  background: linear-gradient(90deg, #6d77ff, #64f4ff);
  box-shadow: 0 0 13px rgba(83, 229, 255, 0.62);
}

.dash-panel {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
}

.dash-icon {
  color: var(--cyan);
  font-size: 24px;
  text-shadow: 0 0 14px var(--cyan);
}

.dash-panel .vitals-row {
  margin-bottom: 6px;
}

.dash-bar span {
  background: linear-gradient(90deg, #985eff, #69fbff);
  box-shadow: 0 0 12px rgba(107, 244, 255, 0.55);
}

kbd {
  display: inline-flex;
  min-width: 34px;
  height: 22px;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 1px solid rgba(180, 228, 255, 0.2);
  border-bottom-color: rgba(180, 228, 255, 0.42);
  border-radius: 5px;
  color: rgba(222, 246, 255, 0.8);
  background: rgba(255, 255, 255, 0.055);
  font: 700 9px/1 inherit;
  letter-spacing: 0.08em;
}

.kill-counter {
  position: absolute;
  z-index: 4;
  top: 86px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border-radius: 11px;
}

.kill-mark {
  color: #ff6695;
  font-size: 23px;
  font-weight: 200;
}

.kill-counter div {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.kill-counter strong {
  font-size: 14px;
}

.kill-counter small {
  margin-top: 3px;
  color: rgba(211, 235, 245, 0.45);
  font-size: 8px;
  letter-spacing: 0.12em;
}

.control-hint {
  position: absolute;
  z-index: 3;
  bottom: 98px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(218, 239, 249, 0.42);
  font-size: 9px;
  letter-spacing: 0.06em;
  transform: translateX(-50%);
  pointer-events: none;
}

.control-hint span {
  white-space: nowrap;
}

.control-hint kbd {
  margin-right: 4px;
}

.control-hint i {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.24);
}

.combo-display {
  position: absolute;
  z-index: 4;
  top: 26%;
  right: 4%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  animation: combo-in 0.2s ease-out;
  pointer-events: none;
}

.combo-display span {
  color: rgba(255, 225, 241, 0.62);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.2em;
}

.combo-display strong {
  color: #ff62ba;
  font-size: 38px;
  font-style: italic;
  line-height: 1;
  text-shadow: 0 0 24px rgba(255, 73, 184, 0.58);
}

.boss-hud {
  position: absolute;
  z-index: 4;
  top: 84px;
  left: 50%;
  width: min(520px, 56vw);
  transform: translateX(-50%);
  pointer-events: none;
  animation: boss-in 0.6s ease both;
}

.boss-title {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 7px;
  color: #ff9ce8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.24em;
  text-shadow: 0 0 18px rgba(255, 75, 210, 0.7);
}

.boss-bar {
  height: 9px;
  padding: 2px;
  overflow: hidden;
  border: 1px solid rgba(255, 103, 215, 0.45);
  border-radius: 999px;
  background: rgba(9, 2, 20, 0.72);
  box-shadow: 0 0 28px rgba(255, 42, 197, 0.16);
}

.boss-bar span {
  background: linear-gradient(90deg, #8d4aff, #ff43c7, #ff99ed);
  box-shadow: 0 0 15px #ff4bce;
}

.menu-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  background:
    radial-gradient(circle at 74% 44%, rgba(75, 62, 210, 0.16), transparent 32%),
    linear-gradient(
      90deg,
      rgba(4, 7, 18, 0.96) 0%,
      rgba(4, 7, 18, 0.82) 44%,
      rgba(4, 7, 18, 0.22) 78%,
      rgba(4, 7, 18, 0.48)
    );
}

.menu-grid {
  position: absolute;
  inset: 0;
  opacity: 0.18;
  background-image:
    linear-gradient(rgba(104, 196, 255, 0.09) 1px, transparent 1px),
    linear-gradient(90deg, rgba(104, 196, 255, 0.09) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: linear-gradient(90deg, black, transparent 78%);
  transform: perspective(600px) rotateX(62deg) scale(1.5) translateY(20%);
  transform-origin: bottom;
}

.menu-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.19;
  animation: float-orb 8s ease-in-out infinite alternate;
}

.orb-one {
  top: 5%;
  right: 13%;
  width: 340px;
  height: 340px;
  background: #4d43ff;
}

.orb-two {
  right: 36%;
  bottom: -12%;
  width: 260px;
  height: 260px;
  background: #00eaff;
  animation-delay: -3s;
}

.menu-header {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 24px 32px;
}

.nav-back,
.sound-toggle {
  border: 0;
  color: rgba(220, 241, 250, 0.62);
  background: none;
  cursor: pointer;
  transition: color 0.2s ease;
}

.nav-back {
  justify-self: start;
  font-size: 12px;
  letter-spacing: 0.04em;
}

.nav-back:hover,
.sound-toggle:hover {
  color: var(--cyan);
}

.menu-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(224, 244, 252, 0.48);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.22em;
}

.menu-brand i,
.status-pill span {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 12px var(--cyan);
}

.sound-toggle {
  justify-self: end;
  width: 35px;
  height: 35px;
  border: 1px solid rgba(134, 214, 255, 0.14);
  border-radius: 50%;
  background: rgba(9, 16, 32, 0.55);
}

.menu-content {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(360px, 0.82fr) minmax(400px, 1.18fr);
  align-items: center;
  width: min(1220px, calc(100% - 80px));
  margin: 0 auto;
}

.hero-copy {
  max-width: 510px;
  padding: 18px 0 26px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 17px;
  padding: 6px 10px;
  border: 1px solid rgba(107, 243, 255, 0.2);
  border-radius: 99px;
  color: rgba(164, 241, 255, 0.72);
  background: rgba(20, 104, 125, 0.1);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.19em;
}

.status-pill span {
  width: 5px;
  height: 5px;
  animation: signal-pulse 1.5s infinite;
}

.hero-copy h1 {
  margin: 0;
  color: #f3f8ff;
  font-size: clamp(50px, 6vw, 86px);
  font-weight: 900;
  line-height: 0.94;
  letter-spacing: -0.08em;
  text-shadow: 0 5px 34px rgba(0, 0, 0, 0.38);
}

.hero-copy h1 span {
  color: transparent;
  background: linear-gradient(115deg, #fff 8%, #7afcff 52%, #9f7bff 92%);
  background-clip: text;
  -webkit-background-clip: text;
  filter: drop-shadow(0 0 24px rgba(92, 234, 255, 0.28));
}

.english-title {
  margin: 9px 0 0;
  color: rgba(153, 218, 239, 0.58);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.32em;
}

.hero-description {
  max-width: 440px;
  margin: 23px 0 0;
  color: rgba(212, 233, 243, 0.63);
  font-size: 13px;
  line-height: 1.8;
}

.feature-row {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 20px;
}

.feature-row div {
  display: flex;
  flex-direction: column;
}

.feature-row span {
  color: #effdff;
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
}

.feature-row small {
  margin-top: 5px;
  color: rgba(185, 218, 231, 0.43);
  font-size: 9px;
  letter-spacing: 0.12em;
}

.feature-row i {
  width: 1px;
  height: 25px;
  background: rgba(159, 217, 240, 0.13);
}

.difficulty-select {
  margin-top: 26px;
}

.select-label {
  display: block;
  margin-bottom: 7px;
  color: rgba(194, 226, 239, 0.42);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.2em;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  max-width: 410px;
  padding: 5px;
  border: 1px solid rgba(125, 200, 237, 0.11);
  border-radius: 12px;
  background: rgba(7, 13, 29, 0.58);
}

.segmented button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: rgba(220, 237, 245, 0.48);
  background: transparent;
  cursor: pointer;
  transition: 0.2s ease;
}

.segmented button.active {
  border-color: rgba(104, 242, 255, 0.22);
  color: #eefdff;
  background: linear-gradient(120deg, rgba(77, 113, 187, 0.3), rgba(43, 206, 220, 0.12));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
}

.segmented b {
  font-size: 11px;
}

.segmented small {
  color: rgba(196, 228, 239, 0.4);
  font-size: 8px;
}

.launch-button {
  position: relative;
  display: grid;
  grid-template-columns: 38px 1fr auto;
  align-items: center;
  gap: 13px;
  width: min(410px, 100%);
  margin-top: 15px;
  padding: 13px 16px;
  overflow: hidden;
  border: 1px solid rgba(155, 248, 255, 0.42);
  border-radius: 12px;
  color: #06121b;
  background: linear-gradient(105deg, #83f6ff, #75d9ff 48%, #a58cff);
  box-shadow:
    0 13px 38px rgba(61, 207, 255, 0.18),
    inset 0 1px rgba(255, 255, 255, 0.72);
  cursor: pointer;
  text-align: left;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.launch-button::after {
  position: absolute;
  top: -100%;
  left: -30%;
  width: 24%;
  height: 300%;
  background: rgba(255, 255, 255, 0.28);
  transform: rotate(24deg);
  transition: left 0.45s ease;
  content: '';
}

.launch-button:hover {
  transform: translateY(-2px);
  box-shadow:
    0 18px 46px rgba(61, 207, 255, 0.28),
    inset 0 1px rgba(255, 255, 255, 0.8);
}

.launch-button:hover::after {
  left: 116%;
}

.launch-icon {
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #c7fbff;
  background: rgba(4, 20, 33, 0.86);
  box-shadow: 0 0 18px rgba(0, 39, 54, 0.24);
  font-size: 11px;
}

.launch-button > span:nth-child(2) {
  display: flex;
  flex-direction: column;
}

.launch-button b {
  font-size: 13px;
  letter-spacing: 0.05em;
}

.launch-button small {
  margin-top: 1px;
  color: rgba(5, 31, 43, 0.58);
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.22em;
}

.launch-button > i {
  font-size: 25px;
  font-style: normal;
}

.best-record {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 12px;
  color: rgba(183, 214, 227, 0.36);
  font-size: 8px;
  letter-spacing: 0.14em;
}

.best-record strong {
  color: rgba(137, 239, 255, 0.68);
  font-size: 11px;
}

.hero-visual {
  position: relative;
  width: min(52vw, 640px);
  aspect-ratio: 1;
  justify-self: center;
  filter: drop-shadow(0 20px 50px rgba(0, 0, 0, 0.28));
}

.orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px solid rgba(107, 235, 255, 0.13);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.orbit::before,
.orbit::after {
  position: absolute;
  inset: 8%;
  border-top: 1px solid rgba(118, 252, 255, 0.3);
  border-radius: 50%;
  content: '';
}

.orbit-outer {
  width: 88%;
  height: 88%;
  border-style: dashed;
  animation: orbit-spin 32s linear infinite;
}

.orbit-mid {
  width: 66%;
  height: 66%;
  animation: orbit-spin-reverse 21s linear infinite;
}

.orbit-inner {
  width: 43%;
  height: 43%;
  border-color: rgba(156, 116, 255, 0.23);
  box-shadow:
    0 0 55px rgba(65, 225, 255, 0.08),
    inset 0 0 45px rgba(129, 83, 255, 0.07);
  animation: orbit-spin 13s linear infinite;
}

.orbit span {
  position: absolute;
  top: 50%;
  left: -4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 13px var(--cyan);
}

.orbit span:nth-child(2) {
  top: 12%;
  right: 10%;
  left: auto;
  background: var(--pink);
  box-shadow: 0 0 13px var(--pink);
}

.orbit span:nth-child(3) {
  top: auto;
  right: 21%;
  bottom: 2%;
  left: auto;
}

.ship-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 32%;
  height: 32%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(98, 237, 255, 0.33),
    rgba(95, 80, 255, 0.1) 42%,
    transparent 72%
  );
  filter: blur(13px);
  transform: translate(-50%, -50%);
  animation: ship-pulse 2.4s ease-in-out infinite;
}

.menu-ship {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 170px;
  height: 100px;
  transform: translate(-50%, -50%) rotate(-9deg);
  animation: ship-float 4s ease-in-out infinite;
}

.ship-body {
  position: absolute;
  top: 30px;
  left: 31px;
  width: 116px;
  height: 41px;
  border: 2px solid rgba(190, 252, 255, 0.88);
  clip-path: polygon(100% 50%, 39% 0, 0 21%, 17% 50%, 0 79%, 39% 100%);
  background: linear-gradient(90deg, rgba(62, 86, 161, 0.38), rgba(83, 241, 255, 0.28));
  box-shadow: inset 0 0 18px rgba(99, 242, 255, 0.2);
}

.wing {
  position: absolute;
  left: 49px;
  width: 64px;
  height: 34px;
  border: 1px solid rgba(142, 232, 255, 0.54);
  background: linear-gradient(90deg, rgba(103, 93, 236, 0.24), rgba(78, 228, 255, 0.09));
}

.wing-left {
  top: 6px;
  clip-path: polygon(10% 100%, 43% 0, 100% 79%);
}

.wing-right {
  bottom: 6px;
  clip-path: polygon(10% 0, 43% 100%, 100% 21%);
}

.ship-core {
  position: absolute;
  z-index: 2;
  top: 43px;
  left: 92px;
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow:
    0 0 10px white,
    0 0 28px var(--cyan);
}

.engine-trail {
  position: absolute;
  top: 44px;
  left: -24px;
  width: 76px;
  height: 12px;
  border-radius: 100% 0 0 100%;
  background: linear-gradient(90deg, transparent, rgba(91, 87, 255, 0.5), #91faff);
  filter: blur(3px);
  animation: engine-pulse 0.16s ease-in-out infinite alternate;
}

.target {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(255, 91, 188, 0.65);
  transform: rotate(45deg);
  box-shadow: 0 0 16px rgba(255, 67, 181, 0.22);
}

.target::after {
  position: absolute;
  inset: 6px;
  background: #ff61bd;
  box-shadow: 0 0 12px #ff61bd;
  content: '';
}

.target-a {
  top: 19%;
  right: 14%;
  animation: target-float 3.8s ease-in-out infinite;
}

.target-b {
  right: 9%;
  bottom: 24%;
  width: 14px;
  height: 14px;
  animation: target-float 4.3s -1.2s ease-in-out infinite;
}

.target-b::after {
  inset: 4px;
}

.target-c {
  bottom: 14%;
  left: 17%;
  border-color: rgba(106, 248, 255, 0.7);
  animation: target-float 4.8s -2.2s ease-in-out infinite;
}

.target-c::after {
  background: var(--cyan);
  box-shadow: 0 0 12px var(--cyan);
}

.telemetry {
  position: absolute;
  padding-left: 17px;
  color: rgba(167, 222, 239, 0.38);
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.17em;
}

.telemetry::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 11px;
  height: 1px;
  background: rgba(104, 236, 255, 0.42);
  content: '';
}

.tel-one {
  top: 34%;
  left: 7%;
}

.tel-two {
  right: 2%;
  bottom: 38%;
}

.menu-footer {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 17px 32px;
  border-top: 1px solid rgba(130, 202, 235, 0.08);
  color: rgba(192, 220, 232, 0.4);
  font-size: 9px;
}

.menu-footer kbd {
  margin-left: 4px;
}

.footer-note {
  margin-left: 14px;
  color: rgba(106, 240, 255, 0.54);
}

.modal-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(3, 5, 14, 0.72);
  backdrop-filter: blur(12px);
  animation: overlay-in 0.25s ease both;
}

.level-overlay {
  background: radial-gradient(circle at 50% 45%, rgba(71, 76, 211, 0.22), rgba(3, 5, 14, 0.88) 62%);
}

.level-rays {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 700px;
  height: 700px;
  opacity: 0.18;
  background: repeating-conic-gradient(
    from 0deg,
    rgba(102, 244, 255, 0.2) 0deg 1deg,
    transparent 1deg 14deg
  );
  mask-image: radial-gradient(circle, black, transparent 66%);
  animation: orbit-spin 24s linear infinite;
  transform: translate(-50%, -50%);
}

.level-modal {
  position: relative;
  z-index: 1;
  width: min(880px, 100%);
  text-align: center;
}

.modal-kicker {
  color: rgba(119, 243, 255, 0.66);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.28em;
}

.level-number {
  position: absolute;
  top: -43px;
  left: 50%;
  z-index: -1;
  color: rgba(117, 239, 255, 0.05);
  font-size: 154px;
  font-weight: 900;
  line-height: 1;
  transform: translateX(-50%);
}

.level-modal h2,
.panel-modal h2 {
  margin: 8px 0 4px;
  color: #f2fbff;
  font-size: 27px;
  letter-spacing: 0.04em;
}

.level-modal > p,
.panel-modal > p {
  color: rgba(202, 229, 239, 0.5);
  font-size: 11px;
}

.upgrade-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-top: 30px;
}

.upgrade-card {
  position: relative;
  display: flex;
  min-height: 300px;
  flex-direction: column;
  align-items: center;
  padding: 27px 22px 20px;
  overflow: hidden;
  border: 1px solid rgba(117, 213, 245, 0.16);
  border-radius: 17px;
  color: #eafaff;
  background: linear-gradient(155deg, rgba(18, 30, 58, 0.92), rgba(6, 12, 29, 0.96));
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.04),
    0 22px 55px rgba(0, 0, 0, 0.24);
  cursor: pointer;
  transition: 0.24s ease;
}

.upgrade-card::before {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(circle at 50% 20%, rgba(104, 242, 255, 0.18), transparent 52%);
  transition: opacity 0.24s ease;
  content: '';
}

.upgrade-card:hover {
  border-color: rgba(110, 239, 255, 0.56);
  box-shadow:
    0 20px 65px rgba(43, 203, 255, 0.16),
    inset 0 1px rgba(255, 255, 255, 0.08);
  transform: translateY(-7px);
}

.upgrade-card:hover::before {
  opacity: 1;
}

.upgrade-card.rarity-rare {
  border-color: rgba(143, 110, 255, 0.32);
}

.upgrade-card.rarity-rare:hover {
  border-color: rgba(159, 126, 255, 0.75);
  box-shadow: 0 20px 65px rgba(117, 76, 255, 0.19);
}

.upgrade-card.rarity-epic {
  border-color: rgba(255, 94, 196, 0.36);
}

.upgrade-card.rarity-epic:hover {
  border-color: rgba(255, 108, 208, 0.82);
  box-shadow: 0 20px 65px rgba(255, 62, 184, 0.19);
}

.card-index {
  position: absolute;
  top: 14px;
  left: 15px;
  color: rgba(194, 228, 241, 0.2);
  font-size: 9px;
  font-weight: 800;
}

.rarity-label {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 7px;
  border-radius: 20px;
  color: rgba(152, 243, 255, 0.72);
  background: rgba(82, 224, 246, 0.08);
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.rarity-rare .rarity-label {
  color: #bba5ff;
  background: rgba(140, 99, 255, 0.1);
}

.rarity-epic .rarity-label {
  color: #ff9cdb;
  background: rgba(255, 88, 191, 0.1);
}

.upgrade-icon {
  position: relative;
  display: flex;
  width: 70px;
  height: 70px;
  align-items: center;
  justify-content: center;
  margin: 10px 0 18px;
  border: 1px solid rgba(103, 237, 255, 0.25);
  border-radius: 20px;
  color: var(--cyan);
  background: rgba(73, 222, 255, 0.08);
  box-shadow:
    0 0 30px rgba(70, 229, 255, 0.08),
    inset 0 0 22px rgba(99, 237, 255, 0.05);
  font-size: 31px;
  text-shadow: 0 0 18px rgba(83, 237, 255, 0.8);
}

.rarity-rare .upgrade-icon {
  border-color: rgba(161, 122, 255, 0.34);
  color: #b08cff;
  background: rgba(128, 78, 255, 0.09);
  text-shadow: 0 0 18px rgba(140, 84, 255, 0.8);
}

.rarity-epic .upgrade-icon {
  border-color: rgba(255, 103, 204, 0.4);
  color: #ff7dd0;
  background: rgba(255, 63, 184, 0.09);
  text-shadow: 0 0 18px rgba(255, 64, 186, 0.8);
}

.upgrade-card strong {
  position: relative;
  font-size: 17px;
}

.upgrade-card > small {
  position: relative;
  margin-top: 4px;
  color: rgba(175, 216, 231, 0.38);
  font-size: 8px;
  letter-spacing: 0.08em;
}

.upgrade-card p {
  position: relative;
  margin: 18px 0;
  color: rgba(206, 231, 241, 0.62);
  font-size: 11px;
  line-height: 1.55;
}

.install-label {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid rgba(143, 208, 235, 0.1);
  color: rgba(128, 238, 255, 0.58);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.install-label i {
  font-size: 18px;
  font-style: normal;
}

.panel-modal {
  width: min(420px, 100%);
  padding: 34px;
  border: 1px solid rgba(119, 215, 250, 0.18);
  border-radius: 21px;
  text-align: center;
  background: linear-gradient(150deg, rgba(17, 29, 57, 0.94), rgba(5, 10, 26, 0.97));
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.42),
    inset 0 1px rgba(255, 255, 255, 0.04);
}

.pause-symbol,
.result-emblem {
  display: flex;
  width: 68px;
  height: 68px;
  align-items: center;
  justify-content: center;
  margin: 0 auto 18px;
  border: 1px solid rgba(100, 235, 255, 0.3);
  border-radius: 50%;
  color: var(--cyan);
  background: rgba(76, 219, 255, 0.07);
  box-shadow: 0 0 35px rgba(66, 221, 255, 0.11);
  font-size: 26px;
  text-shadow: 0 0 15px var(--cyan);
}

.modal-actions {
  display: grid;
  gap: 8px;
  margin-top: 28px;
}

.modal-actions button {
  min-height: 43px;
  border: 1px solid rgba(127, 205, 239, 0.15);
  border-radius: 10px;
  color: rgba(221, 241, 249, 0.72);
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  transition: 0.2s ease;
}

.modal-actions button:hover {
  border-color: rgba(109, 234, 255, 0.42);
  color: #fff;
  background: rgba(81, 203, 255, 0.1);
}

.modal-actions .primary-action {
  border-color: rgba(112, 242, 255, 0.42);
  color: #061219;
  background: linear-gradient(105deg, #85f7ff, #8da0ff);
}

.result-modal {
  width: min(520px, 100%);
}

.result-modal:not(.victory) .result-emblem {
  border-color: rgba(255, 79, 130, 0.34);
  color: #ff648f;
  background: rgba(255, 65, 120, 0.07);
  box-shadow: 0 0 35px rgba(255, 60, 120, 0.12);
  text-shadow: 0 0 15px #ff4d80;
}

.result-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 25px;
}

.result-stats div {
  display: flex;
  flex-direction: column;
  padding: 14px;
  border: 1px solid rgba(122, 205, 239, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.result-stats small {
  color: rgba(182, 218, 231, 0.4);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.result-stats strong {
  margin-top: 3px;
  color: #dffcff;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.modal-actions.horizontal {
  grid-template-columns: 1fr 1fr;
}

.enter-tip {
  display: block;
  margin-top: 13px;
  color: rgba(183, 215, 228, 0.28);
  font-size: 8px;
  letter-spacing: 0.12em;
}

.mobile-controls {
  position: absolute;
  z-index: 8;
  right: 18px;
  bottom: 18px;
  left: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  pointer-events: none;
}

.joystick {
  position: relative;
  width: 132px;
  height: 132px;
  border-radius: 50%;
  touch-action: none;
  pointer-events: auto;
}

.stick-ring {
  position: absolute;
  inset: 20px;
  border: 1px solid rgba(128, 232, 255, 0.25);
  border-radius: 50%;
  background: rgba(9, 21, 42, 0.24);
  box-shadow: inset 0 0 28px rgba(57, 204, 255, 0.04);
}

.stick-ring::before,
.stick-ring::after {
  position: absolute;
  top: 50%;
  left: 50%;
  background: rgba(123, 224, 255, 0.11);
  transform: translate(-50%, -50%);
  content: '';
}

.stick-ring::before {
  width: 70%;
  height: 1px;
}

.stick-ring::after {
  width: 1px;
  height: 70%;
}

.stick-knob {
  position: absolute;
  top: 45px;
  left: 45px;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(143, 242, 255, 0.58);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(142, 246, 255, 0.38), rgba(51, 115, 167, 0.25));
  box-shadow:
    0 0 22px rgba(86, 224, 255, 0.18),
    inset 0 0 12px rgba(255, 255, 255, 0.12);
}

.aim-knob {
  border-color: rgba(255, 123, 207, 0.58);
  background: radial-gradient(circle, rgba(255, 139, 215, 0.4), rgba(151, 45, 128, 0.25));
  box-shadow: 0 0 22px rgba(255, 73, 187, 0.18);
}

.stick-label {
  position: absolute;
  bottom: 2px;
  left: 50%;
  color: rgba(185, 224, 238, 0.34);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.15em;
  transform: translateX(-50%);
}

.mobile-dash {
  display: flex;
  width: 58px;
  height: 58px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  border: 1px solid rgba(125, 220, 255, 0.3);
  border-radius: 50%;
  color: rgba(180, 218, 232, 0.4);
  background: rgba(8, 16, 35, 0.64);
  pointer-events: auto;
}

.mobile-dash.ready {
  color: var(--cyan);
  box-shadow:
    0 0 25px rgba(75, 231, 255, 0.16),
    inset 0 0 18px rgba(80, 217, 255, 0.1);
}

.mobile-dash span {
  font-size: 20px;
  line-height: 1;
}

.mobile-dash small {
  margin-top: 3px;
  font-size: 7px;
}

@keyframes orbit-spin {
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

@keyframes orbit-spin-reverse {
  to {
    transform: translate(-50%, -50%) rotate(-360deg);
  }
}

@keyframes float-orb {
  to {
    transform: translate(40px, -28px) scale(1.14);
  }
}

@keyframes signal-pulse {
  50% {
    opacity: 0.35;
    box-shadow: 0 0 3px var(--cyan);
  }
}

@keyframes ship-float {
  50% {
    transform: translate(-50%, calc(-50% - 13px)) rotate(-6deg);
  }
}

@keyframes ship-pulse {
  50% {
    opacity: 0.62;
    transform: translate(-50%, -50%) scale(1.18);
  }
}

@keyframes engine-pulse {
  to {
    width: 91px;
    opacity: 0.7;
  }
}

@keyframes target-float {
  50% {
    transform: translateY(-13px) rotate(225deg);
  }
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
}

@keyframes combo-in {
  from {
    opacity: 0;
    transform: translateX(14px) scale(1.15);
  }
}

@keyframes boss-in {
  from {
    opacity: 0;
    transform: translate(-50%, -18px);
  }
}

@media (max-width: 900px) {
  .menu-content {
    grid-template-columns: minmax(330px, 0.95fr) minmax(280px, 1.05fr);
    width: calc(100% - 48px);
  }

  .hero-visual {
    width: min(48vw, 520px);
  }

  .menu-ship {
    transform: translate(-50%, -50%) rotate(-9deg) scale(0.85);
  }

  .combat-hud {
    grid-template-columns: 1fr 1fr;
  }

  .dash-panel {
    display: none;
  }
}

@media (max-width: 680px) {
  .survivor-app {
    min-height: 620px;
  }

  .menu-overlay {
    overflow-y: auto;
  }

  .menu-header {
    position: sticky;
    top: 0;
    z-index: 4;
    padding: 16px 18px;
    background: linear-gradient(180deg, rgba(4, 7, 18, 0.92), transparent);
  }

  .nav-back span,
  .menu-brand {
    font-size: 0;
  }

  .menu-brand::after {
    font-size: 8px;
    content: 'VC ARCADE';
  }

  .menu-content {
    display: block;
    width: calc(100% - 36px);
    padding: 8px 0 26px;
  }

  .hero-copy {
    position: relative;
    z-index: 2;
    max-width: none;
    text-align: center;
  }

  .hero-copy h1 {
    font-size: clamp(47px, 16vw, 68px);
  }

  .hero-description {
    margin-right: auto;
    margin-left: auto;
  }

  .feature-row,
  .segmented,
  .launch-button {
    margin-right: auto;
    margin-left: auto;
  }

  .feature-row {
    justify-content: center;
  }

  .best-record {
    justify-content: center;
  }

  .hero-visual {
    position: absolute;
    top: 9%;
    right: -36%;
    width: 430px;
    opacity: 0.25;
  }

  .menu-footer {
    display: none;
  }

  .game-topbar {
    top: 10px;
    right: 11px;
    left: 11px;
    grid-template-columns: 38px 1fr auto 38px;
    gap: 8px;
  }

  .icon-button {
    width: 36px;
    height: 36px;
    border-radius: 11px;
  }

  .score-block {
    min-width: 72px;
  }

  .score-block strong {
    font-size: 14px;
  }

  .mission-block strong {
    font-size: 10px;
  }

  .combat-hud {
    top: 58px;
    right: 11px;
    bottom: auto;
    left: 11px;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .vitals,
  .level-panel {
    min-height: 48px;
    padding: 9px 10px;
  }

  .level-panel {
    gap: 7px;
  }

  .level-badge {
    font-size: 12px;
  }

  .vitals-row {
    margin-bottom: 5px;
  }

  .kill-counter {
    top: 115px;
    right: 11px;
  }

  .combo-display {
    top: 25%;
    right: 14px;
  }

  .boss-hud {
    top: 120px;
    width: 76vw;
  }

  .joystick {
    width: 118px;
    height: 118px;
  }

  .stick-knob {
    top: 38px;
    left: 38px;
  }

  .upgrade-grid {
    grid-template-columns: 1fr;
    max-height: 68vh;
    overflow-y: auto;
    padding: 3px;
  }

  .upgrade-card {
    min-height: 140px;
    display: grid;
    grid-template-columns: 58px 1fr;
    grid-template-rows: auto auto 1fr;
    column-gap: 14px;
    align-items: center;
    padding: 22px 18px;
    text-align: left;
  }

  .upgrade-icon {
    grid-row: 1 / 4;
    width: 54px;
    height: 54px;
    margin: 0;
    border-radius: 15px;
    font-size: 25px;
  }

  .upgrade-card strong,
  .upgrade-card > small,
  .upgrade-card p {
    grid-column: 2;
  }

  .upgrade-card > small {
    margin: 0;
  }

  .upgrade-card p {
    margin: 8px 0 0;
  }

  .install-label {
    display: none;
  }

  .level-number {
    font-size: 110px;
  }
}

@media (max-height: 700px) and (min-width: 681px) {
  .menu-header {
    padding-top: 15px;
    padding-bottom: 10px;
  }

  .hero-copy {
    transform: scale(0.88);
    transform-origin: left center;
  }

  .menu-footer {
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .upgrade-card {
    min-height: 260px;
    padding-top: 20px;
  }

  .upgrade-icon {
    width: 58px;
    height: 58px;
    margin-bottom: 12px;
  }
}

@media (max-height: 520px) and (min-width: 480px) {
  .survivor-app {
    min-height: 100%;
  }

  .menu-header {
    padding: 10px 24px 5px;
  }

  .menu-content {
    display: grid;
    grid-template-columns: minmax(360px, 0.9fr) minmax(320px, 1.1fr);
    width: calc(100% - 48px);
    padding: 0;
  }

  .hero-copy {
    padding: 0;
    text-align: left;
    transform: none;
  }

  .hero-description,
  .feature-row,
  .segmented,
  .launch-button {
    margin-left: 0;
  }

  .feature-row {
    justify-content: flex-start;
  }

  .status-pill {
    margin-bottom: 7px;
    padding: 4px 8px;
  }

  .hero-copy h1 {
    font-size: clamp(38px, 6vw, 52px);
  }

  .english-title {
    margin-top: 4px;
    font-size: 7px;
  }

  .hero-description {
    margin-top: 10px;
    font-size: 10px;
    line-height: 1.55;
  }

  .feature-row {
    gap: 16px;
    margin-top: 10px;
  }

  .feature-row span {
    font-size: 14px;
  }

  .feature-row small {
    margin-top: 2px;
    font-size: 7px;
  }

  .difficulty-select {
    margin-top: 11px;
  }

  .select-label {
    margin-bottom: 4px;
  }

  .segmented {
    padding: 3px;
  }

  .segmented button {
    padding: 6px 9px;
  }

  .launch-button {
    min-height: 42px;
    margin-top: 7px;
    padding: 6px 12px;
  }

  .launch-icon {
    width: 29px;
    height: 29px;
  }

  .best-record {
    margin-top: 5px;
  }

  .hero-visual {
    position: relative;
    top: auto;
    right: auto;
    width: min(44vw, 350px);
    opacity: 1;
  }

  .menu-ship {
    transform: translate(-50%, -50%) rotate(-9deg) scale(0.72);
  }

  .menu-footer {
    display: none;
  }

  .game-topbar {
    top: 6px;
    right: 10px;
    left: 10px;
  }

  .is-touch .combat-hud {
    top: 52px;
    right: auto;
    bottom: auto;
    left: 10px;
    grid-template-columns: minmax(170px, 220px) minmax(180px, 240px);
    gap: 7px;
  }

  .is-touch .vitals,
  .is-touch .level-panel {
    min-height: 46px;
    padding: 8px 10px;
  }

  .is-touch .kill-counter {
    top: 54px;
    right: 10px;
  }

  .is-touch .boss-hud {
    top: 108px;
    width: 46vw;
  }

  .mobile-controls {
    right: 8px;
    bottom: 2px;
    left: 8px;
  }

  .joystick {
    width: 94px;
    height: 94px;
  }

  .stick-ring {
    inset: 14px;
  }

  .stick-knob {
    top: 31px;
    left: 31px;
    width: 32px;
    height: 32px;
  }

  .mobile-dash {
    width: 48px;
    height: 48px;
    margin-bottom: 9px;
  }

  .level-modal h2 {
    margin-top: 3px;
    font-size: 21px;
  }

  .level-modal > p {
    font-size: 9px;
  }

  .upgrade-grid {
    gap: 10px;
    margin-top: 15px;
  }

  .upgrade-card {
    min-height: 205px;
    padding: 16px 15px 12px;
  }

  .upgrade-icon {
    width: 46px;
    height: 46px;
    margin: 5px 0 8px;
    border-radius: 14px;
    font-size: 22px;
  }

  .upgrade-card strong {
    font-size: 14px;
  }

  .upgrade-card p {
    margin: 9px 0;
    font-size: 9px;
  }

  .install-label {
    padding-top: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
