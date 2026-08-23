<template>
  <div
    ref="gameContainer"
    :class="[
      'racing-game',
      {
        'large-text': racingSettings.largeText,
        'color-assist': racingSettings.colorAssist,
        jammed: player1Data.jammedUntil > gameTime,
      },
    ]"
  >
    <canvas ref="gameCanvas"></canvas>
    <div v-if="gameState === 'menu'" class="game-menu">
      <!-- 动态背景：漂移网格 + 漂浮光晕 -->
      <div class="menu-bg">
        <div class="menu-grid"></div>
        <span class="menu-orb orb-a"></span>
        <span class="menu-orb orb-b"></span>
        <span class="menu-orb orb-c"></span>
      </div>

      <!-- 全屏 3D 展厅：真实车模旋转展台 -->
      <canvas
        ref="showroomCanvas"
        class="showroom-canvas"
        @touchstart.passive="onCarTouchStart($event)"
        @touchend.passive="onCarTouchEnd($event, 1)"
      ></canvas>
      <div class="menu-vignette"></div>
      <div v-if="showroomLoading" class="showroom-loading" role="status" aria-live="polite">
        <span></span>
        <strong>赛车进场中</strong>
      </div>

      <!-- 顶部条：返回 / 标题 / 模式切换 -->
      <header class="menu-topbar">
        <button class="back-btn" @click="goBack">
          <span>←</span>
          <span>返回</span>
        </button>
        <div class="menu-title">
          <h1>🏎️ 极速狂飙</h1>
          <p class="subtitle">3D赛车竞速 · AI对手 · 漂移氮气</p>
        </div>
        <div class="mode-seg">
          <button
            :class="['seg-btn', { active: gameMode === 'single' }]"
            @click="gameMode = 'single'"
          >
            👤 单人
          </button>
          <button
            :class="['seg-btn', { active: gameMode === 'multi' }]"
            @click="gameMode = 'multi'"
          >
            👥 双人
          </button>
        </div>
      </header>

      <!-- 屏幕两侧换车箭头（单人模式；双人模式用坞站内小箭头） -->
      <template v-if="gameMode === 'single'">
        <button class="edge-btn prev" @click="prevCar(1)">‹</button>
        <button class="edge-btn next" @click="nextCar(1)">›</button>
      </template>

      <!-- 底部玻璃坞站 -->
      <div class="menu-dock">
        <div :class="['dock-grid', { multi: gameMode === 'multi' }]">
          <div class="dock-car">
            <div class="dock-car-head">
              <button v-if="gameMode === 'multi'" class="mini-btn" @click="prevCar(1)">‹</button>
              <h2 class="car-big-name" :style="{ textShadow: `0 0 26px ${currentCar.color}` }">
                {{ currentCar.name }}
              </h2>
              <span class="car-trait" :style="{ background: currentCar.color }">
                {{ carTrait(currentCar) }}
              </span>
              <button v-if="gameMode === 'multi'" class="mini-btn" @click="nextCar(1)">›</button>
            </div>
            <div class="car-stats">
              <div class="stat">
                <span>速度</span>
                <div class="stat-bar">
                  <div
                    :style="{ width: currentCar.speed / 2 + '%', background: currentCar.color }"
                  ></div>
                </div>
                <span class="stat-value">{{ currentCar.speed }}</span>
              </div>
              <div class="stat">
                <span>操控</span>
                <div class="stat-bar">
                  <div
                    :style="{ width: currentCar.handling + '%', background: currentCar.color }"
                  ></div>
                </div>
                <span class="stat-value">{{ currentCar.handling }}</span>
              </div>
            </div>
            <p class="car-perk">{{ currentCar.perk }}</p>
            <div class="car-dots">
              <span
                v-for="car in cars"
                :key="car.id"
                :class="['dot', { active: selectedCar === car.id }]"
                :style="
                  selectedCar === car.id ? { background: car.color, borderColor: car.color } : {}
                "
                @click="selectedCar = car.id"
              ></span>
            </div>
          </div>

          <div v-if="gameMode === 'multi'" class="dock-car">
            <div class="dock-car-head">
              <button class="mini-btn" @click="prevCar(2)">‹</button>
              <h2 class="car-big-name" :style="{ textShadow: `0 0 26px ${currentCar2.color}` }">
                {{ currentCar2.name }}
              </h2>
              <span class="car-trait" :style="{ background: currentCar2.color }">
                {{ carTrait(currentCar2) }}
              </span>
              <button class="mini-btn" @click="nextCar(2)">›</button>
            </div>
            <div class="car-stats">
              <div class="stat">
                <span>速度</span>
                <div class="stat-bar">
                  <div
                    :style="{ width: currentCar2.speed / 2 + '%', background: currentCar2.color }"
                  ></div>
                </div>
                <span class="stat-value">{{ currentCar2.speed }}</span>
              </div>
              <div class="stat">
                <span>操控</span>
                <div class="stat-bar">
                  <div
                    :style="{ width: currentCar2.handling + '%', background: currentCar2.color }"
                  ></div>
                </div>
                <span class="stat-value">{{ currentCar2.handling }}</span>
              </div>
            </div>
            <p class="car-perk">{{ currentCar2.perk }}</p>
            <div class="car-dots">
              <span
                v-for="car in cars"
                :key="car.id"
                :class="['dot', { active: selectedCar2 === car.id }]"
                :style="
                  selectedCar2 === car.id ? { background: car.color, borderColor: car.color } : {}
                "
                @click="selectedCar2 = car.id"
              ></span>
            </div>
          </div>
        </div>

        <div class="livery-strip" aria-label="车漆选择">
          <span>车漆</span>
          <button
            v-for="livery in liveryOptions"
            :key="livery.id"
            type="button"
            :class="[
              'livery-chip',
              { active: racingSave.selectedLivery === livery.id, locked: !livery.unlocked },
            ]"
            :disabled="!livery.unlocked"
            :aria-label="
              livery.unlocked
                ? `使用${livery.label}`
                : `${livery.label}未解锁，${livery.unlockHint}`
            "
            :title="livery.unlocked ? `使用${livery.label}` : livery.unlockHint"
            @click="selectLivery(livery.id)"
          >
            <Lock v-if="!livery.unlocked" :size="12" />
            <span :style="{ background: livery.paint }"></span>
            {{ livery.label }}
          </button>
        </div>
        <button class="start-btn" @click="openRaceSetup">配置比赛</button>
        <p class="controls-hint">
          {{
            gameMode === 'single'
              ? 'WASD 驾驶 · S+转向漂移 · Space 氮气/道具 · R 重置 · 支持手柄'
              : '玩家1: WASD · 玩家2: 方向键 · Space/右 Shift 使用技能 · 支持双手柄'
          }}
        </p>
      </div>
    </div>

    <div v-if="showRaceSetup" class="race-setup-overlay">
      <RaceSetup
        :config="raceConfig"
        @update:config="applyRaceConfig"
        @start="startConfiguredRace"
        @back="showRaceSetup = false"
        @settings="settingsOpen = true"
      />
    </div>

    <div v-if="assetLoading" class="asset-loading" role="status" aria-live="polite">
      <div class="loading-card">
        <span>TRACK LOADER</span>
        <strong>{{ assetLoadingLabel }}</strong>
        <div><i :style="{ width: `${assetLoadingProgress}%` }"></i></div>
        <b>{{ assetLoadingProgress }}%</b>
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
      <button
        class="pause-btn"
        type="button"
        title="暂停比赛"
        aria-label="暂停比赛"
        @click="pauseGame"
      >
        <Pause :size="18" />
        <span>暂停</span>
      </button>

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

        <div class="race-tech-bar">
          <div
            v-if="raceConfig.mode !== 'item-battle'"
            class="tech-meter nitro-meter"
            aria-label="氮气能量"
          >
            <span>氮气</span>
            <div><i :style="{ width: `${nitroPercent}%` }"></i></div>
            <b>{{ Math.round(player1Data.nitro) }}</b>
          </div>
          <div v-if="driftLevelName !== 'none'" :class="['drift-callout', `is-${driftLevelName}`]">
            {{ driftLevelLabel }} DRIFT
          </div>
          <button
            v-if="raceConfig.mode === 'item-battle'"
            type="button"
            class="item-slot"
            :disabled="!player1Data.heldItem"
            :aria-label="player1Data.heldItem ? `使用${heldItemLabel}` : '暂无道具'"
            @click="useHeldItem(1)"
          >
            <PackageOpen :size="22" />
            <span>{{ heldItemLabel }}</span>
            <kbd>Space</kbd>
          </button>
        </div>
        <div
          v-if="checkpointDelta !== null"
          :class="['checkpoint-delta', { faster: checkpointDelta < 0 }]"
        >
          {{ checkpointDelta < 0 ? '领先' : '落后' }} {{ formatDelta(checkpointDelta) }}
        </div>
        <div v-if="incomingWarningUntil > gameTime" class="danger-warning">导弹锁定 · 准备护盾</div>
        <div v-if="player1Data.jammedUntil > gameTime" class="jammer-warning">干扰器生效中</div>
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
            <div v-if="raceConfig.mode !== 'item-battle'" class="split-meter">
              <i :style="{ width: `${playerNitroPercent(player1Data, 1)}%` }"></i>
            </div>
            <button
              v-if="raceConfig.mode === 'item-battle'"
              class="split-item-slot"
              :disabled="!player1Data.heldItem"
              aria-label="玩家1使用道具"
              @click="useHeldItem(1)"
            >
              <PackageOpen :size="16" /> {{ itemLabel(player1Data.heldItem) }}
            </button>
          </div>
          <div class="player-hud player2-hud">
            <div class="hud-label">玩家2</div>
            <div class="speed-display small">
              <span class="speed-value">{{ Math.floor(player2Data.speed * 5) }}</span>
              <span class="speed-unit">KM/H</span>
            </div>
            <div class="lap-info small">圈数: {{ player2Data.currentLap }}/{{ totalLaps }}</div>
            <div v-if="raceConfig.mode !== 'item-battle'" class="split-meter">
              <i :style="{ width: `${playerNitroPercent(player2Data, 2)}%` }"></i>
            </div>
            <button
              v-if="raceConfig.mode === 'item-battle'"
              class="split-item-slot"
              :disabled="!player2Data.heldItem"
              aria-label="玩家2使用道具"
              @click="useHeldItem(2)"
            >
              <PackageOpen :size="16" /> {{ itemLabel(player2Data.heldItem) }}
            </button>
          </div>
        </div>
        <div v-if="multiFinishDeadline > 0" class="finish-grace">
          另一位玩家还有 {{ Math.max(0, Math.ceil(multiFinishDeadline - gameTime)) }} 秒完赛
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
          :class="[
            'cd-light',
            { on: countdownValue > 0 && countdownValue <= 4 - i, go: countdownValue === 0 },
          ]"
        ></span>
      </div>
      <div :class="['countdown-number', { go: countdownValue === 0 }]">
        {{ countdownValue > 0 ? countdownValue : 'GO!' }}
      </div>
      <div v-if="startFeedback" class="start-feedback">{{ startFeedback }}</div>
    </div>

    <div
      v-if="showTouchControls && (gameState === 'playing' || gameState === 'countdown')"
      class="mobile-controls"
    >
      <div class="control-left">
        <button
          class="control-btn left-btn"
          title="左转"
          aria-label="左转"
          @touchstart.prevent="setMobileControl('left', true)"
          @touchend.prevent="setMobileControl('left', false)"
          @touchcancel.prevent="setMobileControl('left', false)"
          @mousedown="setMobileControl('left', true)"
          @mouseup="setMobileControl('left', false)"
          @mouseleave="setMobileControl('left', false)"
        >
          <ArrowLeft :size="24" />
          <span>左转</span>
        </button>
      </div>
      <div class="control-right">
        <button
          class="control-btn right-btn"
          title="右转"
          aria-label="右转"
          @touchstart.prevent="setMobileControl('right', true)"
          @touchend.prevent="setMobileControl('right', false)"
          @touchcancel.prevent="setMobileControl('right', false)"
          @mousedown="setMobileControl('right', true)"
          @mouseup="setMobileControl('right', false)"
          @mouseleave="setMobileControl('right', false)"
        >
          <ArrowRight :size="24" />
          <span>右转</span>
        </button>
      </div>
      <div class="control-gas">
        <button
          class="control-btn gas-btn"
          title="油门"
          aria-label="油门"
          @touchstart.prevent="setMobileControl('gas', true)"
          @touchend.prevent="setMobileControl('gas', false)"
          @touchcancel.prevent="setMobileControl('gas', false)"
          @mousedown="setMobileControl('gas', true)"
          @mouseup="setMobileControl('gas', false)"
          @mouseleave="setMobileControl('gas', false)"
        >
          <Gauge :size="24" />
          <span>油门</span>
        </button>
      </div>
      <div class="control-brake">
        <button
          class="control-btn brake-btn"
          title="刹车与漂移"
          aria-label="刹车与漂移"
          @touchstart.prevent="setMobileControl('brake', true)"
          @touchend.prevent="setMobileControl('brake', false)"
          @touchcancel.prevent="setMobileControl('brake', false)"
          @mousedown="setMobileControl('brake', true)"
          @mouseup="setMobileControl('brake', false)"
          @mouseleave="setMobileControl('brake', false)"
        >
          <Octagon :size="23" />
          <span>刹车</span>
        </button>
      </div>
      <div class="control-action">
        <button
          class="control-btn action-btn"
          aria-label="使用氮气或道具"
          title="使用氮气或道具"
          @touchstart.prevent="startMobileAction"
          @touchend.prevent="stopMobileAction"
          @touchcancel.prevent="stopMobileAction"
          @mousedown="startMobileAction"
          @mouseup="stopMobileAction"
          @mouseleave="stopMobileAction"
        >
          <Zap :size="25" />
          <span>技能</span>
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
            <span>{{ formatClock(gameTime + player1Data.penaltyTime) }}</span>
          </div>
          <div class="result-item">
            <span>最佳圈速</span>
            <span>{{
              player1Data.bestLapTime > 0 ? formatLap(player1Data.bestLapTime) : '--'
            }}</span>
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
          <div v-if="player1Data.penaltyTime > 0" class="result-item">
            <span>重置罚时</span>
            <span>+{{ player1Data.penaltyTime.toFixed(1) }} 秒</span>
          </div>
          <div
            v-if="checkpointSplits.length && raceConfig.mode === 'time-trial'"
            class="result-item"
          >
            <span>最终分段差</span>
            <span>{{ formatDelta(checkpointSplits.at(-1) || 0) }}</span>
          </div>
          <div
            v-if="raceConfig.mode === 'time-trial' && raceConfig.trackId !== 'random'"
            class="result-item"
          >
            <span>奖牌</span>
            <span class="final-medal">{{ medalLabel }}</span>
          </div>
          <div v-if="recordImproved" class="record-banner">刷新个人最佳</div>
          <div v-if="newUnlocks.length" class="unlock-banner">
            新外观：{{ newUnlocks.join('、') }}
          </div>
          <div v-if="raceConfig.mode === 'championship'" class="championship-board">
            <div v-for="(standing, index) in championshipStandings" :key="standing.racerId">
              <b>{{ index + 1 }}</b>
              <span>{{
                standing.racerId === 'player' ? currentCar.name : `AI ${standing.racerId.slice(-1)}`
              }}</span>
              <strong>{{ standing.points }} 分</strong>
            </div>
          </div>
        </div>
        <div v-else>
          <div class="result-item">
            <span>玩家1用时</span>
            <span>{{ player1Data.finished ? formatClock(player1Data.finishTime) : '未完赛' }}</span>
          </div>
          <div class="result-item">
            <span>玩家2用时</span>
            <span>{{ player2Data.finished ? formatClock(player2Data.finishTime) : '未完赛' }}</span>
          </div>
        </div>
      </div>
      <div class="result-buttons">
        <button
          v-if="raceConfig.mode === 'championship' && championshipRound < 2"
          @click="advanceChampionship"
        >
          下一站
        </button>
        <button v-else-if="raceConfig.mode === 'championship'" @click="restartChampionship">
          重跑锦标赛
        </button>
        <button v-else @click="startGame">同赛道重试</button>
        <button
          v-if="raceConfig.trackId !== 'random' && gameMode === 'single'"
          @click="challengeGhost"
        >
          挑战幽灵
        </button>
        <button @click="quitGame">返回菜单</button>
        <button @click="goBack">返回主页</button>
      </div>
    </div>

    <RacingSettingsPanel
      v-model:open="settingsOpen"
      :settings="racingSettings"
      @save="applySettings"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { ArrowLeft, ArrowRight, Gauge, Lock, Octagon, PackageOpen, Pause, Zap } from '@lucide/vue'
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
  isOutsideTrack,
  queryTrack,
  trackFrameAt,
  type Collectible,
  type CheckpointGate,
} from './track'
import {
  buildCarMesh,
  buildLoadedCarMesh,
  hasCarModelFailed,
  preloadCarModels,
  type CarMeshes,
} from './car'
import { CarShowroom } from './showroom'
import { ParticleSystem } from './particles'
import { racingAudio } from './audio'
import { updateAI, raceProgress, type AICarState } from './ai'
import { createPlayerData, isRacerActive, resetPlayerData, type PlayerData } from './types'
import RaceSetup from './components/RaceSetup.vue'
import RacingSettingsPanel from './components/RacingSettingsPanel.vue'
import {
  MODE_LABELS,
  TRACKS,
  getMedal,
  normalizeRaceConfig,
  type FixedTrackId,
  type LiveryId,
  type Medal,
  type RaceConfig,
  type RacingSettings,
} from './game'
import {
  addCombo,
  championshipPoints,
  driftBoostMultiplier,
  driftLevel,
  driftScore,
  pickItem,
  perfectStart,
  resolveHit,
  sortChampionship,
  tickCombo,
  type ChampionshipEntry,
  type DriftLevel,
  type ItemId,
} from './rules'
import {
  loadRacingSave,
  loadRacingSettings,
  loadRaceConfig,
  applyUnlocks,
  saveRacingSave,
  saveRacingSettings,
  saveRaceConfig,
  updateRecord,
} from './storage'
import { GhostRecorder, interpolateGhost, loadGhost, saveGhost, type GhostLap } from './ghost'
import { loadTrackEnvironment, loadTrackProps, preloadRaceAssets } from './assets'

const router = useRouter()
const gameContainer = ref<HTMLDivElement>()
const gameCanvas = ref<HTMLCanvasElement>()
const minimapCanvas = ref<HTMLCanvasElement>()

const showRaceSetup = ref(false)
const settingsOpen = ref(false)
const assetLoading = ref(false)
const assetLoadingProgress = ref(0)
const assetLoadingLabel = ref('准备赛车资源')
const showroomLoading = ref(true)
const raceConfig = reactive<RaceConfig>(loadRaceConfig())
const racingSettings = reactive<RacingSettings>(loadRacingSettings())
const racingSave = ref(loadRacingSave())
const championshipRound = ref(0)
const championshipStandings = ref<ChampionshipEntry[]>([])
const recordImproved = ref(false)
const earnedMedal = ref<Medal>('none')
const checkpointDelta = ref<number | null>(null)
const incomingWarningUntil = ref(0)
const startFeedback = ref('')
const newUnlocks = ref<string[]>([])
const activeTrackId = computed<FixedTrackId | 'random'>(() => {
  if (raceConfig.mode === 'championship')
    return (['forest', 'desert', 'snow'] as const)[championshipRound.value]
  return raceConfig.trackId
})
const activeTrack = computed(() =>
  activeTrackId.value === 'random' ? undefined : TRACKS[activeTrackId.value],
)
const activeTrackWidth = computed(() => activeTrack.value?.width ?? RACING_TRACK.WIDTH)
const activeCheckpointCount = computed(
  () => activeTrack.value?.checkpoints ?? RACING_TRACK.CHECKPOINTS,
)

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
const multiFinishDeadline = ref(0)
const score = ref(0)
const combo = ref(0)
const comboIdle = ref(0)
// 竞速新增：倒计时 / 名次 / 圈速 / 氮气状态
const countdownValue = ref(-1) // 3/2/1 → 0=GO → -1 隐藏
const rank = ref(1)
const previousRank = ref(1)
const totalRacers = ref(1)
const lapTime = ref(0)
const boosting = ref(false)
const nitroPercent = computed(() => {
  const capacity = currentCar.value?.nitroCapacity || 100
  return Math.min(100, (player1Data.nitro / capacity) * 100)
})
const driftLevelName = computed<DriftLevel>(() => driftLevel(player1Data.driftCharge))
const driftLevelLabel = computed(
  () => ({ none: '', good: 'GOOD', great: 'GREAT', perfect: 'PERFECT' })[driftLevelName.value],
)
const medalLabel = computed(
  () => ({ none: '未获奖牌', bronze: '铜牌', silver: '银牌', gold: '金牌' })[earnedMedal.value],
)
const ITEM_LABELS: Record<ItemId, string> = {
  nitro: '涡轮冲刺',
  shield: '护盾',
  missile: '追踪导弹',
  magnet: '磁铁',
  oil: '油渍',
  roadblock: '路障',
  jammer: '干扰器',
}
const LIVERY_LABELS: Record<string, string> = {
  duotone: '基础双色',
  sandstorm: '沙暴车漆',
  glacier: '冰川车漆',
  'champion-metal': '冠军金属',
  'champion-stripe': '冠军条纹与称号',
}
const LIVERY_UNLOCK_HINTS: Record<LiveryId, string> = {
  classic: '默认可用',
  duotone: '获得任意一枚奖牌后解锁',
  sandstorm: '任意三条固定赛道获得铜牌后解锁',
  glacier: '任意三条固定赛道获得银牌后解锁',
  'champion-metal': '任意三条固定赛道获得金牌后解锁',
  'champion-stripe': '赢得一次三站锦标赛后解锁',
}
const liveryOptions = computed(() =>
  [
    {
      id: 'classic' as LiveryId,
      label: '经典',
      paint: `linear-gradient(135deg, ${currentCar.value.color}, #23293a)`,
    },
    {
      id: 'duotone' as LiveryId,
      label: '双色',
      paint: 'linear-gradient(135deg, #fff2cf 50%, #273c75 50%)',
    },
    {
      id: 'sandstorm' as LiveryId,
      label: '沙暴',
      paint: 'linear-gradient(135deg, #f2a65a 50%, #693f2f 50%)',
    },
    {
      id: 'glacier' as LiveryId,
      label: '冰川',
      paint: 'linear-gradient(135deg, #c9f7ff 50%, #5577ff 50%)',
    },
    {
      id: 'champion-metal' as LiveryId,
      label: '冠军',
      paint: 'linear-gradient(135deg, #ffe27a 50%, #8f6b18 50%)',
    },
    {
      id: 'champion-stripe' as LiveryId,
      label: '条纹',
      paint: 'linear-gradient(135deg, #fff4d6 38%, #e43f5a 38% 58%, #273c75 58%)',
    },
  ].map((item) => ({
    ...item,
    unlocked: racingSave.value.unlockedLiveries.includes(item.id),
    unlockHint: LIVERY_UNLOCK_HINTS[item.id],
  })),
)
const heldItemLabel = computed(() =>
  player1Data.heldItem ? ITEM_LABELS[player1Data.heldItem] : '等待拾取',
)
const coarsePointer =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const showTouchControls = computed(
  () =>
    racingSettings.touchControls === true ||
    (racingSettings.touchControls === 'auto' && coarsePointer),
)

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

/** 车辆定位标签：极速 / 操控 / 均衡 */
function carTrait(car: RacingCar): string {
  if (car.speed >= 190) return '极速型'
  if (car.handling >= 85) return '操控型'
  return '均衡型'
}

function openRaceSetup() {
  raceConfig.localPlayers = gameMode.value === 'multi' ? 2 : 1
  if (raceConfig.localPlayers === 2 && !['quick', 'item-battle'].includes(raceConfig.mode)) {
    raceConfig.mode = 'quick'
  }
  showRaceSetup.value = true
}

function applyRaceConfig(value: RaceConfig) {
  Object.assign(raceConfig, normalizeRaceConfig(value))
}

async function startConfiguredRace() {
  Object.assign(raceConfig, normalizeRaceConfig(raceConfig))
  saveRaceConfig(raceConfig)
  gameMode.value = raceConfig.localPlayers === 2 ? 'multi' : 'single'
  totalLaps.value = raceConfig.laps
  if (raceConfig.mode === 'championship') {
    championshipRound.value = 0
    championshipStandings.value = [
      { racerId: 'player', points: 0, wins: 0, totalTime: 0 },
      { racerId: 'ai-1', points: 0, wins: 0, totalTime: 0 },
      { racerId: 'ai-2', points: 0, wins: 0, totalTime: 0 },
      { racerId: 'ai-3', points: 0, wins: 0, totalTime: 0 },
    ]
  } else {
    championshipStandings.value = []
  }
  showRaceSetup.value = false
  assetLoading.value = true
  assetLoadingProgress.value = 0
  try {
    await preloadRaceAssets(activeTrackId.value, (progress, label) => {
      assetLoadingProgress.value = Math.round(progress * 0.72)
      assetLoadingLabel.value = label
    })
    assetLoadingLabel.value = '装配真实赛车'
    await preloadCarModels(
      RACING_CARS.map((car) => car.id),
      (completed, total) => {
        assetLoadingProgress.value = 72 + Math.round((completed / Math.max(total, 1)) * 28)
      },
    )
    assetLoadingLabel.value = '资源就绪'
    assetLoadingProgress.value = 100
  } finally {
    assetLoading.value = false
  }
  startGame()
}

function applySettings(value: RacingSettings) {
  Object.assign(racingSettings, value)
  saveRacingSettings(racingSettings)
  applyRendererQuality()
  racingAudio.setVolumes(
    racingSettings.masterVolume,
    racingSettings.engineVolume,
    racingSettings.effectsVolume,
  )
}

function formatDelta(value: number): string {
  return `${Math.abs(value).toFixed(2)}s`
}

function itemLabel(item: ItemId | null): string {
  return item ? ITEM_LABELS[item] : '等待拾取'
}

function racerRankFor(data: PlayerData): number {
  if (gameMode.value === 'single') return data === player1Data ? rank.value : 2
  const ownProgress = raceProgress(trackPoints, data)
  const other = data === player1Data ? player2Data : player1Data
  return raceProgress(trackPoints, other) > ownProgress ? 2 : 1
}

function selectLivery(livery: LiveryId) {
  if (!racingSave.value.unlockedLiveries.includes(livery)) return
  racingSave.value.selectedLivery = livery
  saveRacingSave(racingSave.value)
  showroom?.setLivery(livery)
}

function playerNitroPercent(data: PlayerData, player: number): number {
  const capacity = getSelectedCarData(player)?.nitroCapacity || 100
  return Math.min(100, (data.nitro / capacity) * 100)
}

function applyRendererQuality() {
  if (!renderer) return
  const ratio =
    racingSettings.quality === 'high' ? 1.5 : racingSettings.quality === 'medium' ? 1.15 : 1
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, ratio))
  renderer.shadowMap.enabled = racingSettings.quality !== 'low'
}

function particleCount(base: number): number {
  return Math.round(base * (racingSettings.particles / 100))
}

function createRaceCar(config: RacingCar, livery: LiveryId): CarMeshes {
  const loaded = buildLoadedCarMesh(config, livery)
  if (loaded) return loaded
  if (hasCarModelFailed(config.id)) return buildCarMesh(config)
  throw new Error(`赛车 ${config.name} 的真实模型尚未完成装载`)
}

// 选车 3D 展厅（仅菜单界面渲染，独立 renderer/场景，详见 ./showroom）
// 注意：.game-menu 是 v-if，离开菜单时 showroomCanvas DOM 元素会被销毁，旧的
// renderer 还绑在那个已被卸载的 canvas 上，导致返回菜单后新 canvas 空白。
// 所以 showroom 的生命周期跟 gameState==='menu' 绑定：进 menu 用当前 canvas 新建，
// 离开 menu 立即 dispose 释放 WebGL 上下文（顺带也避免比赛期间双上下文共存）。
const showroomCanvas = ref<HTMLCanvasElement>()
let showroom: CarShowroom | null = null

function ensureShowroom(): void {
  if (showroom || !showroomCanvas.value) return
  showroomLoading.value = true
  showroom = new CarShowroom(showroomCanvas.value)
  showroom.setLivery(racingSave.value.selectedLivery)
  showroom.setSlots(gameMode.value === 'multi' ? 2 : 1)
  showroom.setCar(0, currentCar.value)
  showroom.setCar(1, currentCar2.value)
  showroom.start()
  void preloadCarModels(RACING_CARS.map((car) => car.id)).finally(() => {
    if (!racingDisposed && gameState.value === 'menu') showroomLoading.value = false
  })
}

function disposeShowroom(): void {
  showroom?.dispose()
  showroom = null
}

// 选中变化 → 展厅换车 + 切换音效。flush: 'sync' 让 AudioContext 的创建/恢复
// 保持在点击/按键手势的同步调用栈内，避免被浏览器挂起导致首次无声
watch(
  currentCar,
  (car) => {
    showroom?.setCar(0, car)
    racingAudio.init()
    racingAudio.uiSwitch()
  },
  { flush: 'sync' },
)
watch(
  currentCar2,
  (car) => {
    showroom?.setCar(1, car)
    racingAudio.init()
    racingAudio.uiSwitch()
  },
  { flush: 'sync' },
)
watch(gameMode, (mode) => {
  showroom?.setSlots(mode === 'multi' ? 2 : 1)
  raceConfig.localPlayers = mode === 'multi' ? 2 : 1
  if (mode === 'multi' && !['quick', 'item-battle'].includes(raceConfig.mode))
    raceConfig.mode = 'quick'
})
// 展厅只在菜单渲染：进 menu 用新 canvas 重建，离开 menu 释放。
// flush: 'post' 让 watcher 在 Vue DOM 更新（v-if 挂载新 showroomCanvas）之后跑，
// 否则 ensureShowroom 时 showroomCanvas.value 还是 null，绑不到新 canvas。
watch(
  gameState,
  (state) => {
    if (state === 'menu') {
      ensureShowroom()
    } else {
      disposeShowroom()
    }
  },
  { flush: 'post' },
)

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
  action: false,
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
  p1Action: false,
  p2Action: false,
})

type MobileControl = keyof typeof mobileControls

function setMobileControl(control: MobileControl, value: boolean) {
  mobileControls[control] = value
  if (control === 'gas' && value && canCaptureStartThrottle() && firstThrottleAt === null) {
    firstThrottleAt = performance.now()
  }
}

function startMobileAction() {
  mobileControls.action = true
  onActionPress(1)
}

function stopMobileAction() {
  mobileControls.action = false
}

function canCaptureStartThrottle(): boolean {
  if (gameState.value !== 'countdown' && gameState.value !== 'playing') return false
  return raceGoAt > 0 && performance.now() <= raceGoAt + currentCar.value.perfectStartWindow * 1000
}

interface GamepadControlState {
  left: boolean
  right: boolean
  gas: boolean
  brake: boolean
  action: boolean
}

const gamepadControls = reactive<[GamepadControlState, GamepadControlState]>([
  { left: false, right: false, gas: false, brake: false, action: false },
  { left: false, right: false, gas: false, brake: false, action: false },
])
const previousGamepadButtons = new Map<
  number,
  { action: boolean; reset: boolean; pause: boolean }
>()

function clearGamepadControl(index: number) {
  Object.assign(gamepadControls[index], {
    left: false,
    right: false,
    gas: false,
    brake: false,
    action: false,
  })
}

function pollGamepads() {
  if (!navigator.getGamepads) return
  const connected = Array.from(navigator.getGamepads())
    .filter((pad): pad is Gamepad => Boolean(pad))
    .slice(0, 2)
  for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
    const pad = connected[playerIndex]
    if (!pad) {
      clearGamepadControl(playerIndex)
      continue
    }
    const axisX = Math.abs(pad.axes[0] ?? 0) > 0.18 ? (pad.axes[0] ?? 0) : 0
    const state = gamepadControls[playerIndex]
    state.left = axisX < -0.12 || Boolean(pad.buttons[14]?.pressed)
    state.right = axisX > 0.12 || Boolean(pad.buttons[15]?.pressed)
    state.gas = (pad.buttons[7]?.value ?? 0) > 0.12
    state.brake = (pad.buttons[6]?.value ?? 0) > 0.12
    state.action = Boolean(pad.buttons[0]?.pressed)

    const previous = previousGamepadButtons.get(pad.index) ?? {
      action: false,
      reset: false,
      pause: false,
    }
    const reset = Boolean(pad.buttons[1]?.pressed)
    const pause = Boolean(pad.buttons[9]?.pressed)
    const player = playerIndex + 1
    if (state.action && !previous.action) onActionPress(player)
    if (reset && !previous.reset && gameState.value === 'playing') {
      resetRacer(player === 1 ? player1Data : player2Data, player === 1 ? car1 : car2)
    }
    if (pause && !previous.pause) {
      if (gameState.value === 'playing') pauseGame()
      else if (gameState.value === 'paused') resumeGame()
    }
    if (state.gas && canCaptureStartThrottle() && firstThrottleAt === null && playerIndex === 0) {
      firstThrottleAt = performance.now()
    }
    previousGamepadButtons.set(pad.index, { action: state.action, reset, pause })
  }
}

// Three.js 变量
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let camera2: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let environmentTexture: THREE.DataTexture | null = null
let racingDisposed = false
let car1: THREE.Group
let car2: THREE.Group
let nitroFlame1: THREE.Mesh | null = null
let wheels1: THREE.Mesh[] = []
let animationId: number
let ghostMesh: THREE.Group | null = null
let activeGhost: GhostLap | null = null
const ghostRecorder = new GhostRecorder()
let raceGoAt = 0
let firstThrottleAt: number | null = null
let burnoutUntil = 0
let lastRecordedLapStart = 0
const checkpointSplits: number[] = []
const deployedObstacles: {
  mesh: THREE.Mesh
  type: 'oil' | 'roadblock'
  owner: PlayerData
  expiresAt: number
}[] = []

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
let cleanSegment = true
const nearMissCooldown = new WeakMap<PlayerData, number>()

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
    environmentTexture?.dispose()
    environmentTexture = null
    disposeObject(scene)
    while (scene.children.length > 0) {
      scene.remove(scene.children[0])
    }
  }

  scene = new THREE.Scene()
  const initializedScene = scene
  const trackTheme = activeTrack.value
  scene.background = new THREE.Color(trackTheme?.sky ?? 0x7fc8f8)
  scene.fog = new THREE.Fog(trackTheme?.fog ?? 0x7fc8f8, 120, 420)

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
  applyRendererQuality()

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
  const trackBuild = buildTrack(scene, trackTheme, { itemMode: raceConfig.mode === 'item-battle' })
  trackPoints = trackBuild.trackPoints
  checkpoints = trackBuild.checkpoints
  gates = trackBuild.gates
  collectibles = trackBuild.collectibles
  buildEnvironment(scene, trackTheme, racingSettings.quality)
  void loadTrackProps(
    initializedScene,
    activeTrackId.value,
    trackPoints,
    activeTrackWidth.value,
    racingSettings.quality,
    () => racingDisposed || scene !== initializedScene,
  )
  void loadTrackEnvironment(activeTrackId.value).then((texture) => {
    if (!texture) return
    if (racingDisposed || scene !== initializedScene) {
      texture.dispose()
      return
    }
    environmentTexture = texture
    initializedScene.environment = texture
    initializedScene.environmentIntensity =
      activeTrackId.value === 'ridge' ? 0.4 : racingSettings.quality === 'low' ? 0.55 : 0.85
  })
  particles?.dispose() // 上一局的粒子系统共享几何体
  particles = new ParticleSystem(scene)

  // 玩家赛车（造型见 ./car）
  const c1 = createRaceCar(currentCar.value, racingSave.value.selectedLivery)
  car1 = c1.group
  nitroFlame1 = c1.nitroFlame
  wheels1 = c1.wheels
  scene.add(car1)

  if (gameMode.value === 'multi') {
    const c2 = createRaceCar(currentCar2.value, racingSave.value.selectedLivery)
    car2 = c2.group
    scene.add(car2)
    aiCars = []
  } else {
    // AI 对手：用玩家未选的赛车，性格各异（走线偏移 + 配速差异），见 ./ai
    aiCars = []
    const aiConfigs = RACING_CARS.filter((c) => c.id !== selectedCar.value).slice(
      0,
      raceConfig.aiCount,
    )
    const personalities = ['aggressive', 'steady', 'drifter', 'sprinter'] as const
    aiConfigs.forEach((config, i) => {
      const meshes = createRaceCar(config, 'classic')
      scene.add(meshes.group)
      aiCars.push({
        data: createPlayerData(),
        mesh: meshes.group,
        nitroFlame: meshes.nitroFlame,
        car: config,
        laneOffset: (i - (aiConfigs.length - 1) / 2) * 2.5,
        paceFactor: 0.96 + i * 0.025,
        personality: personalities[i % personalities.length],
        isDrifting: false,
        mistakeTimer: 0,
        itemCooldown: 4 + i * 1.5,
        stuckTimer: 0,
        lastProgress: -Infinity,
        resetCooldown: 0,
      })
    })
  }

  void prepareGhost()
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
    activeCheckpointCount.value,
  )
  car1.position.set(player1Data.position.x, 0, player1Data.position.z)
  car1.rotation.y = startAngle

  if (gameMode.value === 'multi') {
    resetPlayerData(
      player2Data,
      p0.x + perp.x * 3,
      p0.z + perp.z * 3,
      startAngle,
      activeCheckpointCount.value,
    )
    car2.position.set(player2Data.position.x, 0, player2Data.position.z)
    car2.rotation.y = startAngle
  } else {
    aiCars.forEach((ai, i) => {
      const back = 6 + Math.floor(i / 2) * 6
      const side = i % 2 === 0 ? 3.2 : -3.2
      const x = p0.x - dir.x * back + perp.x * side
      const z = p0.z - dir.z * back + perp.z * side
      resetPlayerData(ai.data, x, z, startAngle, activeCheckpointCount.value)
      ai.mesh.position.set(x, 0, z)
      ai.mesh.rotation.y = startAngle
    })
  }
}

/** 将赛车放回当前中心线附近；用于玩家主动脱困，统一附加时间惩罚并清空连击。 */
function resetRacer(data: PlayerData, mesh?: THREE.Group) {
  if (!mesh || trackPoints.length === 0 || data.finished || data.eliminated) return
  const nearest = queryTrack(trackPoints, data.position.x, data.position.z)
  const safeIndex = Math.max(0, nearest.segIndex - 2)
  const frame = trackFrameAt(trackPoints, safeIndex)
  const point = trackPoints[safeIndex]
  data.position = { x: point.x, z: point.z }
  data.rotation = Math.atan2(frame.dir.x, frame.dir.z)
  data.speed = 0
  data.driftCharge = 0
  data.penaltyTime += 2.5
  mesh.position.set(point.x, 0, point.z)
  mesh.rotation.y = data.rotation
  combo.value = 0
  comboIdle.value = 0
  if (data === player1Data) startFeedback.value = '已重置 · +2.5 秒'
  trackTimeout(() => {
    if (startFeedback.value.startsWith('已重置')) startFeedback.value = ''
  }, 1800)
}

function buildGoldGhost(trackId: FixedTrackId, carId: number): GhostLap {
  const lapTimeValue = TRACKS[trackId].medalLapTimes.gold
  const frames = []
  const sampleCount = Math.max(2, Math.ceil(lapTimeValue * 20))
  for (let i = 0; i <= sampleCount; i++) {
    const progress = i / sampleCount
    const exact = progress * trackPoints.length
    const index = Math.floor(exact) % trackPoints.length
    const nextIndex = (index + 1) % trackPoints.length
    const fraction = exact - Math.floor(exact)
    const a = trackPoints[index]
    const b = trackPoints[nextIndex]
    frames.push({
      time: progress * lapTimeValue,
      x: THREE.MathUtils.lerp(a.x, b.x, fraction),
      z: THREE.MathUtils.lerp(a.z, b.z, fraction),
      rotation: Math.atan2(b.x - a.x, b.z - a.z),
      speed: (a.distanceTo(b) * trackPoints.length) / lapTimeValue,
    })
  }
  return { version: 2, trackId, carId, lapTime: lapTimeValue, frames }
}

async function prepareGhost() {
  ghostMesh = null
  activeGhost = null
  if (
    raceConfig.mode !== 'time-trial' ||
    activeTrackId.value === 'random' ||
    racingSettings.ghostMode === 'off'
  )
    return
  const trackId = activeTrackId.value
  activeGhost =
    racingSettings.ghostMode === 'gold'
      ? buildGoldGhost(trackId, selectedCar.value)
      : await loadGhost(trackId, selectedCar.value)
  if (!activeGhost || !scene) return
  const ghostCar = createRaceCar(currentCar.value, racingSave.value.selectedLivery)
  ghostMesh = ghostCar.group
  ghostMesh.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.material) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const transparentMaterials = materials.map((material) => {
      const clone = material.clone()
      clone.transparent = true
      clone.opacity = racingSettings.ghostOpacity
      clone.depthWrite = false
      return clone
    })
    mesh.material = Array.isArray(mesh.material) ? transparentMaterials : transparentMaterials[0]
    mesh.castShadow = false
  })
  scene.add(ghostMesh)
}

function updateGhostPlayback() {
  if (!ghostMesh || !activeGhost) return
  const frame = interpolateGhost(activeGhost.frames, lapTime.value)
  if (!frame) return
  ghostMesh.visible = lapTime.value <= activeGhost.lapTime + 0.2
  ghostMesh.position.set(frame.x, 0.03, frame.z)
  ghostMesh.rotation.y = frame.rotation
}

// 位置是否越出赛道边界（留出车身半宽余量；几何查询见 ./track 的 queryTrack）
function isOffTrack(x: number, z: number): boolean {
  return isOutsideTrack(trackPoints, x, z, activeTrackWidth.value)
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

function collectReward(playerData: PlayerData, playerNum: number) {
  const carData = getSelectedCarData(playerNum) || RACING_CARS[0]
  const nextCombo = addCombo({ value: combo.value, idle: comboIdle.value })
  if (playerNum === 1) {
    combo.value = nextCombo.value
    comboIdle.value = nextCombo.idle
    score.value += RACING_SCORE.COLLECTIBLE_BASE * Math.max(1, nextCombo.value)
    racingAudio.collect(nextCombo.value)
  }
  playerData.nitro = Math.min(carData.nitroCapacity, playerData.nitro + 7)
  playerData.speed = Math.min(
    playerData.speed + RACING_SCORE.DRIFT_BOOST_SPEED,
    getCarMaxSpeed(playerNum),
  )
}

function collectTrackItem(
  item: Collectible,
  data: PlayerData,
  playerNum: number,
  racerRank: number,
): boolean {
  if (item.collected || (item.kind === 'item' && data.heldItem)) return false
  item.collected = true
  item.mesh.visible = false
  item.respawnAt = item.kind === 'item' ? gameTime.value + 8 : Infinity
  if (item.kind === 'item') {
    data.heldItem = pickItem(racerRank, totalRacers.value)
    if (playerNum === 1) racingAudio.collect(3)
  } else {
    collectReward(data, playerNum)
  }
  return true
}

function awardTechnique(points: number, nitro = 6) {
  const nextCombo = addCombo({ value: combo.value, idle: comboIdle.value })
  combo.value = nextCombo.value
  comboIdle.value = nextCombo.idle
  score.value += points * Math.max(1, nextCombo.value)
  player1Data.nitro = Math.min(currentCar.value.nitroCapacity, player1Data.nitro + nitro)
}

function applyHit(target: PlayerData, multiplier: number): boolean {
  const result = resolveHit(target.speed, target.shieldHits, multiplier)
  target.speed = result.speed
  target.shieldHits = result.shieldHits
  if (result.blocked) {
    if (shieldPlayerData === target) deactivateShield()
    racingAudio.collect(4)
    return false
  }
  target.driftCharge = 0
  if (target === player1Data) cleanSegment = false
  return true
}

function onActionPress(player: number) {
  if (raceConfig.mode === 'item-battle' && gameState.value === 'playing') useHeldItem(player)
}

function useHeldItem(player: number) {
  const data = player === 1 ? player1Data : player2Data
  const item = data.heldItem
  if (!item) return
  data.heldItem = null
  if (item === 'nitro') {
    data.boostUntil = Math.max(data.boostUntil, gameTime.value) + RACING_DRIFT.ITEM_BOOST_DURATION
    data.speed = Math.min(
      data.speed + 12,
      getCarMaxSpeed(player) * RACING_DRIFT.BOOST_MAX_SPEED_MULTIPLIER,
    )
    racingAudio.nitro()
  } else if (item === 'shield') {
    activateShield(data, 8)
  } else if (item === 'missile') {
    launchMissile(player)
  } else if (item === 'magnet') {
    activateMagnet(data, 6)
  } else if (item === 'oil' || item === 'roadblock') {
    deployObstacle(data, item)
  } else if (item === 'jammer') {
    const target =
      player === 1 && gameMode.value === 'single'
        ? aiCars.find((ai) => !ai.data.finished && !ai.data.eliminated)?.data
        : player === 1
          ? player2Data
          : player1Data
    if (target) {
      target.jammedUntil = gameTime.value + 4
      target.speed *= 0.86
    }
  }
  skillsUsed.value++
}

function deployObstacle(owner: PlayerData, type: 'oil' | 'roadblock') {
  const size = type === 'oil' ? [3.6, 0.08, 2.8] : [5, 1.2, 1.2]
  const material = new THREE.MeshStandardMaterial({
    color: type === 'oil' ? 0x171522 : 0xff6b45,
    roughness: type === 'oil' ? 0.18 : 0.8,
    metalness: type === 'oil' ? 0.35 : 0.05,
  })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material)
  mesh.position.set(
    owner.position.x - Math.sin(owner.rotation) * 5,
    size[1] / 2,
    owner.position.z - Math.cos(owner.rotation) * 5,
  )
  mesh.rotation.y = owner.rotation
  scene.add(mesh)
  deployedObstacles.push({ mesh, type, owner, expiresAt: gameTime.value + 16 })
}

function updateObstacles() {
  const racers: PlayerData[] = [player1Data]
  if (gameMode.value === 'multi') racers.push(player2Data)
  else racers.push(...aiCars.map((ai) => ai.data))
  for (let i = deployedObstacles.length - 1; i >= 0; i--) {
    const obstacle = deployedObstacles[i]
    if (gameTime.value >= obstacle.expiresAt) {
      scene.remove(obstacle.mesh)
      obstacle.mesh.geometry.dispose()
      ;(obstacle.mesh.material as THREE.Material).dispose()
      deployedObstacles.splice(i, 1)
      continue
    }
    for (const racer of racers) {
      if (racer === obstacle.owner || racer.eliminated) continue
      const distance = Math.hypot(
        racer.position.x - obstacle.mesh.position.x,
        racer.position.z - obstacle.mesh.position.z,
      )
      if (distance < (obstacle.type === 'oil' ? 2.6 : 3.3)) {
        if (applyHit(racer, obstacle.type === 'oil' ? 0.58 : 0.35)) {
          if (obstacle.type === 'oil') racer.rotation += 0.65
          particles?.spawnSparks(racer.position.x, 0.5, racer.position.z, particleCount(7))
        }
        if (obstacle.owner === player1Data && racer !== player1Data) awardTechnique(180, 8)
        obstacle.expiresAt = 0
        break
      }
    }
  }
}

function updateAIItems(delta: number) {
  aiCars.forEach((ai) => {
    ai.itemCooldown -= delta
    if (ai.data.eliminated || ai.data.finished) return
    const aiProgress = raceProgress(trackPoints, ai.data)
    const aiRank =
      1 +
      [player1Data, ...aiCars.map((entry) => entry.data)].filter(
        (data) => data !== ai.data && raceProgress(trackPoints, data) > aiProgress,
      ).length
    if (!ai.data.heldItem) {
      const box = collectibles.find(
        (item) =>
          !item.collected &&
          item.kind === 'item' &&
          Math.hypot(
            ai.data.position.x - item.mesh.position.x,
            ai.data.position.z - item.mesh.position.z,
          ) < 5.5,
      )
      if (box) collectTrackItem(box, ai.data, 0, aiRank)
    }
    if (ai.itemCooldown > 0 || !ai.data.heldItem) return
    ai.itemCooldown = 5 + Math.random() * 4
    if (ai.data.heldItem === 'missile') {
      incomingWarningUntil.value = Math.max(incomingWarningUntil.value, gameTime.value + 1.35)
      trackTimeout(() => {
        if (gameState.value !== 'playing' || !isRacerActive(ai.data)) return
        launchMissileFrom(ai.mesh, player1Data)
      }, 1200)
    } else if (ai.data.heldItem === 'jammer') {
      player1Data.jammedUntil = gameTime.value + 4
      player1Data.speed *= 0.86
    } else if (ai.data.heldItem === 'nitro') {
      ai.data.boostUntil = gameTime.value + RACING_DRIFT.ITEM_BOOST_DURATION
      ai.data.speed = Math.min(
        ai.data.speed + 12,
        (ai.car.speed / 5) * RACING_DRIFT.BOOST_MAX_SPEED_MULTIPLIER,
      )
    } else if (ai.data.heldItem === 'oil' || ai.data.heldItem === 'roadblock') {
      deployObstacle(ai.data, ai.data.heldItem)
    } else if (ai.data.heldItem === 'shield') {
      ai.data.shieldHits = 1
      ai.data.shieldUntil = gameTime.value + 8
    } else if (ai.data.heldItem === 'magnet') {
      const box = collectibles.find((item) => !item.collected && item.kind === 'item')
      if (box) {
        box.mesh.position.x += (ai.data.position.x - box.mesh.position.x) * 0.8
        box.mesh.position.z += (ai.data.position.z - box.mesh.position.z) * 0.8
      }
    }
    ai.data.heldItem = null
  })
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
      if (!isRacerActive(ai.data)) continue
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

  launchMissileFrom(playerCar, targetData, (hit) => {
    if (player === 1 && hit) {
      score.value += RACING_SCORE.MISSILE_HIT_SCORE
      awardTechnique(180, 8)
    }
  })
}

/** 玩家和 AI 共用同一个可见、可躲避、可被护盾抵挡的追踪导弹。 */
function launchMissileFrom(
  sourceCar: THREE.Object3D,
  targetData: PlayerData | null,
  onResolved?: (hit: boolean) => void,
) {
  const missileGeometry = new THREE.ConeGeometry(0.3, 1.5)
  const missileMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff4400,
    emissiveIntensity: 0.8,
  })
  const missile = new THREE.Mesh(missileGeometry, missileMaterial)
  missile.position.copy(sourceCar.position)
  missile.position.y += 1
  missile.rotation.x = Math.PI / 2
  scene.add(missile)
  racingAudio.missile()

  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(sourceCar.quaternion)
  const missileSpeed = 96 // 赛道单位/秒，比赛车快
  let traveled = 0
  let lastMissileFrame = performance.now()

  const animateMissile = (now: number) => {
    const missileDelta = Math.min((now - lastMissileFrame) / 1000, 0.05)
    lastMissileFrame = now
    if (targetData && !isRacerActive(targetData)) targetData = null
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
    const step = missileSpeed * missileDelta
    missile.position.add(direction.clone().multiplyScalar(step))
    traveled += step

    if (targetData) {
      const distance = Math.hypot(
        missile.position.x - targetData.position.x,
        missile.position.z - targetData.position.z,
      )
      if (distance < 3) {
        const hit = applyHit(targetData, RACING_SCORE.MISSILE_HIT_SPEED_MULTIPLIER)
        particles?.spawnSparks(targetData.position.x, 1, targetData.position.z, particleCount(14))
        if (hit) racingAudio.crash(0.8)
        if (targetData === player1Data && hit) {
          cameraShake = racingSettings.cameraShake ? RACING_CAMERA.SHAKE_MAX : 0
        }
        scene.remove(missile)
        missileGeometry.dispose()
        missileMaterial.dispose()
        onResolved?.(hit)
        return
      }
    }
    if (traveled < 120) {
      trackRaf(animateMissile)
    } else {
      scene.remove(missile)
      missileGeometry.dispose()
      missileMaterial.dispose()
      onResolved?.(false)
    }
  }
  animateMissile(performance.now())
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
            const playerNum = magnetPlayerData === player1Data ? 1 : 2
            const racerRank = racerRankFor(magnetPlayerData!)
            collectTrackItem(item, magnetPlayerData!, playerNum, racerRank)
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
  playerData.shieldHits = 1
  playerData.shieldUntil = gameTime.value + duration

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
    if (shieldPlayerData === playerData) deactivateShield()
    clearInterval(shieldInterval)
  }, duration * 1000)
}

function deactivateShield() {
  if (shieldPlayerData) {
    shieldPlayerData.shieldHits = 0
    shieldPlayerData.shieldUntil = 0
  }
  shieldActive = false
  shieldPlayerData = null
  if (shieldMesh) {
    scene.remove(shieldMesh)
    const material = shieldMesh.material as THREE.Material
    shieldMesh.geometry.dispose()
    material.dispose()
    shieldMesh = null
  }
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
      if (ai.data.eliminated) continue
      const ax = (ai.data.position.x / 200) * 150 + 75
      const ay = (ai.data.position.z / 200) * 150 + 75
      ctx.beginPath()
      ctx.arc(ax, ay, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// 漂移状态追踪（driftVisual：车身视觉侧滑角，只做表现层）
const playerDriftState = new Map<
  PlayerData,
  { isDrifting: boolean; driftVisual: number; direction: -1 | 0 | 1 }
>()

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
  particles?.spawnSparks(noseX, 0.8, noseZ, particleCount(8))
}

function updatePlayer(
  playerData: PlayerData,
  carMesh: THREE.Group,
  controls: { left: boolean; right: boolean; gas: boolean; brake: boolean; action: boolean },
  playerNum: number,
  delta: number,
) {
  if (playerData.eliminated || playerData.finished) return
  if (
    playerData.shieldHits > 0 &&
    playerData.shieldUntil > 0 &&
    gameTime.value >= playerData.shieldUntil
  ) {
    if (shieldPlayerData === playerData) deactivateShield()
    else {
      playerData.shieldHits = 0
      playerData.shieldUntil = 0
    }
  }
  const carData = getSelectedCarData(playerNum) || RACING_CARS[0]
  const handling = getCarHandling(playerNum)
  const baseMaxSpeed = getCarMaxSpeed(playerNum)
  const canUseNitro = raceConfig.mode !== 'item-battle'
  const tankBoosting =
    canUseNitro && controls.action && playerData.speed > 1 && playerData.nitro > 0
  const itemBoosting = playerData.boostUntil > gameTime.value
  const isBoosting = tankBoosting || itemBoosting
  const maxSpeedValue = isBoosting
    ? baseMaxSpeed * RACING_DRIFT.BOOST_MAX_SPEED_MULTIPLIER
    : baseMaxSpeed
  const speedRatio = Math.min(Math.abs(playerData.speed) / maxSpeedValue, 1)

  // 获取或初始化漂移状态
  if (!playerDriftState.has(playerData)) {
    playerDriftState.set(playerData, { isDrifting: false, driftVisual: 0, direction: 0 })
  }
  const driftState = playerDriftState.get(playerData)!

  // 漂移条件：速度够快 + 转向 + 刹车
  const isDrifting =
    playerData.speed > RACING_DRIFT.MIN_DRIFT_SPEED &&
    (controls.left || controls.right) &&
    controls.brake
  const driftDirection: -1 | 0 | 1 = controls.left ? -1 : controls.right ? 1 : 0
  const reversedDrift =
    isDrifting &&
    driftState.isDrifting &&
    driftState.direction !== 0 &&
    driftDirection !== driftState.direction
  const driftInterrupted =
    reversedDrift ||
    (driftState.isDrifting && !isDrifting && playerData.speed <= RACING_DRIFT.MIN_DRIFT_SPEED)
  if (driftInterrupted) playerData.driftCharge = 0

  if (isDrifting) {
    const driftIntensity = carData.driftGain * Math.max(0.35, speedRatio)
    const chargeRate = RACING_DRIFT.CHARGE_RATE * driftIntensity
    playerData.driftCharge = Math.min(100, playerData.driftCharge + chargeRate * delta)
    if (canUseNitro) {
      playerData.nitro = Math.min(
        carData.nitroCapacity,
        playerData.nitro + RACING_DRIFT.NITRO_GAIN_RATE * driftIntensity * delta,
      )
    }
  }

  // 氮气在漂移过程中连续充入；出弯只结算速度倍率与技巧分。
  if (driftState.isDrifting && !isDrifting && !driftInterrupted) {
    const level = driftLevel(playerData.driftCharge)
    playerData.speed = Math.min(playerData.speed * driftBoostMultiplier(level), maxSpeedValue * 1.2)
    if (level !== 'none') {
      const nextCombo = addCombo({ value: combo.value, idle: comboIdle.value })
      combo.value = nextCombo.value
      comboIdle.value = nextCombo.idle
      score.value += driftScore(level)
    }
    playerData.driftCharge = 0
  }
  driftState.isDrifting = isDrifting
  driftState.direction = isDrifting ? driftDirection : 0

  // 转向：速度越快转向越钝（模拟抓地力），低速禁转（禁止原地陀螺）
  const steerDirection = playerData.speed >= 0 ? 1 : -1
  const turnMultiplier = isDrifting ? RACING_DRIFT.TURN_MULTIPLIER : 1
  const steerRate =
    RACING_PHYSICS.STEER_RATE *
    handling *
    racingSettings.steeringSensitivity *
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
  if (controls.gas && gameTime.value >= burnoutUntil) {
    if (playerData.speed >= 0) {
      const accelFactor = 1 - 0.7 * Math.min(playerData.speed / maxSpeedValue, 1)
      playerData.speed = Math.min(
        playerData.speed + carData.acceleration * accelFactor * delta * (isBoosting ? 1.22 : 1),
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

  if (tankBoosting) {
    playerData.nitro = Math.max(
      0,
      playerData.nitro - RACING_DRIFT.NITRO_DRAIN_RATE * carData.nitroDrain * delta,
    )
  }
  if (playerNum === 1) {
    boosting.value = isBoosting
    if (nitroFlame1) nitroFlame1.visible = isBoosting
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
  if (!isOffTrack(oldX + moveX, oldZ + moveZ)) {
    playerData.position.x = oldX + moveX
    playerData.position.z = oldZ + moveZ
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
    playerData.driftCharge = 0
  }

  // 漂移表现：轮胎痕迹 + 烟雾 + 车身视觉侧滑
  if (isDrifting) {
    createTireMark(playerData.position.x, playerData.position.z, playerData.rotation)
    if (particles && Math.random() < 0.6 * (racingSettings.particles / 100)) {
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

  const checkpointIndex = playerData.checkpointIndex
  const checkpoint = checkpoints[checkpointIndex]
  if (checkpoint) {
    const distance = Math.hypot(
      playerData.position.x - checkpoint.x,
      playerData.position.z - checkpoint.z,
    )
    if (distance < 15) {
      playerData.checkpointsPassed[checkpointIndex] = true
      playerData.checkpointIndex++
      if (playerNum === 1) {
        if (cleanSegment && checkpointIndex > 0) awardTechnique(120, 5)
        cleanSegment = true
      }
      if (playerNum === 1 && raceConfig.mode === 'time-trial' && activeGhost) {
        const targetSplit =
          activeGhost.lapTime * (checkpointIndex / Math.max(1, checkpoints.length))
        checkpointDelta.value = lapTime.value - targetSplit
        checkpointSplits[checkpointIndex] = checkpointDelta.value
        trackTimeout(() => {
          checkpointDelta.value = null
        }, 2200)
      }
    }
  }

  if (playerData.checkpointIndex >= checkpoints.length) {
    playerData.checkpointsPassed = new Array(checkpoints.length).fill(false)
    playerData.checkpointIndex = 0
    playerData.currentLap++

    // 圈速统计
    const lapDuration = gameTime.value - playerData.lapStartTime
    playerData.lastLapTime = lapDuration
    if (!playerData.bestLapTime || lapDuration < playerData.bestLapTime) {
      playerData.bestLapTime = lapDuration
    }
    playerData.lapStartTime = gameTime.value

    if (playerNum === 1 && raceConfig.mode === 'time-trial' && activeTrackId.value !== 'random') {
      const completedGhost = ghostRecorder.finish(
        activeTrackId.value,
        selectedCar.value,
        lapDuration,
      )
      if (
        !activeGhost ||
        lapDuration < activeGhost.lapTime ||
        racingSettings.ghostMode === 'gold'
      ) {
        void saveGhost(completedGhost)
        if (racingSettings.ghostMode === 'personal') activeGhost = completedGhost
      }
      ghostRecorder.reset()
      playerData.nitro = 40
      lastRecordedLapStart = gameTime.value
    }

    if (
      playerNum === 1 &&
      raceConfig.mode === 'knockout' &&
      playerData.currentLap <= totalLaps.value
    ) {
      eliminateLastRacer()
    }

    if (playerData.currentLap > totalLaps.value) {
      playerData.finished = true
      playerData.finishTime = gameTime.value
      if (gameMode.value === 'multi') {
        if (multiFinishDeadline.value === 0) {
          winner.value = playerNum
          multiFinishDeadline.value = gameTime.value + 10
        }
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
        const playerRank = racerRankFor(playerData)
        collectTrackItem(item, playerData, playerNum, playerRank)
      }
    }
  })
}

function eliminateLastRacer() {
  const racers = [
    { id: 'player', data: player1Data, mesh: car1 },
    ...aiCars.map((ai, index) => ({ id: `ai-${index + 1}`, data: ai.data, mesh: ai.mesh })),
  ].filter((racer) => !racer.data.eliminated && !racer.data.finished)
  if (racers.length <= 1) return
  racers.sort((a, b) => raceProgress(trackPoints, a.data) - raceProgress(trackPoints, b.data))
  const eliminated = racers[0]
  eliminated.data.eliminated = true
  eliminated.data.speed = 0
  eliminated.mesh.visible = false
  if (eliminated.data === player1Data) {
    rank.value = racers.length
    finishSingleRace()
  }
}

/** 单人冲线：算名次、奏乐、进结算。 */
function finishSingleRace() {
  const playerProg = raceProgress(trackPoints, player1Data)
  rank.value =
    1 +
    aiCars.filter((a) => !a.data.eliminated && raceProgress(trackPoints, a.data) > playerProg)
      .length
  finalizeProgress()
  racingAudio.stopEngine()
  racingAudio.finish(rank.value === 1)
  gameState.value = 'result'
}

function finalizeProgress() {
  recordImproved.value = false
  earnedMedal.value = 'none'
  const unlocksBefore = new Set(racingSave.value.unlockedLiveries)
  if (activeTrackId.value !== 'random' && raceConfig.mode === 'time-trial') {
    const track = TRACKS[activeTrackId.value]
    earnedMedal.value = getMedal(track, player1Data.bestLapTime)
    const result = updateRecord(racingSave.value, {
      trackId: activeTrackId.value,
      carId: selectedCar.value,
      bestLap: player1Data.bestLapTime,
      bestTotal: gameTime.value + player1Data.penaltyTime,
      medal: earnedMedal.value,
    })
    racingSave.value = result.save
    recordImproved.value = result.improved
  }

  if (raceConfig.mode === 'championship') {
    const ordered = [
      { id: 'player', time: gameTime.value, rank: rank.value },
      ...aiCars.map((ai, index) => ({
        id: `ai-${index + 1}`,
        time: ai.data.finishTime || gameTime.value + 15 + index,
        rank: 0,
      })),
    ].sort((a, b) => a.time - b.time)
    ordered.forEach((entry, index) => {
      const standing = championshipStandings.value.find((item) => item.racerId === entry.id)
      if (!standing) return
      standing.points += championshipPoints(index + 1)
      standing.totalTime += entry.time
      if (index === 0) standing.wins++
    })
    championshipStandings.value = sortChampionship(championshipStandings.value)
    if (championshipRound.value === 2 && championshipStandings.value[0]?.racerId === 'player') {
      racingSave.value.championshipWins++
      racingSave.value = applyUnlocks(racingSave.value)
    }
  }
  saveRacingSave(racingSave.value)
  newUnlocks.value = racingSave.value.unlockedLiveries
    .filter((livery) => !unlocksBefore.has(livery))
    .map((livery) => LIVERY_LABELS[livery] || livery)
}

function advanceChampionship() {
  championshipRound.value++
  startGame()
}

function restartChampionship() {
  championshipRound.value = 0
  championshipStandings.value = [
    { racerId: 'player', points: 0, wins: 0, totalTime: 0 },
    { racerId: 'ai-1', points: 0, wins: 0, totalTime: 0 },
    { racerId: 'ai-2', points: 0, wins: 0, totalTime: 0 },
    { racerId: 'ai-3', points: 0, wins: 0, totalTime: 0 },
  ]
  startGame()
}

function challengeGhost() {
  Object.assign(
    raceConfig,
    normalizeRaceConfig({
      ...raceConfig,
      mode: 'time-trial',
      trackId: activeTrackId.value === 'random' ? 'forest' : activeTrackId.value,
      localPlayers: 1,
    }),
  )
  void startConfiguredRace()
}

function finishMultiRace() {
  if (gameState.value !== 'playing') return
  multiFinishDeadline.value = 0
  racingAudio.finish(true)
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

  if (racingSettings.cameraShake && cameraShake > 0.003) {
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
  const targetFov = racingSettings.speedFov
    ? RACING_CAMERA.FOV_BASE + RACING_CAMERA.FOV_BOOST * Math.min(ratio, 1.3)
    : RACING_CAMERA.FOV_BASE
  camera.fov += (targetFov - camera.fov) * Math.min(k * 1.5, 1)
  camera.updateProjectionMatrix()
}

/** 场景表现层动画：金币旋转浮动、下一个检查点门楼高亮、氮气火焰脉动。 */
function animateScene(t: number) {
  collectibles.forEach((item, i) => {
    if (item.collected && gameTime.value >= item.respawnAt) {
      item.collected = false
      item.mesh.visible = true
    }
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
    if (!isRacerActive(ai.data)) continue
    const distance = Math.hypot(
      player1Data.position.x - ai.data.position.x,
      player1Data.position.z - ai.data.position.z,
    )
    if (!checkCarCollision(player1Data.position, ai.data.position)) {
      const nextAllowed = nearMissCooldown.get(ai.data) ?? 0
      if (
        distance < 5.2 &&
        distance > 3.2 &&
        player1Data.speed > 13 &&
        gameTime.value >= nextAllowed
      ) {
        nearMissCooldown.set(ai.data, gameTime.value + 2.5)
        awardTechnique(140, 7)
      }
      continue
    }
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
      applyHit(player1Data, RACING_SCORE.CAR_COLLISION_SPEED_MULTIPLIER)
      applyHit(ai.data, RACING_SCORE.CAR_COLLISION_SPEED_MULTIPLIER)
      racingAudio.crash(1)
      cameraShake = RACING_CAMERA.SHAKE_MAX
      const midX = (player1Data.position.x + ai.data.position.x) / 2
      const midZ = (player1Data.position.z + ai.data.position.z) / 2
      particles?.spawnSparks(midX, 0.8, midZ, particleCount(12))
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
  multiFinishDeadline.value = 0
  totalLaps.value = raceConfig.laps
  currentLap.value = 1
  skillsUsed.value = 0
  maxSpeed.value = 0
  score.value = 0
  combo.value = 0
  comboIdle.value = 0
  lapTime.value = 0
  rank.value = 1
  previousRank.value = 1
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
  cleanSegment = true
  checkpointDelta.value = null
  incomingWarningUntil.value = 0
  checkpointSplits.length = 0
  recordImproved.value = false
  earnedMedal.value = 'none'
  newUnlocks.value = []
  startFeedback.value = ''
  firstThrottleAt = null
  burnoutUntil = 0
  ghostRecorder.reset()
  lastRecordedLapStart = 0
  for (const obstacle of deployedObstacles) {
    obstacle.mesh.removeFromParent()
    obstacle.mesh.geometry.dispose()
    ;(obstacle.mesh.material as THREE.Material).dispose()
  }
  deployedObstacles.length = 0

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
  racingAudio.setVolumes(
    racingSettings.masterVolume,
    racingSettings.engineVolume,
    racingSettings.effectsVolume,
  )
  racingAudio.countBeep(false)
  raceGoAt = performance.now() + 3000

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
      trackTimeout(() => {
        const offset = firstThrottleAt === null ? Infinity : (firstThrottleAt - raceGoAt) / 1000
        const startResult = perfectStart(offset, currentCar.value.perfectStartWindow)
        if (startResult === 'perfect') {
          player1Data.speed = Math.max(player1Data.speed, 11)
          player1Data.nitro = Math.min(currentCar.value.nitroCapacity, player1Data.nitro + 15)
          startFeedback.value = '完美起步'
        } else if (startResult === 'burnout') {
          burnoutUntil = gameTime.value + 0.65
          startFeedback.value = '起步过早'
        }
      }, currentCar.value.perfectStartWindow * 1000)
      // GO 显示 0.9 秒后隐藏
      trackTimeout(() => {
        if (countdownValue.value === 0) countdownValue.value = -1
        startFeedback.value = ''
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
  pollGamepads()

  if (running) {
    gameTime.value += delta
    lapTime.value = gameTime.value - player1Data.lapStartTime

    const comboState = tickCombo({ value: combo.value, idle: comboIdle.value }, delta)
    combo.value = comboState.value
    comboIdle.value = comboState.idle

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
        left: keyboardControls.p1Left || mobileControls.left || gamepadControls[0].left,
        right: keyboardControls.p1Right || mobileControls.right || gamepadControls[0].right,
        gas:
          racingSettings.autoAccelerate ||
          keyboardControls.p1Gas ||
          mobileControls.gas ||
          gamepadControls[0].gas,
        brake: keyboardControls.p1Brake || mobileControls.brake || gamepadControls[0].brake,
        action: keyboardControls.p1Action || mobileControls.action || gamepadControls[0].action,
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
          trackWidth: activeTrackWidth.value,
          allowTankNitro: raceConfig.mode !== 'item-battle',
          playerProgress,
          difficulty: raceConfig.difficulty,
        })
      }
      if (raceConfig.mode === 'item-battle') updateAIItems(delta)
      handleAICollisions(delta)
      updateObstacles()

      // 实时名次
      rank.value =
        1 +
        aiCars.filter(
          (a) => !a.data.eliminated && raceProgress(trackPoints, a.data) > playerProgress,
        ).length
      if (rank.value < previousRank.value) awardTechnique(200, 10)
      previousRank.value = rank.value

      // 引擎音调跟随速度
      racingAudio.setEngine(Math.abs(player1Data.speed) / getCarMaxSpeed(1), boosting.value)

      if (raceConfig.mode === 'time-trial' && activeTrackId.value !== 'random') {
        ghostRecorder.sample({
          time: lapTime.value,
          x: player1Data.position.x,
          z: player1Data.position.z,
          rotation: player1Data.rotation,
          speed: player1Data.speed,
        })
        updateGhostPlayback()
      }
    }
    updateCameraSingle(delta)
    if (renderer && scene && camera) {
      renderer.render(scene, camera)
    }
  } else {
    if (running) {
      const p1Controls = {
        left: keyboardControls.p1Left || gamepadControls[0].left,
        right: keyboardControls.p1Right || gamepadControls[0].right,
        gas: racingSettings.autoAccelerate || keyboardControls.p1Gas || gamepadControls[0].gas,
        brake: keyboardControls.p1Brake || gamepadControls[0].brake,
        action: keyboardControls.p1Action || gamepadControls[0].action,
      }
      const p2Controls = {
        left: keyboardControls.p2Left || gamepadControls[1].left,
        right: keyboardControls.p2Right || gamepadControls[1].right,
        gas: racingSettings.autoAccelerate || keyboardControls.p2Gas || gamepadControls[1].gas,
        brake: keyboardControls.p2Brake || gamepadControls[1].brake,
        action: keyboardControls.p2Action || gamepadControls[1].action,
      }

      updatePlayer(player1Data, car1, p1Controls, 1, delta)
      updatePlayer(player2Data, car2, p2Controls, 2, delta)
      if (
        multiFinishDeadline.value > 0 &&
        ((player1Data.finished && player2Data.finished) ||
          gameTime.value >= multiFinishDeadline.value)
      ) {
        finishMultiRace()
      }
      if (raceConfig.mode === 'item-battle') updateObstacles()

      if (checkCarCollision(player1Data.position, player2Data.position)) {
        applyHit(player1Data, RACING_SCORE.CAR_COLLISION_SPEED_MULTIPLIER)
        applyHit(player2Data, RACING_SCORE.CAR_COLLISION_SPEED_MULTIPLIER)
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
const KEY_BINDINGS: {
  binding: keyof RacingSettings['keyBindings']
  control: keyof typeof keyboardControls
}[] = [
  { binding: 'p1Left', control: 'p1Left' },
  { binding: 'p1Right', control: 'p1Right' },
  { binding: 'p1Gas', control: 'p1Gas' },
  { binding: 'p1Brake', control: 'p1Brake' },
  { binding: 'p1Action', control: 'p1Action' },
  { binding: 'p2Left', control: 'p2Left' },
  { binding: 'p2Right', control: 'p2Right' },
  { binding: 'p2Gas', control: 'p2Gas' },
  { binding: 'p2Brake', control: 'p2Brake' },
  { binding: 'p2Action', control: 'p2Action' },
]

function applyKeyBinding(e: KeyboardEvent, value: boolean) {
  const binding = KEY_BINDINGS.find((b) => racingSettings.keyBindings[b.binding] === e.key)
  if (binding) keyboardControls[binding.control] = value
}

function handleKeyDown(e: KeyboardEvent) {
  // 菜单界面：← → 快速切换玩家1赛车（此时方向键尚未绑定驾驶）
  if (gameState.value === 'menu') {
    if (e.key === 'ArrowLeft') {
      prevCar(1)
      return
    }
    if (e.key === 'ArrowRight') {
      nextCar(1)
      return
    }
  }
  if (
    canCaptureStartThrottle() &&
    e.key === racingSettings.keyBindings.p1Gas &&
    firstThrottleAt === null
  ) {
    firstThrottleAt = performance.now()
  }
  applyKeyBinding(e, true)

  if (!e.repeat && e.key === racingSettings.keyBindings.p1Action) onActionPress(1)
  if (!e.repeat && e.key === racingSettings.keyBindings.p2Action) onActionPress(2)
  if (!e.repeat && e.key === racingSettings.keyBindings.p1Reset && gameState.value === 'playing')
    resetRacer(player1Data, car1)
  if (
    !e.repeat &&
    e.key === racingSettings.keyBindings.p2Reset &&
    gameState.value === 'playing' &&
    gameMode.value === 'multi'
  )
    resetRacer(player2Data, car2)

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
  racingDisposed = false
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('resize', handleResize)
  // 初始就是菜单界面，直接搭建展厅并开始渲染
  ensureShowroom()
})

onUnmounted(() => {
  racingDisposed = true
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('resize', handleResize)
  disposeShowroom()
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
    environmentTexture?.dispose()
    environmentTexture = null
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

/* 返回按钮（位于顶部条内，随文档流，不悬浮压内容） */
.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  color: var(--text-inverse);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: var(--racing-accent);
  box-shadow: 0 0 14px rgba(var(--racing-accent-rgb), 0.3);
}

/* 游戏菜单：全屏 3D 展厅 + 悬浮 UI（顶部条 / 底部坞站） */
.game-menu {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(ellipse at 50% -10%, rgba(90, 120, 255, 0.18) 0%, transparent 55%),
    linear-gradient(135deg, #101223 0%, #141a35 55%, #0b0d1f 100%);
  z-index: 10;
  overflow: hidden;
}

/* 顶部条：返回 + 标题 + 模式切换，三栏布局 */
.menu-topbar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
}

.menu-title {
  flex: 1;
  text-align: center;
  min-width: 0;
}

.menu-title h1 {
  font-size: 1.7rem;
  letter-spacing: 4px;
  background: linear-gradient(90deg, #ff6b6b, #ffd700, #7f9dff, #ff6b6b);
  background-size: 300% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: title-shine 5s linear infinite;
  filter: drop-shadow(0 0 16px rgba(255, 107, 107, 0.35));
}

.menu-title .subtitle {
  color: var(--text-muted);
  font-size: 0.78rem;
  letter-spacing: 1px;
  margin-top: 2px;
}

/* 模式切换：分段控件 */
.mode-seg {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  flex-shrink: 0;
}

.seg-btn {
  padding: 8px 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.25s;
}

.seg-btn:hover {
  color: var(--text-inverse);
}

.seg-btn.active {
  background: linear-gradient(135deg, var(--racing-accent), var(--racing-accent-2));
  color: var(--text-inverse);
  box-shadow: 0 0 14px rgba(var(--racing-accent-rgb), 0.45);
}

/* 屏幕两侧换车大箭头 */
.edge-btn {
  position: absolute;
  top: 42%;
  z-index: 3;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  color: var(--text-inverse);
  font-size: 1.8rem;
  line-height: 1;
  cursor: pointer;
  transition: all 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edge-btn.prev {
  left: 22px;
}

.edge-btn.next {
  right: 22px;
}

.edge-btn:hover {
  background: rgba(var(--racing-accent-rgb), 0.25);
  border-color: var(--racing-accent);
  box-shadow: 0 0 18px rgba(var(--racing-accent-rgb), 0.45);
  transform: scale(1.08);
}

/* 暗角：视线聚焦中央展台 */
.menu-vignette {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 42%, transparent 42%, rgba(5, 7, 18, 0.72) 100%);
}

/* 底部玻璃坞站 */
.menu-dock {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 16px;
  background: linear-gradient(180deg, rgba(12, 15, 32, 0.55), rgba(8, 10, 24, 0.88));
  border-top: 1px solid rgba(130, 160, 255, 0.18);
  backdrop-filter: blur(18px);
}

.dock-grid {
  display: flex;
  justify-content: center;
  gap: 32px;
  width: 100%;
  max-width: 680px;
}

.dock-grid.multi .dock-car {
  flex: 1;
  min-width: 0;
}

.dock-car {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.dock-car-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.car-big-name {
  font-size: 1.6rem;
  letter-spacing: 3px;
  color: var(--text-inverse);
}

.mini-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-inverse);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  transition: all 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mini-btn:hover {
  background: rgba(var(--racing-accent-rgb), 0.25);
  border-color: var(--racing-accent);
}

/* 动态背景层：网格漂移 + 光晕漂浮，全部纯 CSS 合成 */
.menu-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.menu-grid {
  position: absolute;
  inset: -60px;
  background-image:
    linear-gradient(rgba(100, 140, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(100, 140, 255, 0.08) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse at 50% 45%, black 25%, transparent 72%);
  -webkit-mask-image: radial-gradient(ellipse at 50% 45%, black 25%, transparent 72%);
  animation: grid-drift 16s linear infinite;
}

@keyframes grid-drift {
  from {
    transform: translate(0, 0);
  }
  to {
    transform: translate(44px, 44px);
  }
}

.menu-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.5;
}

.orb-a {
  width: 340px;
  height: 340px;
  left: -80px;
  top: -60px;
  background: rgba(255, 107, 107, 0.35);
  animation: orb-float-a 13s ease-in-out infinite;
}

.orb-b {
  width: 420px;
  height: 420px;
  right: -120px;
  top: 20%;
  background: rgba(80, 120, 255, 0.32);
  animation: orb-float-b 17s ease-in-out infinite;
}

.orb-c {
  width: 260px;
  height: 260px;
  left: 30%;
  bottom: -100px;
  background: rgba(255, 215, 0, 0.16);
  animation: orb-float-c 15s ease-in-out infinite;
}

@keyframes orb-float-a {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(60px, 40px) scale(1.15);
  }
}

@keyframes orb-float-b {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(-70px, -30px) scale(1.1);
  }
}

@keyframes orb-float-c {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(-40px, -50px) scale(1.2);
  }
}

@keyframes title-shine {
  to {
    background-position: 300% center;
  }
}

/* 全屏 3D 展厅画布 */
.showroom-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
}

.showroom-loading {
  position: absolute;
  top: 42%;
  left: 50%;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  color: rgba(244, 247, 255, 0.84);
  background: rgba(10, 12, 28, 0.58);
  backdrop-filter: blur(10px);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.showroom-loading span {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-top-color: #ff9277;
  border-radius: 50%;
  animation: showroom-spin 0.75s linear infinite;
}

.showroom-loading strong {
  font-size: 0.8rem;
  letter-spacing: 0.08em;
}

@keyframes showroom-spin {
  to {
    transform: rotate(360deg);
  }
}

.car-trait {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-inverse);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.car-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 250px;
}

.car-perk {
  width: min(330px, 90vw);
  margin: 7px 0 0;
  color: #aeb6ca;
  font-size: 0.78rem;
  text-align: center;
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
  border: 1px solid transparent;
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
  font-weight: 600;
  letter-spacing: 2px;
  background: linear-gradient(
    135deg,
    var(--racing-accent) 0%,
    var(--racing-accent-2) 50%,
    var(--racing-accent) 100%
  );
  background-size: 200% auto;
  color: var(--text-inverse);
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition:
    transform 0.3s,
    box-shadow 0.3s;
  margin-bottom: 0;
  animation:
    start-btn-flow 3s linear infinite,
    start-btn-pulse 2.2s ease-in-out infinite;
}

@keyframes start-btn-flow {
  to {
    background-position: 200% center;
  }
}

@keyframes start-btn-pulse {
  0%,
  100% {
    box-shadow: 0 0 16px rgba(var(--racing-accent-rgb), 0.35);
  }
  50% {
    box-shadow: 0 0 32px rgba(var(--racing-accent-rgb), 0.6);
  }
}

.start-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 40px rgba(var(--racing-accent-rgb), 0.7);
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
  width: auto;
  min-width: 44px;
  height: 44px;
  padding: 0 10px;
  gap: 5px;
  border-radius: 14px;
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

.pause-btn span {
  font-size: 0.7rem;
  font-weight: 800;
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
  padding: 15px 68px 15px 15px;
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

.split-meter {
  width: 132px;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
}

.split-meter i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4bd8ff, #9d7bff);
}

.split-item-slot {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  color: #fff;
  background: rgba(12, 15, 26, 0.8);
}

.finish-grace,
.danger-warning,
.jammer-warning,
.checkpoint-delta,
.start-feedback {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 999px;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: rgba(12, 15, 26, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(12px);
}

.finish-grace {
  top: 112px;
}
.checkpoint-delta {
  top: 102px;
  color: #ff8f76;
}
.checkpoint-delta.faster {
  color: #52eba0;
}
.danger-warning {
  top: 142px;
  color: #ffbf47;
  border-color: rgba(255, 191, 71, 0.5);
  animation: warning-pulse 0.55s ease-in-out infinite alternate;
}
.jammer-warning {
  top: 182px;
  color: #d9a4ff;
}
.start-feedback {
  top: calc(50% + 100px);
  font-size: 1rem;
}

.race-tech-bar {
  position: absolute;
  left: 50%;
  bottom: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  transform: translateX(-50%);
  pointer-events: auto;
}

.tech-meter,
.item-slot,
.drift-callout {
  min-height: 48px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 15px;
  color: #f7f9ff;
  background: rgba(10, 13, 23, 0.82);
  backdrop-filter: blur(14px);
}

.tech-meter {
  min-width: 230px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 0 13px;
  font-size: 0.72rem;
  font-weight: 800;
}

.tech-meter > div {
  width: 120px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
}

.tech-meter i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #36d7ff, #8e70ff);
  box-shadow: 0 0 12px rgba(77, 203, 255, 0.6);
}

.drift-callout {
  display: grid;
  place-items: center;
  min-width: 118px;
  padding: 0 12px;
  color: #78e4ff;
  font-size: 0.75rem;
  font-weight: 900;
}
.drift-callout.is-great {
  color: #b993ff;
}
.drift-callout.is-perfect {
  color: #ffc857;
  box-shadow: 0 0 22px rgba(255, 200, 87, 0.2);
}

.item-slot {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  cursor: pointer;
}
.item-slot:disabled {
  opacity: 0.56;
  cursor: default;
}
.item-slot kbd {
  color: #aeb7cc;
  font-size: 0.68rem;
}

@keyframes warning-pulse {
  to {
    transform: translateX(-50%) scale(1.04);
  }
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
.control-brake,
.control-action {
  position: absolute;
  bottom: 25px;
}

.control-gas {
  right: 105px;
}

.control-brake {
  right: 25px;
}

.control-action {
  right: 65px;
  bottom: 102px;
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
  position: relative;
}

.control-btn span {
  position: absolute;
  bottom: -17px;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  text-shadow: 0 1px 4px #000;
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

.action-btn {
  background: linear-gradient(145deg, rgba(77, 211, 255, 0.78), rgba(126, 90, 255, 0.72));
  color: #fff;
}

.record-banner {
  margin-top: 12px;
  padding: 9px 12px;
  border: 1px solid rgba(82, 235, 160, 0.35);
  border-radius: 10px;
  color: #52eba0;
  text-align: center;
  font-weight: 800;
  background: rgba(82, 235, 160, 0.08);
}

.unlock-banner {
  margin-top: 8px;
  padding: 9px 12px;
  border: 1px solid rgba(255, 200, 87, 0.35);
  border-radius: 10px;
  color: #ffc857;
  text-align: center;
  font-weight: 800;
  background: rgba(255, 200, 87, 0.08);
}

.championship-board {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}
.championship-board > div {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  color: #dce2f1;
  background: rgba(255, 255, 255, 0.05);
}

.final-medal {
  color: #ffc857;
  font-weight: 800;
}

.race-setup-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(5, 7, 13, 0.76);
  backdrop-filter: blur(12px);
}

.asset-loading {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: rgba(5, 7, 13, 0.9);
  backdrop-filter: blur(18px);
}

.loading-card {
  width: min(420px, calc(100vw - 40px));
  display: grid;
  gap: 12px;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 22px;
  color: #f6f8ff;
  background: rgba(17, 21, 36, 0.94);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}
.loading-card > span {
  color: #ff8c6f;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.18em;
}
.loading-card > strong {
  font-size: 1.25rem;
}
.loading-card > div {
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}
.loading-card i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #ff765d, #ffc16d);
  transition: width 0.2s ease;
}
.loading-card > b {
  justify-self: end;
  color: #b7bfd2;
  font-size: 0.78rem;
}

.livery-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 7px;
  color: #9ea8bf;
  font-size: 0.72rem;
}

.livery-chip {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  color: #cbd2e2;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
}

.livery-chip > span {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.livery-chip.active {
  color: #fff;
  border-color: #ff8c6f;
  background: rgba(255, 120, 91, 0.13);
}
.livery-chip.locked {
  opacity: 0.48;
  cursor: not-allowed;
}

.racing-game.large-text .game-hud,
.racing-game.large-text .race-tech-bar,
.racing-game.large-text .mobile-controls {
  font-size: 1.16em;
}

.racing-game.color-assist .drift-callout::before,
.racing-game.color-assist .checkpoint-delta::before {
  content: '◆';
  margin-right: 6px;
}

.racing-game.jammed .minimap canvas {
  opacity: 0.18;
  filter: saturate(0) contrast(1.8);
}

.racing-game.jammed .hud-top > :nth-child(2n) {
  opacity: 0.38;
  filter: blur(1px);
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
  .menu-topbar {
    flex-wrap: wrap;
    justify-content: center;
    padding: 12px 14px;
    gap: 10px;
  }

  .menu-title {
    order: 3;
    flex-basis: 100%;
  }

  .menu-title h1 {
    font-size: 1.3rem;
    letter-spacing: 2px;
  }

  .seg-btn {
    padding: 6px 14px;
    font-size: 0.8rem;
  }

  .edge-btn {
    width: 42px;
    height: 42px;
    font-size: 1.3rem;
    top: 38%;
  }

  .edge-btn.prev {
    left: 10px;
  }

  .edge-btn.next {
    right: 10px;
  }

  .menu-dock {
    max-height: 58%;
    overflow-y: auto;
    padding: 14px 14px 12px;
    gap: 10px;
  }

  .dock-grid {
    gap: 18px;
  }

  .dock-grid.multi {
    flex-direction: column;
    gap: 14px;
  }

  .car-big-name {
    font-size: 1.2rem;
    letter-spacing: 2px;
  }

  .start-btn {
    padding: 12px 40px;
    font-size: 1rem;
  }

  .controls-hint {
    font-size: 0.72rem;
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

  .race-tech-bar {
    bottom: 170px;
    width: calc(100% - 126px);
    justify-content: center;
  }

  .tech-meter {
    min-width: 0;
    width: min(220px, 100%);
  }

  .tech-meter > div {
    width: auto;
  }
  .drift-callout {
    min-width: 88px;
  }
  .item-slot span,
  .item-slot kbd {
    display: none;
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

  .control-action {
    right: 50px;
    bottom: 88px;
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
    width: auto;
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

@media (prefers-reduced-motion: reduce) {
  .racing-game *,
  .racing-game *::before,
  .racing-game *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
