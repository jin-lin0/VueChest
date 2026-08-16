<template>
  <div class="racing-game" ref="gameContainer">
    <canvas ref="gameCanvas"></canvas>
    <div v-if="gameState === 'menu'" class="game-menu">
      <button class="back-btn" @click="goBack">
        <span>←</span>
        <span>返回</span>
      </button>

      <h1>🏎️ 极速狂飙</h1>
      <p class="subtitle">3D赛车竞速 · AI对手 · 漂移氮气</p>

      <div class="mode-select">
        <h3>游戏模式</h3>
        <div class="mode-options">
          <div
            :class="['mode-option', { selected: gameMode === 'single' }]"
            @click="gameMode = 'single'"
          >
            <span class="mode-icon">👤</span>
            <span>单人模式</span>
          </div>
          <div
            :class="['mode-option', { selected: gameMode === 'multi' }]"
            @click="gameMode = 'multi'"
          >
            <span class="mode-icon">👥</span>
            <span>本地双人</span>
          </div>
        </div>
      </div>

      <div class="car-select">
        <h3>{{ gameMode === 'multi' ? '玩家1选择赛车' : '选择赛车' }}</h3>
        <div
          class="car-carousel"
          @touchstart.passive="onCarTouchStart($event)"
          @touchend.passive="onCarTouchEnd($event, 1)"
        >
          <button class="carousel-btn prev" @click="prevCar(1)">‹</button>
          <div class="car-display">
            <div class="car-card">
              <div class="car-preview-large" :style="{ background: currentCar.color }">
                <div class="car-shape">🏎️</div>
              </div>
              <h4>{{ currentCar.name }}</h4>
              <div class="car-stats">
                <div class="stat">
                  <span>速度</span>
                  <div class="stat-bar">
                    <div :style="{ width: currentCar.speed / 2 + '%' }"></div>
                  </div>
                  <span class="stat-value">{{ currentCar.speed }}</span>
                </div>
                <div class="stat">
                  <span>操控</span>
                  <div class="stat-bar">
                    <div :style="{ width: currentCar.handling + '%' }"></div>
                  </div>
                  <span class="stat-value">{{ currentCar.handling }}</span>
                </div>
              </div>
            </div>
          </div>
          <button class="carousel-btn next" @click="nextCar(1)">›</button>
        </div>
        <div class="car-dots">
          <span
            v-for="car in cars"
            :key="car.id"
            :class="['dot', { active: selectedCar === car.id }]"
            @click="selectedCar = car.id"
          ></span>
        </div>
      </div>

      <!-- 玩家2选择 -->
      <div v-if="gameMode === 'multi'" class="car-select">
        <h3>玩家2选择赛车</h3>
        <div
          class="car-carousel"
          @touchstart.passive="onCarTouchStart($event)"
          @touchend.passive="onCarTouchEnd($event, 2)"
        >
          <button class="carousel-btn prev" @click="prevCar(2)">‹</button>
          <div class="car-display">
            <div class="car-card">
              <div class="car-preview-large" :style="{ background: currentCar2.color }">
                <div class="car-shape">🏎️</div>
              </div>
              <h4>{{ currentCar2.name }}</h4>
            </div>
          </div>
          <button class="carousel-btn next" @click="nextCar(2)">›</button>
        </div>
        <div class="car-dots">
          <span
            v-for="car in cars"
            :key="car.id"
            :class="['dot', { active: selectedCar2 === car.id }]"
            @click="selectedCar2 = car.id"
          ></span>
        </div>
      </div>

      <button class="start-btn" @click="startGame">开始比赛</button>

      <div class="controls-hint">
        <p v-if="gameMode === 'single'">键盘: WASD/方向键控制 | 高速下 刹车+转向 触发漂移 | 1-4 释放技能</p>
        <p v-else>玩家1: WASD控制 | 玩家2: 方向键控制 | 刹车+转向 漂移</p>
      </div>
    </div>

    <div v-if="gameState === 'paused'" class="pause-menu">
      <div class="pause-content">
        <h2>⏸️ 游戏暂停</h2>
        <div class="pause-buttons">
          <button @click="resumeGame">继续游戏</button>
          <button @click="restartGame">重新开始</button>
          <button @click="quitGame">退出游戏</button>
          <button @click="goBack">返回主页</button>
        </div>
      </div>
    </div>

    <div v-if="gameState === 'playing'" class="game-hud">
      <button class="pause-btn" @click="pauseGame">⏸️</button>

      <template v-if="gameMode === 'single'">
        <div class="hud-top">
          <div class="rank-display">
            <span class="rank-value">{{ rank }}</span>
            <span class="rank-total">/{{ totalRacers }} 名</span>
          </div>
          <div :class="['speed-display', { boosting }]">
            <span class="speed-value">{{ Math.floor(speed * 5) }}</span>
            <span class="speed-unit">KM/H</span>
          </div>
          <div class="score-display">
            <span class="score-value">{{ score }}</span>
            <span v-if="combo > 1" class="combo-value">x{{ combo }}</span>
          </div>
          <div class="lap-info">
            <span>圈数: {{ currentLap }}/{{ totalLaps }}</span>
          </div>
          <div class="time-info">
            <div class="lap-time-current">{{ formatLap(lapTime) }}</div>
            <div v-if="player1Data.lastLapTime > 0" class="lap-time-last">
              上圈 {{ formatLap(player1Data.lastLapTime) }}
            </div>
          </div>
        </div>

        <div class="skills-bar">
          <div
            v-for="(skill, index) in skills"
            :key="skill.id"
            :class="['skill-item', { active: skill.cooldown <= 0, cooldown: skill.cooldown > 0 }]"
            @touchstart.prevent="useSkill(1, index)"
            @click="useSkill(1, index)"
          >
            <div class="skill-icon">{{ skill.icon }}</div>
            <div v-if="skill.cooldown > 0" class="cooldown-overlay">
              <span>{{ Math.ceil(skill.cooldown) }}</span>
            </div>
            <div class="skill-key">{{ index + 1 }}</div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="split-hud">
          <div class="player-hud player1-hud">
            <div class="hud-label">玩家1</div>
            <div class="speed-display small">
              <span class="speed-value">{{ Math.floor(player1Data.speed * 5) }}</span>
              <span class="speed-unit">KM/H</span>
            </div>
            <div class="lap-info small">圈数: {{ player1Data.currentLap }}/{{ totalLaps }}</div>
          </div>
          <div class="player-hud player2-hud">
            <div class="hud-label">玩家2</div>
            <div class="speed-display small">
              <span class="speed-value">{{ Math.floor(player2Data.speed * 5) }}</span>
              <span class="speed-unit">KM/H</span>
            </div>
            <div class="lap-info small">圈数: {{ player2Data.currentLap }}/{{ totalLaps }}</div>
          </div>
        </div>
      </template>

      <div class="minimap">
        <canvas ref="minimapCanvas" width="150" height="150"></canvas>
      </div>
    </div>

    <!-- 倒计时 / GO 覆盖层 -->
    <div
      v-if="gameState === 'countdown' || (gameState === 'playing' && countdownValue === 0)"
      class="countdown-overlay"
    >
      <div class="countdown-lights">
        <span
          v-for="i in 3"
          :key="i"
          :class="['cd-light', { on: countdownValue > 0 && countdownValue <= 4 - i, go: countdownValue === 0 }]"
        ></span>
      </div>
      <div :class="['countdown-number', { go: countdownValue === 0 }]">
        {{ countdownValue > 0 ? countdownValue : 'GO!' }}
      </div>
    </div>

    <div v-if="gameState === 'playing' && gameMode === 'single'" class="mobile-controls">
      <div class="control-left">
        <button
          class="control-btn left-btn"
          @touchstart.prevent="mobileControls.left = true"
          @touchend.prevent="mobileControls.left = false"
          @mousedown="mobileControls.left = true"
          @mouseup="mobileControls.left = false"
        >
          ◀
        </button>
      </div>
      <div class="control-right">
        <button
          class="control-btn right-btn"
          @touchstart.prevent="mobileControls.right = true"
          @touchend.prevent="mobileControls.right = false"
          @mousedown="mobileControls.right = true"
          @mouseup="mobileControls.right = false"
        >
          ▶
        </button>
      </div>
      <div class="control-gas">
        <button
          class="control-btn gas-btn"
          @touchstart.prevent="mobileControls.gas = true"
          @touchend.prevent="mobileControls.gas = false"
          @mousedown="mobileControls.gas = true"
          @mouseup="mobileControls.gas = false"
        >
          🔥
        </button>
      </div>
      <div class="control-brake">
        <button
          class="control-btn brake-btn"
          @touchstart.prevent="mobileControls.brake = true"
          @touchend.prevent="mobileControls.brake = false"
          @mousedown="mobileControls.brake = true"
          @mouseup="mobileControls.brake = false"
        >
          🛑
        </button>
      </div>
    </div>

    <div v-if="gameState === 'result'" class="game-result">
      <h2>🏆 比赛结束</h2>
      <div v-if="gameMode === 'multi'" class="winner-announce">
        <span>{{ winner === 1 ? '玩家1' : '玩家2' }} 获胜!</span>
      </div>
      <div class="result-stats">
        <div v-if="gameMode === 'single'">
          <div class="result-item">
            <span>名次</span>
            <span class="final-rank">第 {{ rank }}/{{ totalRacers }} 名</span>
          </div>
          <div class="result-item">
            <span>总用时</span>
            <span>{{ formatClock(gameTime) }}</span>
          </div>
          <div class="result-item">
            <span>最佳圈速</span>
            <span>{{ player1Data.bestLapTime > 0 ? formatLap(player1Data.bestLapTime) : '--' }}</span>
          </div>
          <div class="result-item">
            <span>最高时速</span>
            <span>{{ Math.floor(maxSpeed * 5) }} KM/H</span>
          </div>
          <div class="result-item">
            <span>技能使用</span>
            <span>{{ skillsUsed }} 次</span>
          </div>
          <div class="result-item">
            <span>总分</span>
            <span class="final-score">{{ score }}</span>
          </div>
        </div>
        <div v-else>
          <div class="result-item">
            <span>玩家1用时</span>
            <span>{{ formatClock(player1Data.finishTime) }}</span>
          </div>
          <div class="result-item">
            <span>玩家2用时</span>
            <span>{{ formatClock(player2Data.finishTime) }}</span>
          </div>
        </div>
      </div>
      <div class="result-buttons">
        <button @click="startGame">再来一局</button>
        <button @click="quitGame">返回菜单</button>
        <button @click="goBack">返回主页</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { formatClock } from '@/utils'
import {
  RACING_CARS,
  RACING_DRIFT,
  RACING_TRACK,
  RACING_SCORE,
  RACING_PHYSICS,
  RACING_CAMERA,
  RACING_AI,
  type RacingCar,
} from './config'
import { getCarById, cycleCar, renderSplitScreenView } from './utils'
import {
  buildTrack,
  buildEnvironment,
  disposeObject,
  queryTrack,
  trackFrameAt,
  type Collectible,
  type CheckpointGate,
} from './track'
import { buildCarMesh } from './car'
import { ParticleSystem } from './particles'
import { racingAudio } from './audio'
import { updateAI, raceProgress, type AICarState } from './ai'
import { createPlayerData, resetPlayerData, type PlayerData } from './types'

const router = useRouter()
const gameContainer = ref<HTMLDivElement>()
const gameCanvas = ref<HTMLCanvasElement>()
const minimapCanvas = ref<HTMLCanvasElement>()

// 游戏状态
const gameState = ref<'menu' | 'countdown' | 'playing' | 'paused' | 'result'>('menu')
const gameMode = ref<'single' | 'multi'>('single')
const selectedCar = ref(1)
const selectedCar2 = ref(2)
const speed = ref(0)
const maxSpeed = ref(0)
const gameTime = ref(0)
const currentLap = ref(1)
const totalLaps = ref(3)
const skillsUsed = ref(0)
const winner = ref(1)
const score = ref(0)
const combo = ref(0)
// 竞速新增：倒计时 / 名次 / 圈速 / 氮气状态
const countdownValue = ref(-1) // 3/2/1 → 0=GO → -1 隐藏
const rank = ref(1)
const totalRacers = ref(1)
const lapTime = ref(0)
const boosting = ref(false)

/** 圈速格式化：mm:ss.d（比 formatClock 多一位小数，竞速更需要） */
function formatLap(t: number): string {
  if (t <= 0) return '00:00.0'
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${String(m).padStart(2, '0')}:${s < 10 ? '0' : ''}${s.toFixed(1)}`
}

const cars = RACING_CARS

// 计算当前选择的车辆
const currentCar = computed(() => getCarById(selectedCar.value) || cars[0])
const currentCar2 = computed(() => getCarById(selectedCar2.value) || cars[1])

// 切换车辆
function prevCar(player: number) {
  cycleCar(player === 1 ? selectedCar : selectedCar2, -1)
}

function nextCar(player: number) {
  cycleCar(player === 1 ? selectedCar : selectedCar2, 1)
}

// 触摸滑动选择赛车
let touchStartX = 0
function onCarTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX
}
function onCarTouchEnd(e: TouchEvent, player: number) {
  const deltaX = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(deltaX) > 40) {
    if (deltaX < 0) {
      nextCar(player)
    } else {
      prevCar(player)
    }
  }
}

// 技能系统
const skills = reactive([
  { id: 1, name: '氮气加速', icon: '🚀', cooldown: 0, duration: 3, maxCooldown: 10 },
  { id: 2, name: '磁铁吸附', icon: '🧲', cooldown: 0, duration: 5, maxCooldown: 15 },
  { id: 3, name: '护盾', icon: '🛡️', cooldown: 0, duration: 4, maxCooldown: 12 },
  { id: 4, name: '导弹', icon: '🎯', cooldown: 0, duration: 0, maxCooldown: 8 },
])

// 玩家数据（PlayerData 类型与工厂已抽到 ./types）
const player1Data = reactive<PlayerData>(createPlayerData())
const player2Data = reactive<PlayerData>(createPlayerData())

// 控制状态
const mobileControls = reactive({
  left: false,
  right: false,
  gas: false,
  brake: false,
})

const keyboardControls = reactive({
  p1Left: false,
  p1Right: false,
  p1Gas: false,
  p1Brake: false,
  p2Left: false,
  p2Right: false,
  p2Gas: false,
  p2Brake: false,
})

// Three.js 变量
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let camera2: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let car1: THREE.Group
let car2: THREE.Group
let nitroFlame1: THREE.Mesh | null = null
let wheels1: THREE.Mesh[] = []
let animationId: number

// 游戏数据（几何搭建已抽到 ./track）
let trackPoints: THREE.Vector3[] = []
let checkpoints: THREE.Vector3[] = []
let collectibles: Collectible[] = []
let gates: CheckpointGate[] = []
let aiCars: AICarState[] = []
let particles: ParticleSystem | null = null
let comboResetTimer: ReturnType<typeof setTimeout> | null = null

// 相机状态（平滑跟随 + 碰撞震动）
const camPos = new THREE.Vector3()
let camInitialized = false
let cameraShake = 0
// 撞车音效冷却（秒，gameTime 基准），防止每帧连响
let lastCrashSoundAt = -10

// 统一跟踪定时器 / 动画帧，组件卸载时集中清理，避免泄漏
const trackedIntervals: ReturnType<typeof setInterval>[] = []
const trackedTimeouts: ReturnType<typeof setTimeout>[] = []
const trackedRafs: number[] = []
function trackInterval(fn: () => void, ms: number): ReturnType<typeof setInterval> {
  const id = setInterval(fn, ms)
  trackedIntervals.push(id)
  return id
}
function trackTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
  const id = setTimeout(fn, ms)
  trackedTimeouts.push(id)
  return id
}
function trackRaf(cb: FrameRequestCallback): number {
  const id = requestAnimationFrame(cb)
  trackedRafs.push(id)
  return id
}
let magnetActive = false
let magnetPlayerData: PlayerData | null = null
let shieldActive = false
let shieldMesh: THREE.Mesh | null = null
let shieldPlayerData: PlayerData | null = null
let boostActive = false
let boostPlayerData: PlayerData | null = null
// 漂移相关常量见 RACING_DRIFT（config.ts）
// 漂移痕迹
const tireMarks: { mesh: THREE.Mesh; opacity: number; createdAt: number }[] = []
let lastTireMarkTime = 0

// 返回主页
function goBack() {
  router.push('/')
}

// 暂停游戏
function pauseGame() {
  if (gameState.value !== 'playing') return
  gameState.value = 'paused'
  racingAudio.stopEngine()
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
}

// 继续游戏
function resumeGame() {
  if (gameState.value !== 'paused') return
  gameState.value = 'playing'
  if (gameMode.value === 'single') racingAudio.startEngine()
  lastTime = performance.now()
  gameLoop()
}

// 重新开始
function restartGame() {
  startGame()
}

// 退出游戏
function quitGame() {
  gameState.value = 'menu'
  countdownValue.value = -1
  racingAudio.stopEngine()
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
}

// 初始化Three.js场景
function initScene() {
  if (!gameCanvas.value) return

  // 重开比赛前先释放旧场景的 GPU 资源（几何体/材质/贴图），避免内存泄漏
  if (scene) {
    disposeObject(scene)
    while (scene.children.length > 0) {
      scene.remove(scene.children[0])
    }
  }

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x7fc8f8)
  scene.fog = new THREE.Fog(0x7fc8f8, 120, 420)

  camera = new THREE.PerspectiveCamera(
    RACING_CAMERA.FOV_BASE,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  )
  camInitialized = false

  if (gameMode.value === 'multi') {
    camera2 = new THREE.PerspectiveCamera(
      RACING_CAMERA.FOV_BASE,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    )
  }

  // 复用同一个 WebGLRenderer，避免每次开始/重开游戏都 new 一个上下文导致泄漏
  // （反复创建且不 dispose 旧上下文会让浏览器累计超限并封禁该页面，报
  // "Error creating WebGL context / context loss and was blocked"）
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      canvas: gameCanvas.value,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    // 上下文丢失时阻止默认行为，浏览器才会触发后续的 restored 事件让 three 自动重建
    gameCanvas.value.addEventListener('webglcontextlost', (e) => e.preventDefault())
  }
  renderer.setSize(window.innerWidth, window.innerHeight)
  // 上限 1.5 足够清晰；2x + MSAA + 阴影的填充率压力是集成显卡掉上下文的高发原因
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

  // 光照：半球光 + 环境光打底，平行光投影。
  // 显式配置阴影相机范围——DirectionalLight 默认阴影相机只有 ±5，大场景下几乎看不到影子
  const hemisphereLight = new THREE.HemisphereLight(0xcfe8ff, 0x4a7c3f, 0.55)
  scene.add(hemisphereLight)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.25)
  scene.add(ambientLight)
  const directionalLight = new THREE.DirectionalLight(0xfff5e0, 1.1)
  directionalLight.position.set(80, 120, 60)
  directionalLight.castShadow = true
  directionalLight.shadow.mapSize.set(1024, 1024)
  directionalLight.shadow.camera.left = -160
  directionalLight.shadow.camera.right = 160
  directionalLight.shadow.camera.top = 160
  directionalLight.shadow.camera.bottom = -160
  directionalLight.shadow.camera.far = 400
  directionalLight.shadow.bias = -0.0005
  scene.add(directionalLight)

  // 赛道 + 环境（路面 ribbon / 路缘石 / 门楼 / 收集物 / 装饰，见 ./track）
  const trackBuild = buildTrack(scene)
  trackPoints = trackBuild.trackPoints
  checkpoints = trackBuild.checkpoints
  gates = trackBuild.gates
  collectibles = trackBuild.collectibles
  buildEnvironment(scene)
  particles?.dispose() // 上一局的粒子系统共享几何体
  particles = new ParticleSystem(scene)

  // 玩家赛车（造型见 ./car）
  const c1 = buildCarMesh(getCarById(selectedCar.value) || RACING_CARS[0])
  car1 = c1.group
  nitroFlame1 = c1.nitroFlame
  wheels1 = c1.wheels
  scene.add(car1)

  if (gameMode.value === 'multi') {
    const c2 = buildCarMesh(getCarById(selectedCar2.value) || RACING_CARS[1])
    car2 = c2.group
    scene.add(car2)
    aiCars = []
  } else {
    // AI 对手：用玩家未选的赛车，性格各异（走线偏移 + 配速差异），见 ./ai
    aiCars = []
    const aiConfigs = RACING_CARS.filter((c) => c.id !== selectedCar.value).slice(0, RACING_AI.COUNT)
    aiConfigs.forEach((config, i) => {
      const meshes = buildCarMesh(config)
      scene.add(meshes.group)
      aiCars.push({
        data: createPlayerData(),
        mesh: meshes.group,
        car: config,
        laneOffset: (i - (aiConfigs.length - 1) / 2) * 2.5,
        paceFactor: 0.86 + i * 0.05,
      })
    })
  }
}

/** 发车格摆位：玩家在起步线旁（杆位），AI/玩家2 错落排布。 */
function placeRacersOnGrid() {
  const p0 = trackPoints[0]
  const { dir, perp } = trackFrameAt(trackPoints, 0)
  const startAngle = Math.atan2(dir.x, dir.z)

  resetPlayerData(
    player1Data,
    p0.x - perp.x * 3,
    p0.z - perp.z * 3,
    startAngle,
    RACING_TRACK.CHECKPOINTS,
  )
  car1.position.set(player1Data.position.x, 0, player1Data.position.z)
  car1.rotation.y = startAngle

  if (gameMode.value === 'multi') {
    resetPlayerData(
      player2Data,
      p0.x + perp.x * 3,
      p0.z + perp.z * 3,
      startAngle,
      RACING_TRACK.CHECKPOINTS,
    )
    car2.position.set(player2Data.position.x, 0, player2Data.position.z)
    car2.rotation.y = startAngle
  } else {
    aiCars.forEach((ai, i) => {
      const back = 6 + Math.floor(i / 2) * 6
      const side = i % 2 === 0 ? 3.2 : -3.2
      const x = p0.x - dir.x * back + perp.x * side
      const z = p0.z - dir.z * back + perp.z * side
      resetPlayerData(ai.data, x, z, startAngle, RACING_TRACK.CHECKPOINTS)
      ai.mesh.position.set(x, 0, z)
      ai.mesh.rotation.y = startAngle
    })
  }
}

// 位置是否越出赛道边界（留出车身半宽余量；几何查询见 ./track 的 queryTrack）
function isOffTrack(x: number, z: number): boolean {
  const carHalfWidth = 1
  return queryTrack(trackPoints, x, z).dist > RACING_TRACK.WIDTH / 2 - carHalfWidth
}

function checkCarCollision(
  car1Pos: { x: number; z: number },
  car2Pos: { x: number; z: number },
): boolean {
  const distance = Math.sqrt(
    Math.pow(car1Pos.x - car2Pos.x, 2) + Math.pow(car1Pos.z - car2Pos.z, 2),
  )
  return distance < 3
}

function useSkill(player: number, index: number) {
  if (gameState.value !== 'playing') return
  const skill = skills[index]
  if (skill.cooldown > 0) return
  skill.cooldown = skill.maxCooldown
  skillsUsed.value++
  const playerData = player === 1 ? player1Data : player2Data

  switch (skill.id) {
    case 1:
      // 氮气加速 - 临时提高最大速度 + 尾焰 + 音效
      boostActive = true
      boostPlayerData = playerData
      playerData.speed += RACING_SCORE.NITRO_SPEED_BONUS
      racingAudio.nitro()
      if (player === 1) {
        boosting.value = true
        if (nitroFlame1) nitroFlame1.visible = true
      }
      trackTimeout(() => {
        boostActive = false
        boostPlayerData = null
        playerData.speed = Math.min(playerData.speed, getCarMaxSpeed(player))
        if (player === 1) {
          boosting.value = false
          if (nitroFlame1) nitroFlame1.visible = false
        }
      }, skill.duration * 1000)
      break
    case 2:
      activateMagnet(playerData, skill.duration)
      break
    case 3:
      activateShield(playerData, skill.duration)
      break
    case 4:
      launchMissile(player)
      break
  }
}

function launchMissile(player: number) {
  const playerCar = player === 1 ? car1 : car2
  if (!playerCar) return

  // 锁定目标：双人=对方玩家；单人=最近的未完赛 AI（没有目标就直射）
  let targetData: PlayerData | null = null
  if (gameMode.value === 'multi') {
    targetData = player === 1 ? player2Data : player1Data
  } else {
    let best = Infinity
    for (const ai of aiCars) {
      if (ai.data.finished) continue
      const dist = Math.hypot(
        ai.data.position.x - playerCar.position.x,
        ai.data.position.z - playerCar.position.z,
      )
      if (dist < best) {
        best = dist
        targetData = ai.data
      }
    }
  }

  const missileGeometry = new THREE.ConeGeometry(0.3, 1.5)
  const missileMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff4400,
    emissiveIntensity: 0.8,
  })
  const missile = new THREE.Mesh(missileGeometry, missileMaterial)
  missile.position.copy(playerCar.position)
  missile.position.y += 1
  missile.rotation.x = Math.PI / 2
  scene.add(missile)
  racingAudio.missile()

  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(playerCar.quaternion)
  const missileSpeed = 1.6 // 每帧位移（约 96 单位/秒，比赛车快）

  const animateMissile = () => {
    // 轻微追踪：每帧把方向朝目标修正 8%
    if (targetData) {
      const toTarget = new THREE.Vector3(
        targetData.position.x - missile.position.x,
        0,
        targetData.position.z - missile.position.z,
      ).normalize()
      direction.lerp(toTarget, 0.08).normalize()
      missile.rotation.y = Math.atan2(direction.x, direction.z)
    }
    missile.position.add(direction.clone().multiplyScalar(missileSpeed))

    if (targetData) {
      const distance = Math.hypot(
        missile.position.x - targetData.position.x,
        missile.position.z - targetData.position.z,
      )
      if (distance < 3) {
        targetData.speed *= RACING_SCORE.MISSILE_HIT_SPEED_MULTIPLIER
        particles?.spawnSparks(targetData.position.x, 1, targetData.position.z, 14)
        racingAudio.crash(0.8)
        scene.remove(missile)
        missileGeometry.dispose()
        missileMaterial.dispose()
        if (player === 1) {
          score.value += RACING_SCORE.MISSILE_HIT_SCORE
        }
        return
      }
    }
    if (missile.position.distanceTo(playerCar.position) < 120) {
      trackRaf(animateMissile)
    } else {
      scene.remove(missile)
      missileGeometry.dispose()
      missileMaterial.dispose()
    }
  }
  animateMissile()
}

function activateMagnet(playerData: PlayerData, duration: number) {
  magnetActive = true
  magnetPlayerData = playerData

  const magnetInterval = trackInterval(() => {
    if (!magnetActive || !magnetPlayerData) {
      clearInterval(magnetInterval)
      return
    }
    collectibles.forEach((item) => {
      if (!item.collected) {
        const distance = Math.sqrt(
          Math.pow(magnetPlayerData!.position.x - item.mesh.position.x, 2) +
            Math.pow(magnetPlayerData!.position.z - item.mesh.position.z, 2),
        )
        if (distance < 20) {
          const speed = 0.5
          const dx = magnetPlayerData!.position.x - item.mesh.position.x
          const dz = magnetPlayerData!.position.z - item.mesh.position.z
          item.mesh.position.x += (dx / distance) * speed
          item.mesh.position.z += (dz / distance) * speed
          if (distance < 3) {
            item.collected = true
            item.mesh.visible = false
          }
        }
      }
    })
  }, 50)

  trackTimeout(() => {
    magnetActive = false
    magnetPlayerData = null
    clearInterval(magnetInterval)
  }, duration * 1000)
}

function activateShield(playerData: PlayerData, duration: number) {
  shieldActive = true
  shieldPlayerData = playerData

  const shieldGeometry = new THREE.SphereGeometry(3, 16, 16)
  const shieldMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.3,
    emissive: 0x00ffff,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
  })
  shieldMesh = new THREE.Mesh(shieldGeometry, shieldMaterial)
  scene.add(shieldMesh)

  const shieldInterval = trackInterval(() => {
    if (!shieldActive || !shieldMesh) {
      clearInterval(shieldInterval)
      return
    }
    shieldMesh.position.set(playerData.position.x, 1.5, playerData.position.z)
    shieldMesh.rotation.y += 0.05
  }, 50)

  trackTimeout(() => {
    // 护盾结束时，如果车在赛道外，传送回赛道中心线最近点
    if (isOffTrack(playerData.position.x, playerData.position.z)) {
      const q = queryTrack(trackPoints, playerData.position.x, playerData.position.z)
      const nearestPoint = trackPoints[q.segIndex]
      if (nearestPoint) {
        playerData.position.x = nearestPoint.x
        playerData.position.z = nearestPoint.z
        playerData.speed = 0
      }
    }

    shieldActive = false
    shieldPlayerData = null
    if (shieldMesh) {
      scene.remove(shieldMesh)
      shieldMesh = null
    }
    clearInterval(shieldInterval)
  }, duration * 1000)
}

function getSelectedCarData(player: number): RacingCar | undefined {
  const carId = player === 1 ? selectedCar.value : selectedCar2.value
  return getCarById(carId)
}

function getCarMaxSpeed(player: number): number {
  return (getSelectedCarData(player)?.speed || 80) / 5
}

function getCarHandling(player: number): number {
  return (getSelectedCarData(player)?.handling || 70) / 100
}

function updateMinimap() {
  if (!minimapCanvas.value) return
  const ctx = minimapCanvas.value.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, 150, 150)
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 2
  ctx.beginPath()
  trackPoints.forEach((point, index) => {
    const x = (point.x / 200) * 150 + 75
    const y = (point.z / 200) * 150 + 75
    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  ctx.closePath()
  ctx.stroke()

  const p1X = (player1Data.position.x / 200) * 150 + 75
  const p1Y = (player1Data.position.z / 200) * 150 + 75
  ctx.fillStyle = currentCar.value.color
  ctx.beginPath()
  ctx.arc(p1X, p1Y, 4, 0, Math.PI * 2)
  ctx.fill()

  if (gameMode.value === 'multi') {
    const p2X = (player2Data.position.x / 200) * 150 + 75
    const p2Y = (player2Data.position.z / 200) * 150 + 75
    ctx.fillStyle = currentCar2.value.color
    ctx.beginPath()
    ctx.arc(p2X, p2Y, 4, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // AI 对手（灰点）
    ctx.fillStyle = '#aaaaaa'
    for (const ai of aiCars) {
      const ax = (ai.data.position.x / 200) * 150 + 75
      const ay = (ai.data.position.z / 200) * 150 + 75
      ctx.beginPath()
      ctx.arc(ax, ay, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// 漂移状态追踪（driftVisual：车身视觉侧滑角，只做表现层）
const playerDriftState = new Map<PlayerData, { isDrifting: boolean; driftVisual: number }>()

// 创建漂移痕迹（几何体全局共享；材质每条独立——淡出需要各自 opacity，移除时必须 dispose）
let tireMarkGeometry: THREE.PlaneGeometry | null = null
function createTireMark(x: number, z: number, rotation: number) {
  const now = performance.now() / 1000
  if (now - lastTireMarkTime < RACING_DRIFT.TIRE_MARK_INTERVAL) return
  lastTireMarkTime = now

  // 控制最大痕迹数量
  if (tireMarks.length >= RACING_DRIFT.MAX_TIRE_MARKS) {
    const oldest = tireMarks.shift()
    if (oldest) {
      scene.remove(oldest.mesh)
      ;(oldest.mesh.material as THREE.Material).dispose()
    }
  }

  if (!tireMarkGeometry) tireMarkGeometry = new THREE.PlaneGeometry(1.5, 0.4)
  const material = new THREE.MeshBasicMaterial({
    color: 0x1a1a1a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  const mark = new THREE.Mesh(tireMarkGeometry, material)
  mark.rotation.x = -Math.PI / 2
  mark.rotation.z = rotation
  mark.position.set(x, 0.02, z)
  scene.add(mark)
  tireMarks.push({ mesh: mark, opacity: 0.55, createdAt: now })
}

// 移除单条轮胎痕并释放其材质
function removeTireMark(index: number) {
  const mark = tireMarks[index]
  scene.remove(mark.mesh)
  ;(mark.mesh.material as THREE.Material).dispose()
  tireMarks.splice(index, 1)
}

// 更新漂移痕迹（淡出效果）
function updateTireMarks() {
  const now = performance.now() / 1000
  for (let i = tireMarks.length - 1; i >= 0; i--) {
    const mark = tireMarks[i]
    const age = now - mark.createdAt
    // 5秒后开始淡出
    if (age > 5) {
      mark.opacity -= 0.01
      if (mark.opacity <= 0) {
        removeTireMark(i)
      } else {
        ;(mark.mesh.material as THREE.MeshBasicMaterial).opacity = mark.opacity
      }
    }
  }
}

/** 蹭墙反馈：火花 + 闷响 + 相机震动（带冷却，防止每帧连发）。 */
function onWallScrape(playerData: PlayerData, playerNum: number) {
  if (playerNum !== 1) return
  if (gameTime.value - lastCrashSoundAt < 0.4) return
  if (Math.abs(playerData.speed) < RACING_PHYSICS.CRASH_SPEED_THRESHOLD) return
  lastCrashSoundAt = gameTime.value
  racingAudio.crash(0.7)
  cameraShake = RACING_CAMERA.SHAKE_MAX * 0.7
  const noseX = playerData.position.x + Math.sin(playerData.rotation) * 2
  const noseZ = playerData.position.z + Math.cos(playerData.rotation) * 2
  particles?.spawnSparks(noseX, 0.8, noseZ, 8)
}

function updatePlayer(
  playerData: PlayerData,
  carMesh: THREE.Group,
  controls: { left: boolean; right: boolean; gas: boolean; brake: boolean },
  playerNum: number,
  delta: number,
) {
  const handling = getCarHandling(playerNum)
  const baseMaxSpeed = getCarMaxSpeed(playerNum)
  // 如果氮气加速激活且是当前玩家，提高最大速度
  const isBoosting = boostActive && boostPlayerData === playerData
  const maxSpeedValue = isBoosting
    ? baseMaxSpeed * RACING_SCORE.NITRO_MAX_SPEED_MULTIPLIER
    : baseMaxSpeed
  const speedRatio = Math.min(Math.abs(playerData.speed) / maxSpeedValue, 1)

  // 获取或初始化漂移状态
  if (!playerDriftState.has(playerData)) {
    playerDriftState.set(playerData, { isDrifting: false, driftVisual: 0 })
  }
  const driftState = playerDriftState.get(playerData)!

  // 漂移条件：速度够快 + 转向 + 刹车
  const isDrifting =
    playerData.speed > RACING_DRIFT.MIN_DRIFT_SPEED &&
    (controls.left || controls.right) &&
    controls.brake

  // 漂移出弯时给小涡轮加速
  if (driftState.isDrifting && !isDrifting) {
    playerData.speed = Math.min(playerData.speed * RACING_DRIFT.EXIT_BOOST, maxSpeedValue * 1.3)
  }
  driftState.isDrifting = isDrifting

  // 转向：速度越快转向越钝（模拟抓地力），低速禁转（禁止原地陀螺）
  const steerDirection = playerData.speed >= 0 ? 1 : -1
  const turnMultiplier = isDrifting ? RACING_DRIFT.TURN_MULTIPLIER : 1
  const steerRate =
    RACING_PHYSICS.STEER_RATE *
    handling *
    (1 - RACING_PHYSICS.STEER_SPEED_LOSS * speedRatio) *
    turnMultiplier

  if (Math.abs(playerData.speed) > RACING_PHYSICS.MIN_STEER_SPEED) {
    if (controls.left) {
      playerData.rotation += steerRate * delta * steerDirection
    }
    if (controls.right) {
      playerData.rotation -= steerRate * delta * steerDirection
    }
  }

  // 油门：接近极速时加速度衰减，形成"加速曲线"而不是瞬间满速
  if (controls.gas) {
    if (playerData.speed >= 0) {
      const accelFactor = 1 - 0.7 * Math.min(playerData.speed / maxSpeedValue, 1)
      playerData.speed = Math.min(
        playerData.speed + RACING_PHYSICS.ACCEL * accelFactor * delta,
        maxSpeedValue,
      )
    } else {
      // 倒车中踩油门 = 刹车
      playerData.speed = Math.min(playerData.speed + RACING_PHYSICS.BRAKE_DECEL * delta, 0)
    }
  } else if (!isDrifting && !controls.brake) {
    // 滑行：线性回正到 0
    if (playerData.speed > 0) {
      playerData.speed = Math.max(playerData.speed - RACING_PHYSICS.COAST_DECEL * delta, 0)
    } else if (playerData.speed < 0) {
      playerData.speed = Math.min(playerData.speed + RACING_PHYSICS.COAST_DECEL * delta, 0)
    }
  }
  if (controls.brake) {
    if (isDrifting) {
      // 漂移时保速（帧率无关：按 60fps 基准折算）
      playerData.speed *= Math.pow(RACING_DRIFT.SPEED_RETENTION, delta * 60)
    } else {
      playerData.speed = Math.max(
        playerData.speed - RACING_PHYSICS.BRAKE_DECEL * delta,
        -maxSpeedValue * RACING_PHYSICS.REVERSE_MAX_RATIO,
      )
    }
  }

  // 位移 + 撞墙滑行：先试全量移动，再退化到单轴滑动，最后才算正面撞死
  const moveX = Math.sin(playerData.rotation) * playerData.speed * delta
  const moveZ = Math.cos(playerData.rotation) * playerData.speed * delta
  const oldX = playerData.position.x
  const oldZ = playerData.position.z
  const shieldOn = shieldActive && shieldPlayerData === playerData

  if (shieldOn || !isOffTrack(oldX + moveX, oldZ + moveZ)) {
    playerData.position.x = oldX + moveX
    playerData.position.z = oldZ + moveZ
    if (shieldOn && isOffTrack(oldX + moveX, oldZ + moveZ)) {
      playerData.speed *= 0.9
    }
  } else if (!isOffTrack(oldX + moveX, oldZ)) {
    playerData.position.x = oldX + moveX
    playerData.speed *= Math.pow(RACING_PHYSICS.WALL_SLIDE_KEEP, delta * 60)
    onWallScrape(playerData, playerNum)
  } else if (!isOffTrack(oldX, oldZ + moveZ)) {
    playerData.position.z = oldZ + moveZ
    playerData.speed *= Math.pow(RACING_PHYSICS.WALL_SLIDE_KEEP, delta * 60)
    onWallScrape(playerData, playerNum)
  } else {
    // 正面撞死：大减速 + 强反馈
    if (Math.abs(playerData.speed) > RACING_PHYSICS.CRASH_SPEED_THRESHOLD) {
      onWallScrape(playerData, playerNum)
      if (playerNum === 1) cameraShake = RACING_CAMERA.SHAKE_MAX
    }
    playerData.speed *= RACING_PHYSICS.WALL_BLOCK_KEEP
  }

  // 漂移表现：轮胎痕迹 + 烟雾 + 车身视觉侧滑
  if (isDrifting) {
    createTireMark(playerData.position.x, playerData.position.z, playerData.rotation)
    if (particles && Math.random() < 0.6) {
      const rearX = playerData.position.x - Math.sin(playerData.rotation) * 1.6
      const rearZ = playerData.position.z - Math.cos(playerData.rotation) * 1.6
      particles.spawnSmoke(rearX, 0.4, rearZ)
    }
    driftState.driftVisual = THREE.MathUtils.lerp(
      driftState.driftVisual,
      controls.left ? -0.35 : 0.35,
      0.2,
    )
  } else {
    driftState.driftVisual = THREE.MathUtils.lerp(driftState.driftVisual, 0, 0.15)
  }

  carMesh.position.set(playerData.position.x, 0, playerData.position.z)
  carMesh.rotation.y = playerData.rotation + driftState.driftVisual

  // 车轮滚动（仅玩家1，AI 在 ./ai 中处理）
  if (playerNum === 1) {
    const wheelSpin = (playerData.speed * delta) / 0.38
    for (const wheel of wheels1) wheel.rotation.x += wheelSpin
  }

  if (playerNum === 1) {
    speed.value = Math.abs(playerData.speed)
    maxSpeed.value = Math.max(maxSpeed.value, speed.value)
    currentLap.value = Math.min(playerData.currentLap, totalLaps.value)
  }

  checkpoints.forEach((checkpoint, index) => {
    if (!playerData.checkpointsPassed[index]) {
      const distance = Math.hypot(
        playerData.position.x - checkpoint.x,
        playerData.position.z - checkpoint.z,
      )
      if (distance < 15) {
        playerData.checkpointsPassed[index] = true
      }
    }
  })

  if (playerData.checkpointsPassed.every((cp) => cp)) {
    playerData.checkpointsPassed = new Array(checkpoints.length).fill(false)
    playerData.currentLap++

    // 圈速统计
    const lapDuration = gameTime.value - playerData.lapStartTime
    playerData.lastLapTime = lapDuration
    if (!playerData.bestLapTime || lapDuration < playerData.bestLapTime) {
      playerData.bestLapTime = lapDuration
    }
    playerData.lapStartTime = gameTime.value

    if (playerData.currentLap > totalLaps.value) {
      playerData.finished = true
      playerData.finishTime = gameTime.value
      if (gameMode.value === 'multi') {
        winner.value = playerNum
        gameState.value = 'result'
      } else {
        finishSingleRace()
      }
    }
  }

  collectibles.forEach((item) => {
    if (!item.collected) {
      const distance = Math.hypot(
        playerData.position.x - item.mesh.position.x,
        playerData.position.z - item.mesh.position.z,
      )
      if (distance < 3) {
        item.collected = true
        item.mesh.visible = false
        if (playerNum === 1) {
          combo.value++
          const comboBonus = Math.min(combo.value, RACING_SCORE.MAX_COMBO)
          score.value += RACING_SCORE.COLLECTIBLE_BASE * comboBonus
          racingAudio.collect(combo.value)
          playerData.speed = Math.min(
            playerData.speed + RACING_SCORE.DRIFT_BOOST_SPEED,
            getCarMaxSpeed(playerNum),
          )
          if (comboResetTimer) clearTimeout(comboResetTimer)
          comboResetTimer = trackTimeout(() => {
            combo.value = 0
          }, 2000)
        }
      }
    }
  })
}

/** 单人冲线：算名次、奏乐、进结算。 */
function finishSingleRace() {
  const playerProg = raceProgress(trackPoints, player1Data)
  rank.value = 1 + aiCars.filter((a) => raceProgress(trackPoints, a.data) > playerProg).length
  racingAudio.stopEngine()
  racingAudio.finish(rank.value === 1)
  gameState.value = 'result'
}

/** 平滑跟随相机：滞后跟随 + FOV 随速度拉伸 + 碰撞震动。 */
function updateCameraSingle(delta: number) {
  const p = player1Data
  const desired = new THREE.Vector3(
    p.position.x - Math.sin(p.rotation) * RACING_CAMERA.OFFSET_BACK,
    RACING_CAMERA.OFFSET_Y,
    p.position.z - Math.cos(p.rotation) * RACING_CAMERA.OFFSET_BACK,
  )
  if (!camInitialized) {
    camPos.copy(desired)
    camInitialized = true
  }
  const k = 1 - Math.exp(-RACING_CAMERA.LERP_RATE * delta)
  camPos.lerp(desired, k)
  camera.position.copy(camPos)

  if (cameraShake > 0.003) {
    camera.position.x += (Math.random() - 0.5) * cameraShake
    camera.position.y += (Math.random() - 0.5) * cameraShake * 0.6
    cameraShake *= Math.exp(-RACING_CAMERA.SHAKE_DECAY * delta)
  }

  camera.lookAt(
    p.position.x + Math.sin(p.rotation) * RACING_CAMERA.LOOK_AHEAD,
    1.5,
    p.position.z + Math.cos(p.rotation) * RACING_CAMERA.LOOK_AHEAD,
  )

  // FOV 随速度拉伸，增强速度感
  const ratio = Math.abs(p.speed) / getCarMaxSpeed(1)
  const targetFov = RACING_CAMERA.FOV_BASE + RACING_CAMERA.FOV_BOOST * Math.min(ratio, 1.3)
  camera.fov += (targetFov - camera.fov) * Math.min(k * 1.5, 1)
  camera.updateProjectionMatrix()
}

/** 场景表现层动画：金币旋转浮动、下一个检查点门楼高亮、氮气火焰脉动。 */
function animateScene(t: number) {
  collectibles.forEach((item, i) => {
    if (item.collected) return
    item.mesh.rotation.y = t * 2 + i
    item.mesh.position.y = item.baseY + Math.sin(t * 2 + i) * 0.25
  })

  const nextIndex = player1Data.checkpointsPassed.findIndex((p) => !p)
  gates.forEach((gate, i) => {
    const isNext = i === (nextIndex === -1 ? 0 : nextIndex)
    const intensity = isNext ? 0.75 + Math.sin(t * 5) * 0.25 : 0.2
    gate.barMaterial.emissiveIntensity = intensity
    gate.pillarMaterial.emissiveIntensity = intensity
  })

  if (boosting.value && nitroFlame1 && nitroFlame1.visible) {
    nitroFlame1.scale.set(1, 0.9 + Math.random() * 0.5, 1)
  }
}

/** 玩家 vs AI 碰撞：位置分离始终生效，减速/音效带 0.5s 冷却。 */
let carCollisionCooldown = 0
function handleAICollisions(delta: number) {
  carCollisionCooldown = Math.max(0, carCollisionCooldown - delta)
  for (const ai of aiCars) {
    if (!checkCarCollision(player1Data.position, ai.data.position)) continue
    const angle = Math.atan2(
      ai.data.position.x - player1Data.position.x,
      ai.data.position.z - player1Data.position.z,
    )
    player1Data.position.x -= Math.sin(angle) * 0.4
    player1Data.position.z -= Math.cos(angle) * 0.4
    ai.data.position.x += Math.sin(angle) * 0.4
    ai.data.position.z += Math.cos(angle) * 0.4

    if (carCollisionCooldown <= 0) {
      carCollisionCooldown = 0.5
      player1Data.speed *= RACING_SCORE.CAR_COLLISION_SPEED_MULTIPLIER
      ai.data.speed *= RACING_SCORE.CAR_COLLISION_SPEED_MULTIPLIER
      racingAudio.crash(1)
      cameraShake = RACING_CAMERA.SHAKE_MAX
      const midX = (player1Data.position.x + ai.data.position.x) / 2
      const midZ = (player1Data.position.z + ai.data.position.z) / 2
      particles?.spawnSparks(midX, 0.8, midZ, 12)
    }
  }
}

function startGame() {
  // 防重入：先停掉可能仍在运行的渲染循环（否则两个 rAF 循环同时渲染，GPU 翻倍）
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = 0
  }

  gameTime.value = 0
  currentLap.value = 1
  skillsUsed.value = 0
  maxSpeed.value = 0
  score.value = 0
  combo.value = 0
  lapTime.value = 0
  rank.value = 1
  boosting.value = false
  boostActive = false
  boostPlayerData = null
  magnetActive = false
  magnetPlayerData = null
  shieldActive = false
  shieldPlayerData = null
  // 护盾网格仍挂在旧场景里，由 initScene 的 disposeObject 统一释放
  shieldMesh = null
  carCollisionCooldown = 0
  cameraShake = 0
  lastCrashSoundAt = -10

  skills.forEach((skill) => {
    skill.cooldown = 0
  })

  // 清理上一局的漂移痕迹：逐条移除并 dispose 材质（共享几何体保留复用，
  // 不能让它被 initScene 的 disposeObject 释放掉）
  if (scene) {
    for (let i = tireMarks.length - 1; i >= 0; i--) {
      removeTireMark(i)
    }
  }
  tireMarks.length = 0
  lastTireMarkTime = 0
  playerDriftState.clear()

  initScene()
  placeRacersOnGrid()
  totalRacers.value = gameMode.value === 'multi' ? 2 : 1 + aiCars.length

  // 进入倒计时：先渲染发车格，3-2-1-GO 后才放开操控
  countdownValue.value = 3
  gameState.value = 'countdown'
  racingAudio.init()
  racingAudio.countBeep(false)

  lastTime = performance.now()
  gameLoop()

  let count = 3
  const countdownInterval = trackInterval(() => {
    // 倒计时中退出/重开则作废
    if (gameState.value !== 'countdown') {
      clearInterval(countdownInterval)
      return
    }
    count--
    if (count > 0) {
      countdownValue.value = count
      racingAudio.countBeep(false)
    } else {
      clearInterval(countdownInterval)
      countdownValue.value = 0
      racingAudio.countBeep(true)
      gameState.value = 'playing'
      if (gameMode.value === 'single') racingAudio.startEngine()
      // GO 显示 0.9 秒后隐藏
      trackTimeout(() => {
        if (countdownValue.value === 0) countdownValue.value = -1
      }, 900)
    }
  }, 1000)
}

let lastTime = 0
function gameLoop() {
  if (gameState.value !== 'playing' && gameState.value !== 'countdown') return

  animationId = requestAnimationFrame(gameLoop)
  const now = performance.now()
  // clamp 大步长，防止切后台回来一帧飞出赛道
  const delta = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  const running = gameState.value === 'playing'

  if (running) {
    gameTime.value += delta
    lapTime.value = gameTime.value - player1Data.lapStartTime

    skills.forEach((skill) => {
      if (skill.cooldown > 0) {
        skill.cooldown = Math.max(0, skill.cooldown - delta)
      }
    })

    // 更新漂移痕迹
    updateTireMarks()
  }

  if (gameMode.value === 'single') {
    if (running) {
      const controls = {
        left: keyboardControls.p1Left || mobileControls.left,
        right: keyboardControls.p1Right || mobileControls.right,
        gas: keyboardControls.p1Gas || mobileControls.gas,
        brake: keyboardControls.p1Brake || mobileControls.brake,
      }
      updatePlayer(player1Data, car1, controls, 1, delta)

      // AI 对手
      const playerProgress = raceProgress(trackPoints, player1Data)
      for (const ai of aiCars) {
        updateAI(ai, {
          points: trackPoints,
          checkpoints,
          delta,
          totalLaps: totalLaps.value,
          gameTime: gameTime.value,
          playerProgress,
        })
      }
      handleAICollisions(delta)

      // 实时名次
      rank.value =
        1 + aiCars.filter((a) => raceProgress(trackPoints, a.data) > playerProgress).length

      // 引擎音调跟随速度
      racingAudio.setEngine(Math.abs(player1Data.speed) / getCarMaxSpeed(1), boosting.value)
    }
    updateCameraSingle(delta)
    if (renderer && scene && camera) {
      renderer.render(scene, camera)
    }
  } else {
    if (running) {
      const p1Controls = {
        left: keyboardControls.p1Left,
        right: keyboardControls.p1Right,
        gas: keyboardControls.p1Gas,
        brake: keyboardControls.p1Brake,
      }
      const p2Controls = {
        left: keyboardControls.p2Left,
        right: keyboardControls.p2Right,
        gas: keyboardControls.p2Gas,
        brake: keyboardControls.p2Brake,
      }

      updatePlayer(player1Data, car1, p1Controls, 1, delta)
      updatePlayer(player2Data, car2, p2Controls, 2, delta)

      if (checkCarCollision(player1Data.position, player2Data.position)) {
        player1Data.speed *= RACING_SCORE.CAR_COLLISION_SPEED_MULTIPLIER
        player2Data.speed *= RACING_SCORE.CAR_COLLISION_SPEED_MULTIPLIER
        const angle = Math.atan2(
          player2Data.position.x - player1Data.position.x,
          player2Data.position.z - player1Data.position.z,
        )
        player1Data.position.x -= Math.sin(angle) * 0.5
        player1Data.position.z -= Math.cos(angle) * 0.5
        player2Data.position.x += Math.sin(angle) * 0.5
        player2Data.position.z += Math.cos(angle) * 0.5
      }
    }

    if (renderer && camera && camera2) {
      const halfWidth = window.innerWidth / 2

      renderer.setViewport(0, 0, halfWidth, window.innerHeight)
      renderer.setScissor(0, 0, halfWidth, window.innerHeight)
      renderer.setScissorTest(true)
      renderSplitScreenView(camera, player1Data, halfWidth)
      renderer.render(scene, camera)

      renderer.setViewport(halfWidth, 0, halfWidth, window.innerHeight)
      renderer.setScissor(halfWidth, 0, halfWidth, window.innerHeight)
      renderer.setScissorTest(true)
      renderSplitScreenView(camera2, player2Data, halfWidth)
      renderer.render(scene, camera2)

      renderer.setScissorTest(false)
    }
  }

  // 表现层动画倒计时期间也运行（金币旋转、门楼呼吸灯）
  animateScene(now / 1000)
  particles?.update(delta)
  updateMinimap()
}

// 键盘映射：p1=WASD, p2=方向键。合并 handleKeyDown/handleKeyUp 的对称分支。
const KEY_BINDINGS: { key: string; control: keyof typeof keyboardControls }[] = [
  { key: 'a', control: 'p1Left' },
  { key: 'd', control: 'p1Right' },
  { key: 'w', control: 'p1Gas' },
  { key: 's', control: 'p1Brake' },
  { key: 'ArrowLeft', control: 'p2Left' },
  { key: 'ArrowRight', control: 'p2Right' },
  { key: 'ArrowUp', control: 'p2Gas' },
  { key: 'ArrowDown', control: 'p2Brake' },
]

const SKILL_KEYS: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 }

function applyKeyBinding(e: KeyboardEvent, value: boolean) {
  const binding = KEY_BINDINGS.find((b) => b.key === e.key)
  if (binding) keyboardControls[binding.control] = value
}

function handleKeyDown(e: KeyboardEvent) {
  applyKeyBinding(e, true)

  if (gameMode.value === 'single') {
    const skillIndex = SKILL_KEYS[e.key]
    if (skillIndex !== undefined) useSkill(1, skillIndex)
  }

  if (e.key === 'Escape' && gameState.value === 'playing') {
    pauseGame()
  }
}

function handleKeyUp(e: KeyboardEvent) {
  applyKeyBinding(e, false)
}

function handleResize() {
  if (!camera || !renderer) return
  if (gameMode.value === 'single') {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  }
  renderer.setSize(window.innerWidth, window.innerHeight)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('resize', handleResize)
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  // 清理所有被跟踪的定时器 / 动画帧（磁铁、护盾、氮气、连击、导弹、倒计时等）
  trackedIntervals.forEach((id) => clearInterval(id))
  trackedTimeouts.forEach((id) => clearTimeout(id))
  trackedRafs.forEach((id) => cancelAnimationFrame(id))
  trackedIntervals.length = 0
  trackedTimeouts.length = 0
  trackedRafs.length = 0
  racingAudio.dispose()
  particles?.dispose()
  if (scene) {
    disposeObject(scene)
  }
  if (tireMarkGeometry) {
    tireMarkGeometry.dispose()
    tireMarkGeometry = null
  }
  if (renderer) {
    renderer.dispose()
  }
})
</script>

<style scoped>
/* 局部设计 token：集中重复颜色字面量，不改观感 */
.racing-game {
  --racing-accent: #ff6b6b;
  --racing-accent-rgb: 255, 107, 107;
  --racing-accent-2: #ff8e53;
  --racing-gold: #ffd700;

  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

canvas {
  width: 100%;
  height: 100%;
}

/* 返回按钮 */
.back-btn {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 25px;
  color: var(--text-inverse);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  z-index: 20;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* 游戏菜单 */
.game-menu {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  z-index: 10;
  overflow-y: auto;
  padding: 80px 20px 40px;
}

.game-menu h1 {
  font-size: 2.5rem;
  color: var(--text-inverse);
  text-shadow: 0 0 20px var(--racing-accent);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--text-muted);
  font-size: 1.2rem;
  margin-bottom: 1.5rem;
}

/* 模式选择 */
.mode-select {
  margin-bottom: 1.5rem;
  width: 100%;
  max-width: 400px;
}

.mode-select h3 {
  color: var(--text-inverse);
  margin-bottom: 1rem;
  text-align: center;
}

.mode-options {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.mode-option {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 1rem 1.5rem;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
  color: var(--text-inverse);
  flex: 1;
}

.mode-option:hover {
  background: rgba(255, 255, 255, 0.2);
}

.mode-option.selected {
  border-color: var(--racing-accent);
  background: rgba(var(--racing-accent-rgb), 0.2);
}

.mode-icon {
  font-size: 1.5rem;
  display: block;
  margin-bottom: 0.3rem;
}

/* 赛车选择轮播 */
.car-select {
  margin-bottom: 1.5rem;
  width: 100%;
  max-width: 400px;
}

.car-select h3 {
  color: var(--text-inverse);
  margin-bottom: 1rem;
  text-align: center;
}

.car-carousel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
}

.carousel-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-inverse);
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: var(--racing-accent);
}

.car-display {
  flex: 1;
  max-width: 250px;
}

.car-card {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
  text-align: center;
}

.car-preview-large {
  width: 100%;
  height: 100px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 15px;
}

.car-shape {
  font-size: 3rem;
}

.car-card h4 {
  color: var(--text-inverse);
  font-size: 1.3rem;
  margin-bottom: 15px;
}

.car-stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat span {
  color: var(--text-muted);
  font-size: 0.85rem;
  min-width: 35px;
}

.stat-value {
  color: var(--racing-accent) !important;
  font-weight: bold;
}

.stat-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.stat-bar div {
  height: 100%;
  background: linear-gradient(90deg, var(--racing-accent), var(--racing-accent-2));
  border-radius: 4px;
  transition: width 0.3s;
}

.car-dots {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 15px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.3s;
}

.dot.active {
  background: var(--racing-accent);
  transform: scale(1.2);
}

.start-btn {
  padding: 14px 50px;
  font-size: 1.2rem;
  background: linear-gradient(135deg, var(--racing-accent) 0%, var(--racing-accent-2) 100%);
  color: var(--text-inverse);
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition:
    transform 0.3s,
    box-shadow 0.3s;
  margin-bottom: 15px;
}

.start-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 30px rgba(var(--racing-accent-rgb), 0.5);
}

.controls-hint {
  color: var(--text-dim);
  font-size: 0.85rem;
  text-align: center;
}

/* 暂停菜单 */
.pause-menu {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  z-index: 20;
}

.pause-content {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  border: 2px solid rgba(255, 255, 255, 0.1);
}

.pause-content h2 {
  color: var(--text-inverse);
  font-size: 2rem;
  margin-bottom: 30px;
}

.pause-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.pause-buttons button {
  padding: 15px 40px;
  font-size: 1.1rem;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.pause-buttons button:first-child {
  background: linear-gradient(135deg, var(--racing-accent) 0%, var(--racing-accent-2) 100%);
  color: var(--text-inverse);
}

.pause-buttons button:nth-child(2) {
  background: rgba(255, 255, 255, 0.15);
  color: var(--text-inverse);
}

.pause-buttons button:nth-child(3) {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-secondary);
}

.pause-buttons button:last-child {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
}

.pause-buttons button:hover {
  transform: scale(1.05);
}

/* 游戏HUD */
.game-hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

/* 暂停按钮 */
.pause-btn {
  position: absolute;
  top: 15px;
  left: 15px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.5);
  color: var(--text-inverse);
  font-size: 1.2rem;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pause-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  border-color: var(--racing-accent);
}

.hud-top {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  padding: 15px 70px 0 70px;
  gap: 10px;
}

.speed-display {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 16px;
  border-radius: 12px;
  border: 2px solid var(--racing-accent);
  min-width: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.speed-display.small {
  padding: 6px 12px;
}

.speed-value {
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--racing-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.speed-display.small .speed-value {
  font-size: 1.3rem;
}

.speed-unit {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-left: 4px;
}

.score-display {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 14px;
  border-radius: 12px;
  border: 2px solid var(--racing-gold);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 80px;
}

.score-value {
  font-size: 1.3rem;
  font-weight: bold;
  color: var(--racing-gold);
}

.combo-value {
  font-size: 1.1rem;
  color: var(--racing-accent);
  animation: pulse 0.5s ease-in-out;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}

.lap-info,
.time-info {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 14px;
  border-radius: 12px;
  border: 2px solid var(--border-light);
  color: var(--text-inverse);
  font-size: 1rem;
  min-width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lap-info.small {
  font-size: 0.85rem;
  padding: 6px 10px;
}

.split-hud {
  display: flex;
  justify-content: space-between;
  padding: 15px;
}

.player-hud {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player1-hud {
  align-items: flex-start;
}

.player2-hud {
  align-items: flex-end;
}

.hud-label {
  background: rgba(0, 0, 0, 0.7);
  padding: 6px 14px;
  border-radius: 8px;
  color: var(--text-inverse);
  font-weight: bold;
}

.player1-hud .hud-label {
  background: rgba(255, 0, 0, 0.5);
}

.player2-hud .hud-label {
  background: rgba(0, 0, 255, 0.5);
}

.skills-bar {
  position: absolute;
  bottom: 140px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  pointer-events: auto;
}

.skill-item {
  position: relative;
  width: 52px;
  height: 52px;
  background: rgba(0, 0, 0, 0.7);
  border: 2px solid var(--border-light);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
}

.skill-item.active {
  border-color: var(--racing-accent);
  box-shadow: 0 0 12px rgba(var(--racing-accent-rgb), 0.5);
}

.skill-item.cooldown {
  opacity: 0.6;
}

.skill-icon {
  font-size: 1.4rem;
}

.cooldown-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-inverse);
  font-weight: bold;
  font-size: 0.9rem;
}

.skill-key {
  position: absolute;
  bottom: -6px;
  right: -4px;
  background: var(--racing-accent);
  color: var(--text-inverse);
  font-size: 0.6rem;
  padding: 2px 5px;
  border-radius: 4px;
}

.minimap {
  position: absolute;
  bottom: 15px;
  right: 15px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 12px;
  border: 2px solid var(--border-light);
  overflow: hidden;
}

.mobile-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 180px;
  pointer-events: none;
  z-index: 5;
}

.control-left,
.control-right {
  position: absolute;
  bottom: 25px;
}

.control-left {
  left: 25px;
}

.control-right {
  left: 105px;
}

.control-gas,
.control-brake {
  position: absolute;
  bottom: 25px;
}

.control-gas {
  right: 105px;
}

.control-brake {
  right: 25px;
}

.control-btn {
  width: 65px;
  height: 65px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  font-size: 1.4rem;
  pointer-events: auto;
  cursor: pointer;
  transition: transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:active {
  transform: scale(0.9);
}

.left-btn,
.right-btn {
  background: rgba(255, 255, 255, 0.2);
  color: var(--text-inverse);
}

.gas-btn {
  background: rgba(76, 175, 80, 0.6);
}

.brake-btn {
  background: rgba(244, 67, 54, 0.6);
}

.game-result {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);
  z-index: 10;
}

.game-result h2 {
  font-size: 2.2rem;
  color: var(--racing-gold);
  margin-bottom: 1rem;
  text-shadow: 0 0 20px var(--racing-gold);
}

.winner-announce {
  font-size: 1.8rem;
  color: var(--racing-accent);
  margin-bottom: 1.5rem;
  text-shadow: 0 0 15px var(--racing-accent);
}

.result-stats {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 25px;
  margin-bottom: 2rem;
  min-width: 280px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  gap: 40px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-inverse);
  font-size: 1.1rem;
}

.result-item:last-child {
  border-bottom: none;
}

.final-score {
  color: var(--racing-gold);
  font-weight: bold;
  font-size: 1.3rem;
}

.result-buttons {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  justify-content: center;
}

.result-buttons button {
  padding: 14px 24px;
  font-size: 1rem;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.3s;
}

.result-buttons button:first-child {
  background: linear-gradient(135deg, var(--racing-accent) 0%, var(--racing-accent-2) 100%);
  color: var(--text-inverse);
}

.result-buttons button:nth-child(2) {
  background: rgba(255, 255, 255, 0.2);
  color: var(--text-inverse);
}

.result-buttons button:last-child {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
}

.result-buttons button:hover {
  transform: scale(1.05);
}

/* 名次显示 */
.rank-display {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 16px;
  border-radius: 12px;
  border: 2px solid var(--racing-gold);
  min-width: 80px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
}

.rank-value {
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--racing-gold);
}

.rank-total {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* 氮气激活时的速度表光效 */
.speed-display.boosting {
  border-color: #66ccff;
  box-shadow: 0 0 18px rgba(102, 204, 255, 0.8);
  animation: boostGlow 0.4s ease-in-out infinite alternate;
}

.speed-display.boosting .speed-value {
  color: #66ccff;
}

@keyframes boostGlow {
  from {
    box-shadow: 0 0 10px rgba(102, 204, 255, 0.5);
  }
  to {
    box-shadow: 0 0 24px rgba(102, 204, 255, 0.95);
  }
}

/* 圈速 */
.time-info {
  flex-direction: column;
  gap: 2px;
}

.lap-time-current {
  font-size: 1.1rem;
  font-weight: bold;
  color: var(--text-inverse);
}

.lap-time-last {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* 倒计时覆盖层 */
.countdown-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
  pointer-events: none;
  z-index: 8;
}

.countdown-lights {
  display: flex;
  gap: 18px;
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.75);
  border-radius: 40px;
  border: 2px solid rgba(255, 255, 255, 0.15);
}

.cd-light {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  transition:
    background 0.15s,
    box-shadow 0.15s;
}

.cd-light.on {
  background: #ff3b30;
  box-shadow: 0 0 18px rgba(255, 59, 48, 0.9);
}

.cd-light.go {
  background: #34c759;
  box-shadow: 0 0 18px rgba(52, 199, 89, 0.9);
}

.countdown-number {
  font-size: 6rem;
  font-weight: 900;
  color: var(--text-inverse);
  text-shadow: 0 0 30px var(--racing-accent);
  animation: countPop 0.9s ease-out;
}

.countdown-number.go {
  color: #34c759;
  text-shadow: 0 0 40px rgba(52, 199, 89, 0.9);
}

@keyframes countPop {
  0% {
    transform: scale(1.6);
    opacity: 0;
  }
  30% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(0.95);
    opacity: 1;
  }
}

.final-rank {
  color: var(--racing-gold);
  font-weight: bold;
}

/* 响应式设计 - 移动端优化 */
@media (max-width: 768px) {
  .game-menu {
    padding: 70px 15px 30px;
  }

  .game-menu h1 {
    font-size: 1.8rem;
  }

  .subtitle {
    font-size: 1rem;
    margin-bottom: 1rem;
  }

  .mode-select {
    margin-bottom: 1rem;
  }

  .mode-options {
    gap: 0.6rem;
  }

  .mode-option {
    padding: 0.8rem 1rem;
    font-size: 0.9rem;
  }

  .mode-icon {
    font-size: 1.2rem;
  }

  .car-select {
    margin-bottom: 1rem;
  }

  .carousel-btn {
    width: 36px;
    height: 36px;
    font-size: 1.2rem;
  }

  .car-display {
    max-width: 200px;
  }

  .car-card {
    padding: 14px;
  }

  .car-preview-large {
    height: 80px;
    margin-bottom: 10px;
  }

  .car-shape {
    font-size: 2.2rem;
  }

  .car-card h4 {
    font-size: 1.1rem;
    margin-bottom: 10px;
  }

  .start-btn {
    padding: 12px 40px;
    font-size: 1rem;
  }

  .controls-hint {
    font-size: 0.75rem;
  }

  .hud-top {
    padding: 10px 15px 0 15px;
    gap: 6px;
  }

  .speed-display {
    padding: 6px 10px;
    min-width: 70px;
  }

  .speed-value {
    font-size: 1.3rem;
  }

  .score-display {
    padding: 6px 10px;
    min-width: 60px;
  }

  .score-value {
    font-size: 1rem;
  }

  .lap-info,
  .time-info {
    padding: 6px 10px;
    min-width: 60px;
    font-size: 0.85rem;
  }

  .skills-bar {
    bottom: 190px;
    gap: 8px;
  }

  .skill-item {
    width: 44px;
    height: 44px;
  }

  .skill-icon {
    font-size: 1.1rem;
  }

  .minimap {
    bottom: 190px;
    right: 10px;
  }

  .minimap canvas {
    width: 100px;
    height: 100px;
  }

  .mobile-controls {
    height: 160px;
  }

  .control-btn {
    width: 58px;
    height: 58px;
    font-size: 1.2rem;
  }

  .control-left {
    left: 15px;
    bottom: 20px;
  }

  .control-right {
    left: 85px;
    bottom: 20px;
  }

  .control-gas {
    right: 85px;
    bottom: 20px;
  }

  .control-brake {
    right: 15px;
    bottom: 20px;
  }

  .back-btn {
    top: 15px;
    left: 15px;
    padding: 8px 14px;
    font-size: 14px;
  }

  .pause-btn {
    top: 10px;
    left: 10px;
    width: 38px;
    height: 38px;
    font-size: 1rem;
  }

  .pause-content {
    padding: 25px;
  }

  .pause-content h2 {
    font-size: 1.5rem;
    margin-bottom: 20px;
  }

  .pause-buttons button {
    padding: 12px 30px;
    font-size: 0.95rem;
  }

  .game-result h2 {
    font-size: 1.6rem;
  }

  .result-stats {
    padding: 18px;
    min-width: 240px;
  }

  .result-item {
    font-size: 0.95rem;
    gap: 20px;
  }

  .result-buttons button {
    padding: 12px 24px;
    font-size: 0.9rem;
  }

  .car-carousel {
    touch-action: pan-y;
  }

  .car-display {
    touch-action: pan-y;
    user-select: none;
  }

  .rank-display {
    padding: 6px 10px;
    min-width: 60px;
  }

  .rank-value {
    font-size: 1.2rem;
  }

  .countdown-number {
    font-size: 4rem;
  }

  .cd-light {
    width: 26px;
    height: 26px;
  }

  .lap-time-last {
    display: none;
  }
}
</style>
