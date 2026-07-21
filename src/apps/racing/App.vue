<template>
  <div class="racing-game" ref="gameContainer">
    <canvas ref="gameCanvas"></canvas>
    <div v-if="gameState === 'menu'" class="game-menu">
      <button class="back-btn" @click="goBack">
        <span>←</span>
        <span>返回</span>
      </button>

      <h1>🏎️ 极速狂飙</h1>
      <p class="subtitle">3D赛车竞速</p>

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
        <p v-if="gameMode === 'single'">键盘: WASD/方向键控制，1-4释放技能</p>
        <p v-else>玩家1: WASD控制 | 玩家2: 方向键控制</p>
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
          <div class="speed-display">
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
            <span>{{ formatClock(gameTime) }}</span>
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
            <span>用时</span>
            <span>{{ formatClock(gameTime) }}</span>
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
import { RACING_CARS, RACING_DRIFT, RACING_TRACK, RACING_SCORE, type RacingCar } from './config'
import { getCarById, cycleCar, renderSplitScreenView } from './utils'

const router = useRouter()
const gameContainer = ref<HTMLDivElement>()
const gameCanvas = ref<HTMLCanvasElement>()
const minimapCanvas = ref<HTMLCanvasElement>()

// 游戏状态
const gameState = ref<'menu' | 'playing' | 'paused' | 'result'>('menu')
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

// 玩家数据
interface PlayerData {
  position: { x: number; z: number }
  rotation: number
  speed: number
  currentLap: number
  checkpointIndex: number
  finishTime: number
  checkpointsPassed: boolean[]
}

const player1Data = reactive<PlayerData>({
  position: { x: 0, z: 0 },
  rotation: 0,
  speed: 0,
  currentLap: 1,
  checkpointIndex: 0,
  finishTime: 0,
  checkpointsPassed: [],
})

const player2Data = reactive<PlayerData>({
  position: { x: 0, z: 0 },
  rotation: 0,
  speed: 0,
  currentLap: 1,
  checkpointIndex: 0,
  finishTime: 0,
  checkpointsPassed: [],
})

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
let animationId: number

// 游戏数据
let trackPoints: THREE.Vector3[] = []
let checkpoints: THREE.Vector3[] = []
let collectibles: { mesh: THREE.Mesh; collected: boolean }[] = []
let wallMeshes: THREE.Mesh[] = []
let comboResetTimer: ReturnType<typeof setTimeout> | null = null

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
  gameState.value = 'paused'
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
}

// 继续游戏
function resumeGame() {
  gameState.value = 'playing'
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
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
}

// 初始化Three.js场景
function initScene() {
  if (!gameCanvas.value) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb)
  scene.fog = new THREE.Fog(0x87ceeb, 100, 500)

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 10, -20)
  camera.lookAt(0, 0, 0)

  if (gameMode.value === 'multi') {
    camera2 = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  }

  // 复用同一个 WebGLRenderer，避免每次开始/重开游戏都 new 一个上下文导致泄漏
  // （反复创建且不 dispose 旧上下文会让浏览器累计超限并封禁该页面，报
  // "Error creating WebGL context / context loss and was blocked"）
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      canvas: gameCanvas.value,
      antialias: true,
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
  } else {
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(50, 100, 50)
  directionalLight.castShadow = true
  scene.add(directionalLight)

  createTrack()
  car1 = createCar(selectedCar.value)
  scene.add(car1)

  if (gameMode.value === 'multi') {
    car2 = createCar(selectedCar2.value)
    scene.add(car2)
  }

  createEnvironment()
  createCollectibles()
}

function createTrack() {
  trackPoints = []
  const segments = RACING_TRACK.SEGMENTS
  const radius = RACING_TRACK.RADIUS

  // 随机扰动参数，限制范围确保弯道可通行
  const wave1 = 10 + Math.random() * 10 // 10-20，较小的波浪
  const wave2 = 8 + Math.random() * 10 // 8-18
  const freq1 = 2 // 固定频率2，避免太密集的弯道
  const freq2 = 3 // 固定频率3
  const phase1 = Math.random() * Math.PI * 2
  const phase2 = Math.random() * Math.PI * 2

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const x = Math.cos(angle) * radius + Math.sin(angle * freq1 + phase1) * wave1
    const z = Math.sin(angle) * radius + Math.cos(angle * freq2 + phase2) * wave2
    trackPoints.push(new THREE.Vector3(x, 0, z))
  }

  const trackGeometry = new THREE.PlaneGeometry(250, 250)
  const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 })
  const track = new THREE.Mesh(trackGeometry, trackMaterial)
  track.rotation.x = -Math.PI / 2
  track.position.y = 0.01
  track.receiveShadow = true
  scene.add(track)

  const centerLineGeometry = new THREE.BufferGeometry().setFromPoints(trackPoints)
  const centerLineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff })
  const centerLine = new THREE.Line(centerLineGeometry, centerLineMaterial)
  centerLine.position.y = 0.02
  scene.add(centerLine)

  wallMeshes = []
  const wallHeight = RACING_TRACK.WALL_HEIGHT
  const wallThickness = 1
  const trackWidth = RACING_TRACK.WIDTH

  for (let i = 0; i < trackPoints.length; i++) {
    const current = trackPoints[i]
    const next = trackPoints[(i + 1) % trackPoints.length]
    const direction = new THREE.Vector3().subVectors(next, current).normalize()
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x)

    const leftWallPos = current.clone().add(perpendicular.clone().multiplyScalar(trackWidth / 2))
    createWall(leftWallPos, direction, wallHeight, wallThickness, 0x666666)

    const rightWallPos = current.clone().sub(perpendicular.clone().multiplyScalar(trackWidth / 2))
    createWall(rightWallPos, direction, wallHeight, wallThickness, 0x666666)
  }

  checkpoints = []
  for (let i = 0; i < RACING_TRACK.CHECKPOINTS; i++) {
    const index = Math.floor((i / RACING_TRACK.CHECKPOINTS) * trackPoints.length)
    const point = trackPoints[index]
    checkpoints.push(point.clone())

    const checkpointGeometry = new THREE.BoxGeometry(trackWidth, 6, 0.5)
    const checkpointMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.4,
      emissive: 0x00ff00,
      emissiveIntensity: 0.3,
    })
    const checkpointMesh = new THREE.Mesh(checkpointGeometry, checkpointMaterial)
    checkpointMesh.position.copy(point)
    checkpointMesh.position.y = 3
    scene.add(checkpointMesh)
  }
}

function createWall(
  position: THREE.Vector3,
  direction: THREE.Vector3,
  height: number,
  thickness: number,
  color: number,
) {
  const wallLength = 5
  const wallGeometry = new THREE.BoxGeometry(thickness, height, wallLength)
  const wallMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  const wall = new THREE.Mesh(wallGeometry, wallMaterial)
  wall.position.copy(position)
  wall.position.y = height / 2
  wall.lookAt(position.clone().add(direction))
  wall.castShadow = true
  wall.receiveShadow = true
  scene.add(wall)
  wallMeshes.push(wall)
  return wall
}

function createCar(carId: number): THREE.Group {
  const car = new THREE.Group()
  const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 4)
  const selectedCarData = getCarById(carId)
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: selectedCarData?.color || 0xff0000,
    metalness: 0.8,
    roughness: 0.2,
  })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.position.y = 0.6
  body.castShadow = true
  car.add(body)

  const roofGeometry = new THREE.BoxGeometry(1.6, 0.6, 2)
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    metalness: 0.9,
    roughness: 0.1,
  })
  const roof = new THREE.Mesh(roofGeometry, roofMaterial)
  roof.position.set(0, 1.2, -0.3)
  roof.castShadow = true
  car.add(roof)

  const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.4, 16)
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 })
  const wheelPositions = [
    { x: -1, z: 1.2 },
    { x: 1, z: 1.2 },
    { x: -1, z: -1.2 },
    { x: 1, z: -1.2 },
  ]
  wheelPositions.forEach((pos) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
    wheel.position.set(pos.x, 0.3, pos.z)
    wheel.rotation.z = Math.PI / 2
    wheel.castShadow = true
    car.add(wheel)
  })

  const headlightGeometry = new THREE.SphereGeometry(0.2)
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    emissive: 0xffff00,
    emissiveIntensity: 0.5,
  })
  const headlight1 = new THREE.Mesh(headlightGeometry, headlightMaterial)
  headlight1.position.set(-0.7, 0.6, 2)
  car.add(headlight1)
  const headlight2 = new THREE.Mesh(headlightGeometry, headlightMaterial)
  headlight2.position.set(0.7, 0.6, 2)
  car.add(headlight2)

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 0.3,
  })
  const taillight1 = new THREE.Mesh(headlightGeometry, taillightMaterial)
  taillight1.position.set(-0.7, 0.6, -2)
  car.add(taillight1)
  const taillight2 = new THREE.Mesh(headlightGeometry, taillightMaterial)
  taillight2.position.set(0.7, 0.6, -2)
  car.add(taillight2)

  return car
}

function createEnvironment() {
  const groundGeometry = new THREE.PlaneGeometry(500, 500)
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 1 })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.1
  ground.receiveShadow = true
  scene.add(ground)

  for (let i = 0; i < 100; i++) {
    const tree = createTree()
    const angle = Math.random() * Math.PI * 2
    const distance = 120 + Math.random() * 100
    tree.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
    scene.add(tree)
  }

  for (let i = 0; i < 20; i++) {
    const building = createBuilding()
    const angle = Math.random() * Math.PI * 2
    const distance = 150 + Math.random() * 100
    building.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
    scene.add(building)
  }
}

function createTree(): THREE.Group {
  const tree = new THREE.Group()
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 3)
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 })
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
  trunk.position.y = 1.5
  trunk.castShadow = true
  tree.add(trunk)

  const leavesGeometry = new THREE.ConeGeometry(2, 4, 8)
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 })
  const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial)
  leaves.position.y = 4
  leaves.castShadow = true
  tree.add(leaves)
  return tree
}

function createBuilding(): THREE.Group {
  const building = new THREE.Group()
  const width = 5 + Math.random() * 10
  const height = 10 + Math.random() * 20
  const depth = 5 + Math.random() * 10
  const buildingGeometry = new THREE.BoxGeometry(width, height, depth)
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(Math.random(), 0.3, 0.6),
    roughness: 0.7,
  })
  const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial)
  buildingMesh.position.y = height / 2
  buildingMesh.castShadow = true
  building.add(buildingMesh)
  return building
}

function createCollectibles() {
  collectibles = []
  for (let i = 0; i < 20; i++) {
    const geometry = new THREE.OctahedronGeometry(0.8)
    const material = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffd700,
      emissiveIntensity: 0.5,
    })
    const mesh = new THREE.Mesh(geometry, material)
    const pointIndex = Math.floor(Math.random() * trackPoints.length)
    const point = trackPoints[pointIndex]
    mesh.position.set(point.x + (Math.random() - 0.5) * 8, 1.5, point.z + (Math.random() - 0.5) * 8)
    scene.add(mesh)
    collectibles.push({ mesh, collected: false })
  }
}

// 找到最近的赛道中心点
function findNearestTrackPoint(x: number, z: number): THREE.Vector3 | null {
  let minDist = Infinity
  let nearestPoint: THREE.Vector3 | null = null

  for (const point of trackPoints) {
    const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(z - point.z, 2))
    if (dist < minDist) {
      minDist = dist
      nearestPoint = point
    }
  }

  return nearestPoint
}

// 检查位置是否在赛道范围内（检查到赛道线段的距离）
function isOnTrack(x: number, z: number): boolean {
  const trackHalfWidth = 10 // 赛道宽度20，半宽10
  let minDist = Infinity

  // 检查到每条赛道线段的距离
  for (let i = 0; i < trackPoints.length; i++) {
    const current = trackPoints[i]
    const next = trackPoints[(i + 1) % trackPoints.length]

    // 计算点到线段的距离
    const A = x - current.x
    const B = z - current.z
    const C = next.x - current.x
    const D = next.z - current.z

    const dot = A * C + B * D
    const lenSq = C * C + D * D
    let param = -1

    if (lenSq !== 0) {
      param = dot / lenSq
    }

    let xx, zz

    if (param < 0) {
      xx = current.x
      zz = current.z
    } else if (param > 1) {
      xx = next.x
      zz = next.z
    } else {
      xx = current.x + param * C
      zz = current.z + param * D
    }

    const dist = Math.sqrt(Math.pow(x - xx, 2) + Math.pow(z - zz, 2))
    if (dist < minDist) {
      minDist = dist
    }
  }

  // 如果距离赛道中心超过赛道半宽，则不在赛道上
  return minDist <= trackHalfWidth
}

function checkCollision(x: number, z: number, carWidth: number = 2): boolean {
  const halfWidth = carWidth / 2
  for (const wall of wallMeshes) {
    const wallPos = wall.position
    const distance = Math.sqrt(Math.pow(x - wallPos.x, 2) + Math.pow(z - wallPos.z, 2))
    if (distance < halfWidth + 1) {
      return true
    }
  }
  // 检查是否在赛道范围内
  if (!isOnTrack(x, z)) {
    return true
  }
  return false
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
  const skill = skills[index]
  if (skill.cooldown > 0) return
  skill.cooldown = skill.maxCooldown
  skillsUsed.value++
  const playerData = player === 1 ? player1Data : player2Data

  switch (skill.id) {
    case 1:
      // 氮气加速 - 临时提高最大速度
      boostActive = true
      boostPlayerData = playerData
      playerData.speed += RACING_SCORE.NITRO_SPEED_BONUS
      trackTimeout(() => {
        boostActive = false
        boostPlayerData = null
        playerData.speed = Math.min(playerData.speed, getCarMaxSpeed(player))
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

  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(playerCar.quaternion)
  const missileSpeed = 3
  const targetData = player === 1 ? player2Data : player1Data

  const animateMissile = () => {
    missile.position.add(direction.clone().multiplyScalar(missileSpeed))
    if (gameMode.value === 'multi') {
      const distance = Math.sqrt(
        Math.pow(missile.position.x - targetData.position.x, 2) +
          Math.pow(missile.position.z - targetData.position.z, 2),
      )
      if (distance < 3) {
        targetData.speed *= RACING_SCORE.MISSILE_HIT_SPEED_MULTIPLIER
        scene.remove(missile)
        if (player === 1) {
          score.value += RACING_SCORE.MISSILE_HIT_SCORE
        }
        return
      }
    }
    if (missile.position.distanceTo(playerCar.position) < 100) {
      trackRaf(animateMissile)
    } else {
      scene.remove(missile)
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
    // 护盾结束时，如果车在赛道外，传送回赛道
    if (!isOnTrack(playerData.position.x, playerData.position.z)) {
      const nearestPoint = findNearestTrackPoint(playerData.position.x, playerData.position.z)
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
  ctx.fillStyle = '#ff0000'
  ctx.beginPath()
  ctx.arc(p1X, p1Y, 4, 0, Math.PI * 2)
  ctx.fill()

  if (gameMode.value === 'multi') {
    const p2X = (player2Data.position.x / 200) * 150 + 75
    const p2Y = (player2Data.position.z / 200) * 150 + 75
    ctx.fillStyle = '#0000ff'
    ctx.beginPath()
    ctx.arc(p2X, p2Y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

// 漂移状态追踪
const playerDriftState = new Map<PlayerData, { isDrifting: boolean; driftAngle: number }>()

// 创建漂移痕迹
function createTireMark(x: number, z: number, rotation: number) {
  const now = performance.now() / 1000
  if (now - lastTireMarkTime < RACING_DRIFT.TIRE_MARK_INTERVAL) return
  lastTireMarkTime = now

  // 控制最大痕迹数量
  if (tireMarks.length >= RACING_DRIFT.MAX_TIRE_MARKS) {
    const oldest = tireMarks.shift()
    if (oldest) scene.remove(oldest.mesh)
  }

  const geometry = new THREE.PlaneGeometry(1.5, 0.4)
  const material = new THREE.MeshStandardMaterial({
    color: 0x333333,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })
  const mark = new THREE.Mesh(geometry, material)
  mark.rotation.x = -Math.PI / 2
  mark.rotation.z = rotation
  mark.position.set(x, 0.02, z)
  scene.add(mark)
  tireMarks.push({ mesh: mark, opacity: 0.7, createdAt: now })
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
        scene.remove(mark.mesh)
        tireMarks.splice(i, 1)
      } else {
        ;(mark.mesh.material as THREE.MeshStandardMaterial).opacity = mark.opacity
      }
    }
  }
}

function updatePlayer(
  playerData: PlayerData,
  carMesh: THREE.Group,
  controls: { left: boolean; right: boolean; gas: boolean; brake: boolean },
  playerNum: number,
) {
  const handling = getCarHandling(playerNum)
  const baseMaxSpeed = getCarMaxSpeed(playerNum)
  // 如果氮气加速激活且是当前玩家，提高最大速度
  const maxSpeedValue =
    boostActive && boostPlayerData === playerData
      ? baseMaxSpeed * RACING_SCORE.NITRO_MAX_SPEED_MULTIPLIER
      : baseMaxSpeed
  const delta = 1 / 60

  // 获取或初始化漂移状态
  if (!playerDriftState.has(playerData)) {
    playerDriftState.set(playerData, { isDrifting: false, driftAngle: 0 })
  }
  const driftState = playerDriftState.get(playerData)!

  // 漂移条件：速度够快 + 转向 + 刹车
  const isDrifting =
    Math.abs(playerData.speed) > 8 && (controls.left || controls.right) && controls.brake

  // 漂移出弯时给加速
  if (driftState.isDrifting && !isDrifting) {
    playerData.speed *= RACING_DRIFT.EXIT_BOOST
  }
  driftState.isDrifting = isDrifting

  // 倒车时方向反转
  const steerDirection = playerData.speed >= 0 ? 1 : -1
  const turnMultiplier = isDrifting ? RACING_DRIFT.TURN_MULTIPLIER : 1

  if (controls.left) {
    playerData.rotation += 3 * handling * delta * steerDirection * turnMultiplier
  }
  if (controls.right) {
    playerData.rotation -= 3 * handling * delta * steerDirection * turnMultiplier
  }

  if (controls.gas) {
    playerData.speed = Math.min(playerData.speed + 80 * delta, maxSpeedValue)
  } else if (!isDrifting) {
    playerData.speed = Math.max(playerData.speed - 30 * delta, 0)
  }
  if (controls.brake) {
    if (isDrifting) {
      // 漂移时保持速度，轻微减速
      playerData.speed *= RACING_DRIFT.SPEED_RETENTION
    } else {
      playerData.speed = Math.max(playerData.speed - 100 * delta, -maxSpeedValue * 0.3)
    }
  }

  const newX = playerData.position.x + Math.sin(playerData.rotation) * playerData.speed * delta
  const newZ = playerData.position.z + Math.cos(playerData.rotation) * playerData.speed * delta

  if (!checkCollision(newX, newZ)) {
    playerData.position.x = newX
    playerData.position.z = newZ
  } else {
    if (shieldActive && shieldPlayerData === playerData) {
      playerData.position.x = newX
      playerData.position.z = newZ
      playerData.speed *= 0.9
    } else {
      playerData.speed *= RACING_SCORE.WALL_HIT_SPEED_MULTIPLIER
    }
  }

  // 漂移时生成轮胎痕迹
  if (isDrifting) {
    createTireMark(playerData.position.x, playerData.position.z, playerData.rotation)
  }

  carMesh.position.set(playerData.position.x, 0, playerData.position.z)
  carMesh.rotation.y = playerData.rotation

  if (playerNum === 1) {
    speed.value = Math.abs(playerData.speed)
    maxSpeed.value = Math.max(maxSpeed.value, speed.value)
  }

  checkpoints.forEach((checkpoint, index) => {
    if (!playerData.checkpointsPassed[index]) {
      const distance = Math.sqrt(
        Math.pow(playerData.position.x - checkpoint.x, 2) +
          Math.pow(playerData.position.z - checkpoint.z, 2),
      )
      if (distance < 15) {
        playerData.checkpointsPassed[index] = true
      }
    }
  })

  if (playerData.checkpointsPassed.every((cp) => cp)) {
    playerData.checkpointsPassed = new Array(checkpoints.length).fill(false)
    playerData.currentLap++

    if (playerData.currentLap > totalLaps.value) {
      playerData.finishTime = gameTime.value
      if (gameMode.value === 'multi') {
        winner.value = playerNum
        if (player1Data.currentLap > totalLaps.value || player2Data.currentLap > totalLaps.value) {
          gameState.value = 'result'
        }
      } else {
        currentLap.value = playerData.currentLap
        gameState.value = 'result'
      }
    } else if (playerNum === 1) {
      currentLap.value = playerData.currentLap
    }
  }

  collectibles.forEach((item) => {
    if (!item.collected) {
      const distance = Math.sqrt(
        Math.pow(playerData.position.x - item.mesh.position.x, 2) +
          Math.pow(playerData.position.z - item.mesh.position.z, 2),
      )
      if (distance < 3) {
        item.collected = true
        item.mesh.visible = false
        if (playerNum === 1) {
          combo.value++
          const comboBonus = Math.min(combo.value, RACING_SCORE.MAX_COMBO)
          score.value += RACING_SCORE.COLLECTIBLE_BASE * comboBonus
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

function startGame() {
  gameState.value = 'playing'
  gameTime.value = 0
  currentLap.value = 1
  skillsUsed.value = 0
  maxSpeed.value = 0
  score.value = 0
  combo.value = 0

  skills.forEach((skill) => {
    skill.cooldown = 0
  })

  if (scene) {
    while (scene.children.length > 0) {
      scene.remove(scene.children[0])
    }
  }
  initScene()

  const startAngle = Math.atan2(
    trackPoints[1].x - trackPoints[0].x,
    trackPoints[1].z - trackPoints[0].z,
  )

  player1Data.position = { x: trackPoints[0].x - 3, z: trackPoints[0].z }
  player1Data.rotation = startAngle
  player1Data.speed = 0
  player1Data.currentLap = 1
  player1Data.finishTime = 0
  player1Data.checkpointsPassed = new Array(RACING_TRACK.CHECKPOINTS).fill(false)

  if (gameMode.value === 'multi') {
    player2Data.position = { x: trackPoints[0].x + 3, z: trackPoints[0].z }
    player2Data.rotation = startAngle
    player2Data.speed = 0
    player2Data.currentLap = 1
    player2Data.finishTime = 0
    player2Data.checkpointsPassed = new Array(RACING_TRACK.CHECKPOINTS).fill(false)
  }

  collectibles.forEach((item) => {
    item.collected = false
    item.mesh.visible = true
  })

  lastTime = performance.now()
  gameLoop()
}

let lastTime = 0
function gameLoop() {
  if (gameState.value !== 'playing') return

  animationId = requestAnimationFrame(gameLoop)
  const now = performance.now()
  const delta = (now - lastTime) / 1000
  lastTime = now

  gameTime.value += delta

  skills.forEach((skill) => {
    if (skill.cooldown > 0) {
      skill.cooldown = Math.max(0, skill.cooldown - delta)
    }
  })

  // 更新漂移痕迹
  updateTireMarks()

  if (gameMode.value === 'single') {
    const controls = {
      left: keyboardControls.p1Left || mobileControls.left,
      right: keyboardControls.p1Right || mobileControls.right,
      gas: keyboardControls.p1Gas || mobileControls.gas,
      brake: keyboardControls.p1Brake || mobileControls.brake,
    }
    updatePlayer(player1Data, car1, controls, 1)
    renderSplitScreenView(camera, player1Data, window.innerWidth)
  } else {
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

    updatePlayer(player1Data, car1, p1Controls, 1)
    updatePlayer(player2Data, car2, p2Controls, 2)

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

  updateMinimap()

  if (gameMode.value === 'single' && renderer && scene && camera) {
    renderer.render(scene, camera)
  }
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
  // 清理所有被跟踪的定时器 / 动画帧（磁铁、护盾、氮气、连击、导弹等）
  trackedIntervals.forEach((id) => clearInterval(id))
  trackedTimeouts.forEach((id) => clearTimeout(id))
  trackedRafs.forEach((id) => cancelAnimationFrame(id))
  trackedIntervals.length = 0
  trackedTimeouts.length = 0
  trackedRafs.length = 0
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
  color: #fff;
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
  color: #fff;
  text-shadow: 0 0 20px var(--racing-accent);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #aaa;
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
  color: #fff;
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
  color: #fff;
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
  color: #fff;
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
  color: #fff;
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
  color: #fff;
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
  color: #aaa;
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
  color: #fff;
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
  color: #666;
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
  color: #fff;
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
  color: #fff;
}

.pause-buttons button:nth-child(2) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.pause-buttons button:nth-child(3) {
  background: rgba(255, 255, 255, 0.12);
  color: #ccc;
}

.pause-buttons button:last-child {
  background: rgba(255, 255, 255, 0.08);
  color: #aaa;
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
  color: #fff;
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
  color: #aaa;
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
  border: 2px solid #666;
  color: #fff;
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
  color: #fff;
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
  border: 2px solid #444;
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
  color: #fff;
  font-weight: bold;
  font-size: 0.9rem;
}

.skill-key {
  position: absolute;
  bottom: -6px;
  right: -4px;
  background: var(--racing-accent);
  color: #fff;
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
  border: 2px solid #444;
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
  color: #fff;
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
  color: #fff;
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
  color: #fff;
}

.result-buttons button:nth-child(2) {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.result-buttons button:last-child {
  background: rgba(255, 255, 255, 0.1);
  color: #aaa;
}

.result-buttons button:hover {
  transform: scale(1.05);
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
}
</style>
