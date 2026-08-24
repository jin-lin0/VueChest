<script setup lang="ts">
// 游玩界面：Canvas 舞台 + HUD + 结算。
// 音频解码与谱面生成由父组件完成，这里只负责「玩」。
//
// 视觉结构（对齐设计稿）：
//   顶部三分区 HUD（退出 / 分数居中 / 曲名+进度）
//   居中一条窄跑道（Canvas 内部自己算居中，见 renderer.stageMetrics）
//   底部键位胶囊，横向位置与轨道严格对齐
//   左下倍率、右下时间码
import { ref, onMounted, onUnmounted, onBeforeUnmount, computed } from 'vue'
import { formatClock } from '@/utils'
import { Game, PREP_TIME } from '../core/game'
import { rankOf, averageError, comboMultiplier, type JudgeStats } from '../core/judge-engine'
import type { Beatmap } from '../core/beatmap'
import { beatmapDensity, difficultyLabel } from '../core/beatmap'
import { LANE_COLORS } from '../core/theme'

const props = defineProps<{
  audioCtx: AudioContext
  audioBuffer: AudioBuffer
  beatmap: Beatmap
  userOffset: number
  approachTime: number
}>()

const emit = defineEmits<{
  exit: []
  retry: []
  result: [
    payload: {
      score: number
      accuracy: number
      rank: string
      maxCombo: number
      miss: number
      duration: number
      difficulty: string
    },
  ]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const stage = ref<'ready' | 'playing' | 'result'>('ready')
const stats = ref<JudgeStats | null>(null)
const progress = ref(0)
const accuracy = ref(100)
/** 暂停中（切后台自动触发，或玩家手动触发） */
const paused = ref(false)
/** 当前处于全屏（横屏）模式 */
const isFullscreen = ref(false)
/** 当前播放位置（秒），用于时间码显示 */
const elapsed = ref(0)
/** 按下的轨道，驱动底部键位胶囊的高亮 */
const pressedLanes = ref<Set<number>>(new Set())

/**
 * 跑道几何：由 Renderer 计算后同步过来。
 *
 * 为什么不在 CSS 里各算一遍：底部键位胶囊必须和 Canvas 里的轨道
 * 严格对齐，两处独立计算一旦策略变化就会错位。让 Canvas 做唯一真相。
 */
const stageBox = ref({ x: 0, width: 0, laneWidth: 0 })

let game: Game | null = null
let resizeObserver: ResizeObserver | null = null

const KEYS = ['d', 'f', 'j', 'k']

/**
 * 是否触屏设备（主指针是粗指针 = 手机/平板）。
 *
 * 用 pointer: coarse 而非 ontouchstart：带触屏的笔记本主指针仍是鼠标，
 * 用 ontouchstart 判断会把它们误判成手机、藏掉键盘玩家需要的键位提示。
 * 只在初始化时判一次——设备的主指针类型在一局游戏里不会变。
 */
const isTouch =
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

const density = computed(() => beatmapDensity(props.beatmap))
const difficulty = computed(() => difficultyLabel(density.value))

const rank = computed(() =>
  stats.value ? rankOf(accuracy.value, stats.value.miss, props.beatmap.notes.length) : 'D',
)
const avgError = computed(() => (stats.value ? averageError(stats.value.errors) : 0))

/** 连击倍率，仅展示（见 comboMultiplier 的注释） */
const multiplier = computed(() => comboMultiplier(stats.value?.combo ?? 0))

/**
 * 分数文本：固定 7 位 + 三位分组，如 `004,185,290`。
 *
 * 为什么要补零到固定位数：分数每帧都在变，位数一跳整块 HUD 就会左右抖。
 * 满分是 1,000,000（7 位），所以补到 7 位再分组即可——
 * 之前补到 11 位会得到一长串没有分隔符的 0，既难读也不像分数。
 */
const scoreText = computed(() => {
  const s = stats.value?.score ?? 0
  return String(s).padStart(7, '0').replace(/\B(?=(\d{3})+$)/g, ',')
})

const timeCode = computed(
  () => `${formatClock(elapsed.value)} / ${formatClock(props.beatmap.duration)}`,
)

/** 触屏热区的定位样式：铺满整格轨道，直接复用 Canvas 算出的宽度 */
function laneStyle(i: number) {
  const { x, laneWidth } = stageBox.value
  if (!laneWidth) return { display: 'none' }
  return {
    left: `${x + i * laneWidth}px`,
    width: `${laneWidth}px`,
    '--lane-color': LANE_COLORS[i % LANE_COLORS.length],
  }
}

/**
 * 键位胶囊的定位样式：只给轨道**中心**的 x。
 *
 * 与热区不同——胶囊是固定 44px 的方键，靠 `margin-left: -22px` 自己居中，
 * 所以这里不能传 width，否则会把方键拉成一整格宽的板子。
 */
function keycapStyle(i: number) {
  const { x, laneWidth } = stageBox.value
  if (!laneWidth) return { display: 'none' }
  return {
    left: `${x + (i + 0.5) * laneWidth}px`,
    '--lane-color': LANE_COLORS[i % LANE_COLORS.length],
  }
}

function syncStageBox() {
  const m = game?.stageMetrics
  if (m) stageBox.value = { x: m.x, width: m.width, laneWidth: m.laneWidth }
}

function buildGame() {
  if (!canvasRef.value) return
  game?.dispose()
  game = new Game(
    props.audioCtx,
    props.audioBuffer,
    props.beatmap,
    canvasRef.value,
    {
      onJudge: (_, s) => {
        stats.value = { ...s, errors: s.errors }
        accuracy.value = game?.accuracy ?? 100
      },
      onFrame: (t, s) => {
        // clamp 下界：lead-in 期间 t 是负值，直接算会让进度条反向
        progress.value =
          props.beatmap.duration > 0 ? Math.max(0, (t / props.beatmap.duration) * 100) : 0
        elapsed.value = t
        stats.value = { ...s, errors: s.errors }
      },
      onFinish: (s) => {
        stats.value = { ...s, errors: s.errors }
        accuracy.value = game?.accuracy ?? 100
        stage.value = 'result'
        game?.stop()
        emit('result', {
          score: s.score,
          accuracy: accuracy.value,
          rank: rankOf(accuracy.value, s.miss, props.beatmap.notes.length),
          maxCombo: s.maxCombo,
          miss: s.miss,
          duration: props.beatmap.duration,
          difficulty: difficulty.value,
        })
      },
      onPause: () => {
        paused.value = true
      },
      onResume: () => {
        paused.value = false
      },
    },
    {
      keys: KEYS,
      userOffset: props.userOffset,
      approachTime: props.approachTime,
      // 触屏设备把判定线压得更低：底部没有键位排挡着，判定线越低
      // 音符的可视下落行程越长（横屏矮视口下尤其明显）。
      // 28px 只留打击特效扩散环的铺开空间
      judgeLineOffset: isTouch ? 28 : undefined,
    },
  )
  syncStageBox()
}

async function startGame() {
  buildGame()
  stage.value = 'playing'
  paused.value = false
  await game?.start()
}

/** 从切后台的自动暂停中恢复 */
function resumeGame() {
  game?.resume()
}

/** 手动暂停：Esc 由 Game 内部处理，这里是给触屏玩家的按钮入口 */
function pauseGame() {
  game?.pause()
}

/**
 * 横屏（全屏）模式。
 *
 * 用 Fullscreen API + orientation.lock 组合：
 * - 桌面端：全屏本身就是收益（去掉浏览器 chrome，跑道更高）
 * - 移动端：全屏是 orientation.lock 的**前置条件**（规范要求），
 *   锁定横屏后 4 条轨道能用上整个长边，键位不再挤成一团
 *
 * orientation.lock 失败要静默吞掉：桌面浏览器一律抛 NotSupportedError，
 * iOS Safari 也不支持——这是增强而非依赖，失败时全屏仍然成立。
 */
async function toggleFullscreen() {
  const el = rootRef.value
  if (!el) return
  try {
    if (!document.fullscreenElement) {
      await el.requestFullscreen()
      type LockableOrientation = ScreenOrientation & {
        lock?: (o: string) => Promise<void>
      }
      const orientation = screen.orientation as LockableOrientation
      await orientation.lock?.('landscape').catch(() => {})
    } else {
      await document.exitFullscreen()
    }
  } catch {
    // 全屏被拒绝（iframe 无 allowfullscreen 等），保持原样即可
  }
}

/** 全屏状态跟随浏览器事件而非自己记 flag：Esc 退出全屏不会走 toggle */
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  // 尺寸在全屏进出瞬间变化，让渲染器立刻重新量取，
  // 不等 ResizeObserver 的下一个回调（有的引擎会延迟一帧）
  game?.resize()
  syncStageBox()
}

function quit() {
  game?.stop()
  // 退出时把全屏也退掉：回到选曲页还留在全屏里会让人找不到浏览器
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  emit('exit')
}

function retry() {
  stats.value = null
  accuracy.value = 100
  progress.value = 0
  elapsed.value = 0
  startGame()
}

/** 触屏 / 鼠标点击轨道 */
function onLaneDown(lane: number) {
  game?.setLanePressed(lane, true)
  pressedLanes.value = new Set(pressedLanes.value).add(lane)
  game?.tapLane(lane)
}
function onLaneUp(lane: number) {
  game?.setLanePressed(lane, false)
  const next = new Set(pressedLanes.value)
  next.delete(lane)
  pressedLanes.value = next
  // 必须转发松手，否则长按永远结算不了（触屏玩家会全是 miss）
  game?.releaseLane(lane)
}

/**
 * 键盘按下时同步胶囊高亮。
 *
 * Game 内部已经监听了 keydown 做判定，这里再监听一次只为驱动 DOM 高亮——
 * 让 Game 反过来回调 DOM 会把渲染职责泄漏进核心逻辑，不值得。
 */
function onKeyDown(e: KeyboardEvent) {
  const i = KEYS.indexOf(e.key.toLowerCase())
  if (i === -1 || pressedLanes.value.has(i)) return
  pressedLanes.value = new Set(pressedLanes.value).add(i)
}
function onKeyUp(e: KeyboardEvent) {
  const i = KEYS.indexOf(e.key.toLowerCase())
  if (i === -1) return
  const next = new Set(pressedLanes.value)
  next.delete(i)
  pressedLanes.value = next
}

onMounted(() => {
  // ready 态先画一帧空舞台，让玩家看到轨道布局
  buildGame()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('fullscreenchange', onFullscreenChange)

  // 跑道宽度随容器变化，键位胶囊要跟着走。
  // 同时让渲染器重量尺寸：横竖屏切换/全屏进出改变的是容器而非 window，
  // Game 自己监听的 window resize 收不到这类变化
  if (canvasRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      game?.resize()
      syncStageBox()
    })
    resizeObserver.observe(canvasRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  resizeObserver?.disconnect()
  resizeObserver = null
})

onUnmounted(() => {
  game?.dispose()
})
</script>

<template>
  <div ref="rootRef" class="play-root">
    <!-- 背景光晕：两个巨大的柔光球，给纯黑背景一点空间深度 -->
    <div class="bg-orb orb-a" />
    <div class="bg-orb orb-b" />

    <header class="hud">
      <div class="hud-left">
        <button class="exit-btn" @click="quit">
          <span class="arrow">←</span> 退出
        </button>
        <button
          v-if="stage === 'playing' && !paused"
          class="exit-btn"
          title="暂停（Esc）"
          @click="pauseGame"
        >
          ⏸
        </button>
      </div>

      <div class="score-block">
        <div class="score">{{ scoreText }}</div>
        <div class="score-sub">
          <span class="acc">ACC {{ accuracy.toFixed(2) }}%</span>
          <span class="live-rank" :class="'rank-' + rank">{{ rank }}</span>
        </div>
      </div>

      <div class="song-block">
        <div class="song-row">
          <span class="song-name">{{ beatmap.title }}</span>
          <button
            class="fs-btn"
            :class="{ on: isFullscreen }"
            :title="isFullscreen ? '退出全屏' : '全屏（移动端自动横屏）'"
            @click="toggleFullscreen"
          >
            ⛶
          </button>
        </div>
        <div class="song-progress"><i :style="{ width: progress + '%' }" /></div>
        <span class="song-meta">{{ difficulty }} · {{ beatmap.bpm }} BPM</span>
      </div>
    </header>

    <div class="stage-wrap">
      <canvas ref="canvasRef" class="stage" />

      <!-- 触屏轨道热区：宽度与 Canvas 里的轨道对齐，否则点不准 -->
      <div class="touch-lanes">
        <div
          v-for="i in beatmap.lanes"
          :key="i"
          class="touch-lane"
          :style="laneStyle(i - 1)"
          @pointerdown.prevent="onLaneDown(i - 1)"
          @pointerup="onLaneUp(i - 1)"
          @pointerleave="onLaneUp(i - 1)"
        />
      </div>

      <div v-if="stage === 'ready'" class="overlay">
        <p class="eyebrow">READY</p>
        <h2>{{ beatmap.title }}</h2>
        <div class="ready-stats">
          <div><b>{{ difficulty }}</b><span>DIFFICULTY</span></div>
          <div><b>{{ beatmap.notes.length }}</b><span>NOTES</span></div>
          <div><b>{{ beatmap.bpm }}</b><span>BPM</span></div>
          <div v-if="beatmap.meta.holdNotes > 0">
            <b>{{ beatmap.meta.holdNotes }}</b><span>HOLDS</span>
          </div>
        </div>
        <p class="keys-hint">
          <template v-if="!isTouch">
            <kbd v-for="k in KEYS" :key="k">{{ k.toUpperCase() }}</kbd>
          </template>
          <span v-if="beatmap.meta.holdNotes > 0">
            {{ isTouch ? '点按轨道击打，' : '' }}长条按住不放，直到条身走完
          </span>
          <span v-else>{{ isTouch ? '点按对应轨道击打' : '也可以直接点击轨道' }}</span>
        </p>
        <button class="cta" @click="startGame">
          <span>开始演奏</span>
          <small>START</small>
        </button>
        <p class="tiny">
          点击后有 {{ (approachTime + PREP_TIME).toFixed(1) }}s
          倒计时准备{{ isTouch ? '' : ' · Esc 暂停' }}
        </p>
      </div>

      <div v-if="stage === 'playing' && paused" class="overlay">
        <p class="eyebrow">PAUSED</p>
        <h2>已暂停</h2>
        <p class="tiny">继续后会回退 1.5 秒并重新倒数，帮你找回节奏</p>
        <button class="cta" @click="resumeGame">
          <span>继续</span>
          <small>RESUME</small>
        </button>
        <button class="ghost" @click="quit">退出</button>
      </div>

      <div v-if="stage === 'result'" class="overlay result">
        <p class="eyebrow">RESULT</p>
        <div class="rank" :class="'rank-' + rank">{{ rank }}</div>
        <div class="final-score">{{ (stats?.score ?? 0).toLocaleString() }}</div>
        <div class="final-acc">{{ accuracy.toFixed(2) }}%</div>

        <div class="breakdown">
          <div><span class="j-perfect">PERFECT</span><b>{{ stats?.perfect ?? 0 }}</b></div>
          <div><span class="j-great">GREAT</span><b>{{ stats?.great ?? 0 }}</b></div>
          <div><span class="j-good">GOOD</span><b>{{ stats?.good ?? 0 }}</b></div>
          <div><span class="j-miss">MISS</span><b>{{ stats?.miss ?? 0 }}</b></div>
          <div><span>MAX COMBO</span><b>{{ stats?.maxCombo ?? 0 }}</b></div>
          <div v-if="beatmap.meta.holdNotes > 0">
            <span>HOLD BREAK</span><b>{{ stats?.holdBreaks ?? 0 }}</b>
          </div>
          <div>
            <span>平均误差</span>
            <b>{{ avgError >= 0 ? '+' : '' }}{{ avgError.toFixed(1) }}ms</b>
          </div>
        </div>

        <p v-if="(stats?.skipped ?? 0) > 0" class="calib-tip">
          有 {{ stats?.skipped }} 个音符因中途切后台被跳过，未计入达成率。
        </p>

        <p v-if="Math.abs(avgError) > 15" class="calib-tip">
          你习惯{{ avgError > 0 ? '偏晚' : '偏早' }}按键。可在校准里把偏移调整
          {{ avgError > 0 ? '+' : '' }}{{ avgError.toFixed(0) }}ms 试试。
        </p>

        <div class="result-actions">
          <button class="cta" @click="retry"><span>再来一次</span><small>RETRY</small></button>
          <button class="ghost" @click="quit">返回</button>
        </div>
      </div>
    </div>

    <!--
      底部键位胶囊：横向位置与 Canvas 轨道严格对齐。
      触屏设备不渲染——手机玩家按的是轨道本身，DFJK 键位提示毫无意义，
      还白占一排本可以给跑道的高度。
    -->
    <footer v-if="!isTouch" class="keypad-row">
      <div class="keypad-inner">
        <div
          v-for="i in beatmap.lanes"
          :key="i"
          class="keycap"
          :class="{ down: pressedLanes.has(i - 1) }"
          :style="keycapStyle(i - 1)"
        >
          {{ KEYS[i - 1]?.toUpperCase() }}
        </div>
      </div>
    </footer>

    <div class="corner corner-left">
      <span class="chip mult" :class="{ hot: multiplier >= 3 }">
        MULTIPLIER x{{ multiplier.toFixed(1) }}
      </span>
    </div>
    <div class="corner corner-right">
      <span class="chip mono">{{ timeCode }}</span>
    </div>
  </div>
</template>

<style scoped>
/*
 * 配色说明：跑道内外都是深紫黑，音符与边轨的霓虹色是唯一的高饱和来源。
 * 这样处理让"发光"真的成为视觉焦点，而不是满屏都在亮。
 */
.play-root {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: #e9e6f5;
  background:
    radial-gradient(120% 80% at 50% 0%, #1b1330 0%, #0d0a1a 45%, #07060f 100%);
  font-family: 'Rajdhani', system-ui, -apple-system, sans-serif;
}

/* ===== 背景光晕 ===== */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
}
.orb-a {
  width: 480px;
  height: 480px;
  left: -180px;
  bottom: -200px;
  background: rgba(94, 40, 160, 0.34);
}
.orb-b {
  width: 380px;
  height: 380px;
  right: -140px;
  top: -140px;
  background: rgba(200, 40, 110, 0.22);
}

/* ===== 顶部 HUD ===== */
.hud {
  position: relative;
  z-index: 3;
  display: grid;
  /* 三列等分让分数真正居中，而不是被左右内容挤偏 */
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 16px;
  padding: 18px 24px 6px;
}

.hud-left {
  justify-self: start;
  display: inline-flex;
  gap: 8px;
}

.exit-btn {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 15px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: #b9b2d4;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    border-color 0.2s cubic-bezier(0.25, 1, 0.5, 1),
    color 0.2s cubic-bezier(0.25, 1, 0.5, 1),
    background 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.exit-btn:hover {
  border-color: rgba(255, 46, 99, 0.6);
  background: rgba(255, 46, 99, 0.1);
  color: #fff;
}
.exit-btn .arrow {
  font-size: 15px;
  line-height: 1;
}

.score-block {
  text-align: center;
}
.score {
  /* tabular-nums 是必须的：分数每帧在变，非等宽会让整块文字左右抖 */
  font-variant-numeric: tabular-nums;
  font-size: clamp(28px, 4.4vw, 44px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.06em;
  color: #fff;
  text-shadow: 0 0 22px rgba(180, 150, 255, 0.42);
}
.score-sub {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 5px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: #8f86b8;
}
.live-rank {
  font-weight: 700;
  letter-spacing: 0.05em;
}

.song-block {
  justify-self: end;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: 260px;
}
.song-row {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}
.fs-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.04);
  color: #b9b2d4;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.2s cubic-bezier(0.25, 1, 0.5, 1),
    color 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.fs-btn:hover {
  border-color: rgba(0, 229, 255, 0.55);
  color: #fff;
}
.fs-btn.on {
  border-color: rgba(0, 229, 255, 0.55);
  background: rgba(0, 229, 255, 0.12);
  color: #6fe6ff;
}
.song-name {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.song-progress {
  width: 150px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.song-progress i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #ff2e63, #00e5ff);
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.55);
  transition: width 0.12s linear;
}
.song-meta {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #6f679a;
}

/* ===== 舞台 ===== */
.stage-wrap {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 380px;
}
.stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.touch-lanes {
  position: absolute;
  inset: 0;
}
.touch-lane {
  position: absolute;
  top: 0;
  bottom: 0;
  touch-action: none;
}

/* ===== 底部键位 ===== */
.keypad-row {
  position: relative;
  z-index: 3;
  height: 78px;
  flex: none;
}
.keypad-inner {
  position: absolute;
  inset: 0;
}
.keycap {
  position: absolute;
  top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  /*
   * 固定 44px 方形并在轨道内居中，而不是按轨道宽度缩放。
   * 轨道加宽到 152px 后按比例缩放会得到一块 100px 宽的板子，
   * 看起来像进度条而不是键；设计稿里是四个小方键。
   */
  width: 44px;
  height: 44px;
  margin-left: -22px;
  border: 1.5px solid color-mix(in oklch, var(--lane-color) 55%, transparent);
  border-radius: 12px;
  background: color-mix(in oklch, var(--lane-color) 9%, transparent);
  color: color-mix(in oklch, var(--lane-color) 85%, white);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.05em;
  /* 只动 transform / box-shadow / opacity，不碰布局属性 */
  transition:
    box-shadow 0.12s cubic-bezier(0.25, 1, 0.5, 1),
    background 0.12s cubic-bezier(0.25, 1, 0.5, 1),
    border-color 0.12s cubic-bezier(0.25, 1, 0.5, 1);
}
.keycap.down {
  border-color: var(--lane-color);
  background: color-mix(in oklch, var(--lane-color) 34%, transparent);
  color: #fff;
  box-shadow:
    0 0 18px color-mix(in oklch, var(--lane-color) 70%, transparent),
    inset 0 0 14px color-mix(in oklch, var(--lane-color) 40%, transparent);
}

/* ===== 角落信息 ===== */
.corner {
  position: absolute;
  bottom: 18px;
  z-index: 4;
}
.corner-left {
  left: 24px;
}
.corner-right {
  right: 24px;
}
.chip {
  display: inline-block;
  padding: 6px 14px;
  border: 1px solid rgba(61, 218, 215, 0.32);
  border-radius: 999px;
  background: rgba(61, 218, 215, 0.07);
  color: #7fd8d6;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
}
.chip.mono {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #9a92bd;
  font-variant-numeric: tabular-nums;
}
.chip.mult {
  font-variant-numeric: tabular-nums;
  /* 只过渡颜色相关属性，倍率跳档时不该有位移 */
  transition:
    border-color 0.3s cubic-bezier(0.25, 1, 0.5, 1),
    color 0.3s cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}
/* x3 起换成洋红并发光：这是"连击已经很值钱"的奖励信号 */
.chip.mult.hot {
  border-color: rgba(255, 46, 99, 0.6);
  background: rgba(255, 46, 99, 0.1);
  color: #ff7d9c;
  box-shadow: 0 0 18px rgba(255, 46, 99, 0.28);
}

/* ===== 覆盖层 ===== */
.overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: rgba(9, 7, 18, 0.9);
  backdrop-filter: blur(6px);
  /* 入场动画只用 opacity + transform，避免触发重排 */
  animation: overlay-in 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}
@keyframes overlay-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.42em;
  color: #ff2e63;
  text-shadow: 0 0 16px rgba(255, 46, 99, 0.6);
}
.overlay h2 {
  margin: 0;
  font-size: clamp(22px, 3.4vw, 32px);
  font-weight: 700;
  letter-spacing: 0.01em;
  text-align: center;
}

.ready-stats {
  display: flex;
  gap: 28px;
  margin: 4px 0 2px;
}
.ready-stats div {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.ready-stats b {
  font-size: 19px;
  font-weight: 700;
  color: #00e5ff;
  font-variant-numeric: tabular-nums;
}
.ready-stats span {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: #6f679a;
}

.keys-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 2px 0 0;
  color: #8f86b8;
  font-size: 12.5px;
}
kbd {
  display: inline-block;
  min-width: 26px;
  padding: 4px 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #d6d0ea;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
.tiny {
  margin: 0;
  color: #6f679a;
  font-size: 11.5px;
  letter-spacing: 0.04em;
}

/* 主行动按钮：设计稿里是洋红→紫的渐变胶囊 */
.cta {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 6px;
  padding: 13px 34px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(96deg, #ff2e63 0%, #a934d0 55%, #6d3bf5 100%);
  color: #fff;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 8px 30px rgba(169, 52, 208, 0.4);
  transition:
    transform 0.22s cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 0.22s cubic-bezier(0.25, 1, 0.5, 1);
}
.cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 38px rgba(169, 52, 208, 0.55);
}
.cta:active {
  transform: translateY(0);
}
.cta small {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  opacity: 0.72;
}
.ghost {
  padding: 9px 22px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: transparent;
  color: #9a92bd;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.2s cubic-bezier(0.25, 1, 0.5, 1),
    color 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.ghost:hover {
  border-color: rgba(255, 255, 255, 0.34);
  color: #fff;
}

/* ===== 结算 ===== */
.result {
  gap: 7px;
}
.rank {
  font-size: clamp(62px, 9vw, 88px);
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: 0.04em;
}
.rank-SSS,
.rank-SS {
  color: #ffd166;
  text-shadow: 0 0 40px rgba(255, 209, 102, 0.55);
}
.rank-S {
  color: #3ddad7;
  text-shadow: 0 0 40px rgba(61, 218, 215, 0.5);
}
.rank-A {
  color: #5fb8ff;
  text-shadow: 0 0 34px rgba(95, 184, 255, 0.45);
}
.rank-B,
.rank-C {
  color: #9a92bd;
}
.rank-D {
  color: #ff2e63;
  text-shadow: 0 0 30px rgba(255, 46, 99, 0.4);
}
.final-score {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.final-acc {
  margin-bottom: 6px;
  color: #8f86b8;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.1em;
}
.breakdown {
  display: grid;
  grid-template-columns: repeat(2, minmax(140px, 1fr));
  gap: 2px 26px;
  margin: 4px 0 8px;
  font-size: 12.5px;
}
.breakdown div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.breakdown span {
  color: #7c749f;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.breakdown b {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.j-perfect {
  color: #ffd166 !important;
}
.j-great {
  color: #3ddad7 !important;
}
.j-good {
  color: #5fb8ff !important;
}
.j-miss {
  color: #ff2e63 !important;
}
.calib-tip {
  max-width: 380px;
  margin: 0;
  padding: 8px 14px;
  border-left: 2px solid #ffb04d;
  border-radius: 0 6px 6px 0;
  background: rgba(255, 176, 77, 0.09);
  color: #ffc477;
  font-size: 12px;
  line-height: 1.5;
}
.result-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

/* ===== 窄屏 ===== */
@media (max-width: 640px) {
  .hud {
    grid-template-columns: auto 1fr;
    row-gap: 10px;
    padding: 12px 14px 4px;
  }
  /* 曲名换到第二行通栏，否则三列在窄屏挤成一团 */
  .song-block {
    grid-column: 1 / -1;
    align-items: flex-start;
    max-width: none;
  }
  .song-progress {
    width: 100%;
  }
  .score {
    text-align: left;
  }
  .score-block {
    text-align: left;
  }
  .score-sub {
    justify-content: flex-start;
  }
  .corner {
    bottom: 10px;
  }
  .corner-left {
    left: 12px;
  }
  .corner-right {
    right: 12px;
  }
  .ready-stats {
    gap: 18px;
  }
  .breakdown {
    grid-template-columns: 1fr;
  }
}

/*
 * ===== 横屏（矮视口） =====
 *
 * 移动端横屏的问题不是宽度而是**高度**：约 375px 高里 HUD + 键位排
 * 就吃掉 170px，跑道只剩一半。这里按高度而非宽度出压缩布局：
 * HUD 压成一行、键位排减半、角落信息隐藏，把高度尽量还给跑道。
 */
@media (max-height: 480px) {
  .hud {
    grid-template-columns: auto 1fr auto;
    align-items: center;
    padding: 8px 14px 2px;
  }
  .score {
    font-size: 24px;
  }
  .score-sub {
    display: none; /* ACC 与评级实时看意义不大，结算页有 */
  }
  .song-progress {
    width: 110px;
  }
  .song-meta {
    display: none;
  }
  .keypad-row {
    height: 46px;
  }
  .keycap {
    top: 4px;
    width: 36px;
    height: 36px;
    margin-left: -18px;
    font-size: 13px;
  }
  .corner {
    display: none; /* 倍率/时间码给跑道让路 */
  }
  .stage-wrap {
    min-height: 0; /* 380px 的保底在矮视口会把布局撑爆 */
  }
  .overlay {
    gap: 8px;
  }
  .ready-stats {
    margin: 0;
  }
  .rank {
    font-size: 46px;
  }
  .breakdown {
    grid-template-columns: repeat(3, minmax(120px, 1fr));
    font-size: 11.5px;
  }
}

/* 尊重减少动效偏好 —— 这不是可选项 */
@media (prefers-reduced-motion: reduce) {
  .overlay {
    animation: none;
  }
  .cta:hover {
    transform: none;
  }
}
</style>
