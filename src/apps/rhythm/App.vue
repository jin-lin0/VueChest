<script setup lang="ts">
// 音游主界面：选曲/分析 → 校验节拍 → 生成谱面 → 游玩。
// 分析与校验区保留下来是有意的：自动谱面质量依赖 BPM/offset 正确，
// 出问题时需要能当场听出来并手动纠正。
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { analyze, gridAlignment, type AnalyzeResult } from './core/analyze'
import { AudioClock } from './core/clock'
import { Metronome } from './core/metronome'
import { OnsetClicker } from './core/onset-clicker'
import { generateBeatmap, beatmapDensity, difficultyLabel, type Beatmap } from './core/beatmap'
import { loadSettings, saveSettings, clearSettings, DEFAULT_SETTINGS } from './core/settings'
import PlayView from './components/PlayView.vue'
import { musicApi } from '@/lib/musicApi'

const router = useRouter()

type Stage = 'idle' | 'fetching' | 'decoding' | 'analyzing' | 'ready' | 'error'

const stage = ref<Stage>('idle')
const errorMsg = ref('')
const logs = ref<string[]>([])
const result = ref<AnalyzeResult | null>(null)
const sourceLabel = ref('')

/** 各阶段耗时，用于判断性能是否可接受 */
const timings = ref<Record<string, number>>({})

const keyword = ref('')
const searching = ref(false)
const searchResults = ref<{ id: string; name: string; artist: string }[]>([])

let ctx: AudioContext | null = null
let clock: AudioClock | null = null
let metronome: Metronome | null = null
let onsetClicker: OnsetClicker | null = null
let rafId = 0

const playTime = ref(0)
const beatPulse = ref(0)
const latencyInfo = ref('')

/** 节拍器（固定 BPM 网格）开关 */
const clickEnabled = ref(true)
/** onset 试听（真实起音点，间隔随音乐变化）开关 */
const onsetClickEnabled = ref(false)
/** 用户手动倍频调整：1 = 检测值，0.5 = 半速，2 = 倍速 */
const bpmScale = ref(1)
/** 当前小节内第几拍，用于视觉重音 */
const beatIndex = ref(0)

/** 实际使用的 BPM（检测值 × 用户倍频） */
const effectiveBpm = computed(() => (result.value ? result.value.bpm * bpmScale.value : 0))

/** onset 落在当前 BPM 网格上的比例（±40ms），衡量落点质量 */
const gridAlignRate = computed(() =>
  result.value ? gridAlignment(result.value.onsets, effectiveBpm.value, result.value.offset) : 0,
)

/** onset 间隔统计，用于直观说明「不是固定间隔」 */
const gapStats = computed(() => {
  const onsets = result.value?.onsets
  if (!onsets || onsets.length < 3) return null
  const gaps: number[] = []
  for (let i = 1; i < onsets.length; i++) gaps.push(onsets[i] - onsets[i - 1])
  const sorted = [...gaps].sort((a, b) => a - b)
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const std = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length)
  return {
    min: Math.round(sorted[0] * 1000),
    median: Math.round(sorted[Math.floor(sorted.length / 2)] * 1000),
    max: Math.round(sorted[sorted.length - 1] * 1000),
    std: Math.round(std * 1000),
  }
})

function log(msg: string) {
  logs.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
}

// ===== 游戏 =====

/** 解码后的音频，游玩时复用，避免重复下载解码 */
const decodedBuffer = ref<AudioBuffer | null>(null)
const songTitle = ref('')
const beatmap = ref<Beatmap | null>(null)
const playing = ref(false)

/**
 * 谱面与手感参数。
 *
 * 初值全部来自 localStorage 存档（缺失/损坏时回落到 DEFAULT_SETTINGS），
 * 改动后会自动写回——延迟校准这类设备特有值刷新就丢的话，
 * 玩家每次都得重新校准，设置项等于白做。
 * 默认值定义在 core/settings.ts，那里是唯一真相。
 */
const saved = loadSettings()

const quantizeDivision = ref(saved.quantizeDivision)
/** 音符从出现到判定线的时间（秒）。越小下落越快 */
const noteSpeed = ref(saved.noteSpeed)
/** 目标密度（音符/秒）——直接控制难度，比调绝对阈值直观 */
const targetDensity = ref(saved.targetDensity)
/** 双押比例：强度最高的这个比例出同时两键 */
const chordRatio = ref(saved.chordRatio)
/** 律动骨架偏置：整拍强度倍率 */
const beatBias = ref(saved.beatBias)
/** 是否生成长按条 */
const holdEnabled = ref(saved.holdEnabled)
/** 长按的 RMS 门槛（分位数） */
const holdRmsPercentile = ref(saved.holdRmsPercentile)
/** 玩家延迟校准（毫秒） */
const userOffset = ref(saved.userOffset)

const beatmapInfo = computed(() => {
  if (!beatmap.value) return null
  const d = beatmapDensity(beatmap.value)
  const m = beatmap.value.meta
  return {
    notes: beatmap.value.notes.length,
    density: d.toFixed(2),
    difficulty: difficultyLabel(d),
    gridPoints: m.gridPoints,
    activePoints: m.activePoints,
    chordPoints: m.chordPoints,
    holdNotes: m.holdNotes,
    holdTotalSec: m.holdTotalSec.toFixed(1),
    beatFill: (m.beatFillRate * 100).toFixed(0),
    maxGap: m.maxGap.toFixed(1),
  }
})

function buildBeatmap() {
  if (!result.value || !decodedBuffer.value) return
  const res = result.value
  beatmap.value = generateBeatmap(
    {
      songId: songTitle.value,
      title: songTitle.value,
      bpm: effectiveBpm.value,
      offset: res.offset,
      duration: res.duration,
      odf: res.odf,
      frameDuration: res.odfFrameDuration,
    },
    {
      lanes: 4,
      quantizeDivision: quantizeDivision.value,
      targetDensity: targetDensity.value,
      chordRatio: chordRatio.value,
      beatBias: beatBias.value,
      // 长按需要 RMS 才能区分延音与静音；holdEnabled=false 时不传，
      // generateBeatmap 会自动退化为纯单击谱面
      rms: holdEnabled.value ? res.rms : undefined,
      rmsFrameDuration: res.odfFrameDuration,
      holdRmsPercentile: holdRmsPercentile.value,
    },
  )
  const info = beatmapInfo.value
  log(
    `谱面生成：${info?.notes} notes（${info?.difficulty} ${info?.density}/s），` +
      `网格 1/${quantizeDivision.value * 4} 共 ${info?.gridPoints} 点，` +
      `激活 ${info?.activePoints}，双押 ${info?.chordPoints}，长按 ${info?.holdNotes}，` +
      `整拍填充 ${info?.beatFill}%，最长空档 ${info?.maxGap}s`,
  )
}

function startPlay() {
  stopPlayback()
  buildBeatmap()
  if (beatmap.value?.notes.length) playing.value = true
  else log('❌ 谱面为空，无法开始')
}

function exitPlay() {
  playing.value = false
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** 统一的分析流程：拿到 ArrayBuffer 之后的部分完全一致 */
async function runAnalyze(getBuffer: () => Promise<ArrayBuffer>, label: string) {
  stopPlayback()
  result.value = null
  errorMsg.value = ''
  logs.value = []
  timings.value = {}
  sourceLabel.value = label

  try {
    stage.value = 'fetching'
    log(`开始获取音频：${label}`)
    let t = performance.now()
    const arrayBuffer = await getBuffer()
    timings.value.fetch = Math.round(performance.now() - t)
    log(`获取完成，${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB，耗时 ${timings.value.fetch}ms`)

    stage.value = 'decoding'
    t = performance.now()
    const audioBuffer = await getCtx().decodeAudioData(arrayBuffer)
    timings.value.decode = Math.round(performance.now() - t)
    log(
      `解码完成：${audioBuffer.duration.toFixed(1)}s / ${audioBuffer.sampleRate}Hz / ` +
        `${audioBuffer.numberOfChannels}ch，耗时 ${timings.value.decode}ms`,
    )

    stage.value = 'analyzing'
    t = performance.now()
    const res = await analyze(audioBuffer)
    timings.value.analyze = Math.round(performance.now() - t)
    log(`分析完成：BPM ${res.bpm}（原始检测 ${res.rawBpm}），首拍 ${res.offset.toFixed(3)}s，onset ${res.onsets.length} 个，耗时 ${timings.value.analyze}ms`)

    result.value = res
    bpmScale.value = 1
    decodedBuffer.value = audioBuffer
    songTitle.value = label
    clock = new AudioClock(getCtx(), audioBuffer)
    latencyInfo.value =
      `baseLatency ${((getCtx().baseLatency || 0) * 1000).toFixed(1)}ms / ` +
      `outputLatency ${((getCtx().outputLatency || 0) * 1000).toFixed(1)}ms`
    log(`输出延迟：${latencyInfo.value}`)
    stage.value = 'ready'
  } catch (e) {
    stage.value = 'error'
    errorMsg.value = e instanceof Error ? e.message : String(e)
    log(`❌ 失败：${errorMsg.value}`)
  }
}

function onPickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  runAnalyze(() => file.arrayBuffer(), `本地文件 ${file.name}`)
}

async function doSearch() {
  searching.value = true
  searchResults.value = []
  try {
    const raw = (await musicApi.search(keyword.value, 10)) as {
      result?: { songs?: { id: number; name: string; ar?: { name: string }[] }[] }
    }
    searchResults.value = (raw.result?.songs ?? []).map((s) => ({
      id: String(s.id),
      name: s.name,
      artist: (s.ar ?? []).map((a) => a.name).join(' / '),
    }))
    if (!searchResults.value.length) log('搜索无结果（后端 /api/netease 是否可用？）')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
    log(`❌ 搜索失败：${errorMsg.value}`)
  } finally {
    searching.value = false
  }
}

function pickSong(song: { id: string; name: string; artist: string }) {
  const url = musicApi.songUrlPath('netease', song.id)
  runAnalyze(async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`音频请求失败 ${res.status}`)
    return res.arrayBuffer()
  }, `${song.name} - ${song.artist}`)
}

/**
 * 节拍可视化：用音频时钟驱动。
 *
 * 视觉刻意做成「拍点瞬间满值 + 之后快速衰减」，而不是拍点之间平滑插值——
 * 后者看起来像匀速呼吸，人眼无法判断它到底对齐在哪一刻，
 * 也就失去了校验意义。
 */
function tick() {
  if (!clock || !result.value) return
  playTime.value = clock.currentTime

  const bpm = effectiveBpm.value
  if (bpm > 0) {
    const beatDur = 60 / bpm
    const sinceFirstBeat = playTime.value - result.value.offset
    if (sinceFirstBeat < 0) {
      beatPulse.value = 0
    } else {
      const n = Math.floor(sinceFirstBeat / beatDur)
      beatIndex.value = n % 4
      // 距离刚过去的那个拍点多久
      const sincePeak = sinceFirstBeat - n * beatDur
      // 120ms 内衰减到 0，形成明确的"闪"
      const decay = 0.12
      beatPulse.value = sincePeak < decay ? 1 - sincePeak / decay : 0
    }
  }

  rafId = requestAnimationFrame(tick)
}

function play() {
  if (!clock || !result.value) return
  const audioCtx = getCtx()
  audioCtx.resume()
  clock.start(0)

  // 两个打点器共享同一时间基准，并补偿相同的输出延迟，
  // 因此可以同时开启做对比：哪一路踩在音乐上一听便知。
  if (clickEnabled.value) {
    metronome?.dispose()
    metronome = new Metronome(audioCtx)
    metronome.start(effectiveBpm.value, result.value.offset, 0, clock.outputLatency)
  }
  if (onsetClickEnabled.value) {
    onsetClicker?.dispose()
    onsetClicker = new OnsetClicker(audioCtx)
    onsetClicker.start(result.value.onsets, 0, clock.outputLatency)
  }

  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(tick)
}

function stopPlayback() {
  cancelAnimationFrame(rafId)
  rafId = 0
  clock?.stop()
  metronome?.stop()
  onsetClicker?.stop()
  playTime.value = 0
  beatPulse.value = 0
}

/** 切换倍频后需要重新调度节拍器，否则仍按旧 BPM 打点 */
function setBpmScale(scale: number) {
  bpmScale.value = scale
  if (clock?.isPlaying && result.value && metronome) {
    metronome.start(effectiveBpm.value, result.value.offset, clock.currentTime, clock.outputLatency)
  }
}

function toggleClick() {
  clickEnabled.value = !clickEnabled.value
  if (!clock?.isPlaying || !result.value) return
  if (clickEnabled.value) {
    metronome ??= new Metronome(getCtx())
    metronome.start(effectiveBpm.value, result.value.offset, clock.currentTime, clock.outputLatency)
  } else {
    metronome?.stop()
  }
}

function toggleOnsetClick() {
  onsetClickEnabled.value = !onsetClickEnabled.value
  if (!clock?.isPlaying || !result.value) return
  if (onsetClickEnabled.value) {
    onsetClicker ??= new OnsetClicker(getCtx())
    onsetClicker.start(result.value.onsets, clock.currentTime, clock.outputLatency)
  } else {
    onsetClicker?.stop()
  }
}

/** 时间轴上前 40 秒的 onset 分布，肉眼检查是否落在鼓点上 */
const onsetMarkers = computed(() => {
  if (!result.value) return []
  const span = Math.min(40, result.value.duration)
  return result.value.onsets.filter((t) => t <= span).map((t) => ({ t, left: (t / span) * 100 }))
})

const visibleSpan = computed(() => Math.min(40, result.value?.duration ?? 40))

const stageText = computed(
  () =>
    ({
      idle: '等待选择音源',
      fetching: '获取音频中…',
      decoding: '解码中…',
      analyzing: '分析节拍中…',
      ready: '分析完成',
      error: '出错',
    })[stage.value],
)

/** 分析是否正在进行中，用于禁用按钮与显示进度 */
const busy = computed(() =>
  ['fetching', 'decoding', 'analyzing'].includes(stage.value),
)

/**
 * 难度预设。
 *
 * 为什么加这层：底下那堆滑块（密度/双押/律动/长按门槛）是调参用的，
 * 让每个玩家都去理解「p25 分位数」不现实。预设把它们打包成
 * 一个可以直接点的选择，同时保留高级面板给想细调的人。
 *
 * 各档的密度参考商业音游：Easy 约 1.5/s、Normal 2.5/s、
 * Hard 4/s、Master 5.5/s。双押与长按随难度递增。
 */
const DIFFICULTY_PRESETS = [
  { key: 'easy', label: 'EASY', density: 1.5, chord: 0.05, hold: 0.2, division: 1 },
  { key: 'normal', label: 'NORMAL', density: 2.5, chord: 0.15, hold: 0.25, division: 2 },
  { key: 'hard', label: 'HARD', density: 4.0, chord: 0.25, hold: 0.3, division: 2 },
  { key: 'master', label: 'MASTER', density: 5.5, chord: 0.35, hold: 0.35, division: 4 },
] as const

const activePreset = ref<string>(saved.preset)

/**
 * 参数变化即自动存档。
 *
 * 不做「保存」按钮：这些是滑块调出来的手感值，玩家的心智模型是
 * "调完就生效"，多一步保存只会让人以为没生效。
 * 不加防抖：写入是同步的但量极小（一个百来字节的 JSON），
 * 拖滑块最多触发几十次，比一次重排都便宜。
 */
watch(
  [
    noteSpeed,
    userOffset,
    activePreset,
    targetDensity,
    chordRatio,
    beatBias,
    holdEnabled,
    holdRmsPercentile,
    quantizeDivision,
  ],
  () => {
    saveSettings({
      noteSpeed: noteSpeed.value,
      userOffset: userOffset.value,
      preset: activePreset.value,
      targetDensity: targetDensity.value,
      chordRatio: chordRatio.value,
      beatBias: beatBias.value,
      holdEnabled: holdEnabled.value,
      holdRmsPercentile: holdRmsPercentile.value,
      quantizeDivision: quantizeDivision.value,
    })
  },
)

/** 恢复出厂设置：调坏了总得有条退路 */
function resetSettings() {
  clearSettings()
  const d = DEFAULT_SETTINGS
  noteSpeed.value = d.noteSpeed
  userOffset.value = d.userOffset
  activePreset.value = d.preset
  targetDensity.value = d.targetDensity
  chordRatio.value = d.chordRatio
  beatBias.value = d.beatBias
  holdEnabled.value = d.holdEnabled
  holdRmsPercentile.value = d.holdRmsPercentile
  quantizeDivision.value = d.quantizeDivision
}

function applyPreset(p: (typeof DIFFICULTY_PRESETS)[number]) {
  activePreset.value = p.key
  targetDensity.value = p.density
  chordRatio.value = p.chord
  holdRmsPercentile.value = p.hold
  quantizeDivision.value = p.division
}

/** 手动改任一参数就脱离预设——否则高亮会误导 */
function markCustom() {
  activePreset.value = 'custom'
}

/** 高级参数面板的展开状态 */
const showAdvanced = ref(false)

onUnmounted(() => {
  stopPlayback()
  metronome?.dispose()
  onsetClicker?.dispose()
  ctx?.close()
})
</script>

<template>
  <!-- 游玩时独占全屏，避免页面滚动干扰操作 -->
  <PlayView
    v-if="playing && decodedBuffer && beatmap"
    :audio-ctx="getCtx()"
    :audio-buffer="decodedBuffer"
    :beatmap="beatmap"
    :user-offset="userOffset"
    :approach-time="noteSpeed"
    class="fullscreen-play"
    @exit="exitPlay"
  />

  <div v-else class="lab">
    <button class="game-center-back" type="button" @click="router.push('/games')">
      ← 返回游戏中心
    </button>
    <!-- 背景层：柔光球 + 细网格，给纯色背景一点空间纵深 -->
    <div class="bg-grid" />
    <div class="bg-orb orb-a" />
    <div class="bg-orb orb-b" />

    <div class="lab-inner">
      <!-- ===== 左栏：品牌 + 入口 ===== -->
      <aside class="hero">
        <h1 class="wordmark">
          <span>RHYTHM</span>
          <span>LAB</span>
        </h1>
        <p class="wordmark-cn">音 律 研 究 所</p>
        <p class="tagline">
          自动分析音乐的节拍与起音强度，生成落在拍上的谱面。<br />
          选一首歌，或上传本地音频。
        </p>

        <div class="entries">
          <button class="entry primary" :disabled="!result || !decodedBuffer" @click="startPlay">
            <span class="entry-icon">▶</span>
            <span class="entry-text">
              <b>开始演奏</b>
              <small>{{ result ? 'GENERATE & PLAY' : '先选一首歌' }}</small>
            </span>
            <span v-if="beatmapInfo" class="entry-badge">{{ beatmapInfo.difficulty }}</span>
          </button>

          <label class="entry">
            <span class="entry-icon">↑</span>
            <span class="entry-text">
              <b>上传本地音频</b>
              <small>LOCAL FILE · 不依赖第三方服务</small>
            </span>
            <input type="file" accept="audio/*" @change="onPickFile" />
          </label>
        </div>

        <button class="adv-toggle" @click="showAdvanced = !showAdvanced">
          <span class="gear">⚙</span>
          {{ showAdvanced ? '收起调试面板' : '节拍校验与参数调试' }}
        </button>
      </aside>

      <!-- ===== 右栏：选曲卡 ===== -->
      <section class="deck">
        <header class="deck-head">
          <h2><span class="star">◆</span> 智能搜歌制谱</h2>
          <span class="tag">AUTO GEN</span>
        </header>

        <div class="search-row">
          <input
            v-model="keyword"
            class="search-input"
            placeholder="输入歌名 / 歌手搜索…"
            @keyup.enter="doSearch"
          />
          <button class="search-btn" :disabled="searching" @click="doSearch">
            {{ searching ? '···' : '搜索' }}
          </button>
        </div>

        <p v-if="errorMsg" class="err">{{ errorMsg }}</p>

        <template v-if="searchResults.length">
          <p class="deck-label">搜索结果 / SEARCH RESULTS</p>
          <ul class="songs">
            <li
              v-for="(s, i) in searchResults"
              :key="s.id"
              :class="{ active: sourceLabel === `${s.name} - ${s.artist}` }"
              @click="pickSong(s)"
            >
              <span class="dot" />
              <span class="idx">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="s-name">{{ s.name }}</span>
              <span class="s-artist">{{ s.artist }}</span>
            </li>
          </ul>
        </template>

        <!-- 分析进度：让等待可见，而不是一片空白 -->
        <div v-if="busy" class="analyzing">
          <span class="pulse" />
          <span>{{ stageText }}</span>
        </div>

        <!-- 已选中的曲子：BPM / 时长 / 难度选择 -->
        <div v-if="result" class="chosen">
          <div class="chosen-top">
            <div class="chosen-name">
              <span class="deck-label">已选择</span>
              <b>{{ sourceLabel }}</b>
            </div>
            <span class="bpm-pill">BPM {{ effectiveBpm.toFixed(0) }}</span>
          </div>

          <div class="chosen-facts">
            <span>{{ result.duration.toFixed(0) }}s</span>
            <span>{{ result.onsets.length }} onsets</span>
            <span :class="{ warn: gridAlignRate < 50 }">对齐 {{ gridAlignRate.toFixed(0) }}%</span>
          </div>

          <p class="deck-label">难度 / DIFFICULTY</p>
          <div class="diffs">
            <button
              v-for="p in DIFFICULTY_PRESETS"
              :key="p.key"
              class="diff"
              :class="[p.key, { on: activePreset === p.key }]"
              @click="applyPreset(p)"
            >
              <b>{{ p.label }}</b>
              <small>{{ p.density.toFixed(1) }}/s</small>
            </button>
          </div>

          <button class="go" :disabled="!decodedBuffer" @click="startPlay">
            <span class="go-icon">▼</span>
            一键制谱并开始 / INSTANT GEN &amp; PLAY
          </button>

          <p v-if="beatmapInfo" class="gen-info">
            上次生成 {{ beatmapInfo.notes }} notes · 双押 {{ beatmapInfo.chordPoints }} · 长按
            {{ beatmapInfo.holdNotes }} · 整拍填充 {{ beatmapInfo.beatFill }}%
          </p>
        </div>

        <p v-else-if="!busy && !searchResults.length" class="empty">
          搜索一首歌开始，或从左侧上传本地音频。<br />
          <span class="dim">分析会算出 BPM、首拍偏移与起音强度曲线。</span>
        </p>
      </section>
    </div>

    <!-- ===== 高级调试面板（默认收起） ===== -->
    <div v-if="showAdvanced" class="advanced">
      <section class="panel">
        <h3>节拍校验</h3>
        <p class="hint">
          <b class="c-beat">哒（低音正弦）</b>= 固定 BPM 网格，是校准用的「尺子」；
          <b class="c-onset">嗒（高音三角）</b>= 检测出的真实起音点，间隔随音乐变化。
          两者可同时开启对比。
        </p>

        <div class="controls">
          <button :class="{ on: clickEnabled }" @click="toggleClick">
            节拍音 {{ clickEnabled ? '开' : '关' }}
          </button>
          <button :class="{ on: onsetClickEnabled }" @click="toggleOnsetClick">
            起音点 {{ onsetClickEnabled ? '开' : '关' }}
          </button>
          <span class="divider" />
          <span class="ctl-label">速度</span>
          <button :class="{ on: bpmScale === 0.5 }" @click="setBpmScale(0.5)">½×</button>
          <button :class="{ on: bpmScale === 1 }" @click="setBpmScale(1)">检测值</button>
          <button :class="{ on: bpmScale === 2 }" @click="setBpmScale(2)">2×</button>
          <span class="eff-bpm">{{ effectiveBpm.toFixed(1) }} BPM</span>
        </div>

        <div v-if="gapStats" class="stat-note">
          起音间隔 {{ gapStats.min }}–{{ gapStats.max }}ms（中位 {{ gapStats.median }}ms，标准差
          <b>{{ gapStats.std }}ms</b>）·
          落在 BPM 网格 ±40ms：<b :class="{ warn: gridAlignRate < 50 }">
            {{ gridAlignRate.toFixed(1) }}%
          </b>
          <span class="sub-note">偏低说明掺了换气/杂音等非节拍起音</span>
        </div>

        <div class="beat-stage">
          <div
            class="beat-circle"
            :class="{ accent: beatIndex === 0 }"
            :style="{
              transform: `scale(${0.85 + beatPulse * 0.45})`,
              opacity: 0.25 + beatPulse * 0.75,
            }"
          />
        </div>
        <p class="clock">播放位置 {{ playTime.toFixed(2) }}s · 第 {{ beatIndex + 1 }} 拍</p>
        <p class="latency">时间基准 audioContext.currentTime，已扣除 {{ latencyInfo }}</p>
        <div class="actions">
          <button :disabled="!clock" @click="play">播放</button>
          <button :disabled="!clock" @click="stopPlayback">停止</button>
        </div>

        <div v-if="result" class="timeline-wrap">
          <p class="tl-label">前 {{ visibleSpan.toFixed(0) }}s 起音点分布</p>
          <div class="timeline">
            <i v-for="(m, i) in onsetMarkers" :key="i" class="onset" :style="{ left: m.left + '%' }" />
            <div
              v-if="playTime > 0"
              class="playhead"
              :style="{ left: Math.min(100, (playTime / visibleSpan) * 100) + '%' }"
            />
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>谱面参数</h3>

        <div class="controls">
          <span class="ctl-label">网格</span>
          <button :class="{ on: quantizeDivision === 1 }" @click="quantizeDivision = 1; markCustom()">
            1/4
          </button>
          <button :class="{ on: quantizeDivision === 2 }" @click="quantizeDivision = 2; markCustom()">
            1/8
          </button>
          <button :class="{ on: quantizeDivision === 4 }" @click="quantizeDivision = 4; markCustom()">
            1/16
          </button>
        </div>

        <div class="controls">
          <span class="ctl-label">难度密度</span>
          <input
            v-model.number="targetDensity"
            type="range"
            min="0.8"
            max="6"
            step="0.1"
            @input="markCustom"
          />
          <span class="range-val">{{ targetDensity.toFixed(1) }}/s</span>
          <span class="divider" />
          <span class="ctl-label">双押比例</span>
          <input
            v-model.number="chordRatio"
            type="range"
            min="0"
            max="0.4"
            step="0.01"
            @input="markCustom"
          />
          <span class="range-val">{{ (chordRatio * 100).toFixed(0) }}%</span>
        </div>

        <div class="controls">
          <span class="ctl-label">律动强度</span>
          <input v-model.number="beatBias" type="range" min="1" max="4" step="0.1" />
          <span class="range-val">×{{ beatBias.toFixed(1) }}</span>
        </div>
        <p class="hint sub-note">
          越大越偏向把音符放在整拍上，节奏骨架更稳但切分感变弱；1 = 纯按音乐强度。
        </p>

        <div class="controls">
          <span class="ctl-label">长按条</span>
          <button :class="{ on: holdEnabled }" @click="holdEnabled = true">开</button>
          <button :class="{ on: !holdEnabled }" @click="holdEnabled = false">关</button>
          <span class="divider" />
          <span class="ctl-label">长按门槛</span>
          <input
            v-model.number="holdRmsPercentile"
            :disabled="!holdEnabled"
            type="range"
            min="0.1"
            max="0.6"
            step="0.05"
            @input="markCustom"
          />
          <span class="range-val">p{{ (holdRmsPercentile * 100).toFixed(0) }}</span>
        </div>
        <p class="hint sub-note">
          长按放在「有延音但没有新起音」的位置（RMS 高 + 起音低）。p25 约占音符 7%，p50 只剩 3%。
        </p>

        <div class="controls">
          <span class="ctl-label">下落速度</span>
          <input v-model.number="noteSpeed" type="range" min="0.4" max="2.2" step="0.05" />
          <span class="range-val">{{ noteSpeed.toFixed(2) }}s</span>
          <span class="divider" />
          <span class="ctl-label">延迟校准</span>
          <input v-model.number="userOffset" type="range" min="-150" max="150" step="5" />
          <span class="range-val">{{ userOffset > 0 ? '+' : '' }}{{ userOffset }}ms</span>
          <span class="divider" />
          <button @click="resetSettings">恢复默认</button>
        </div>
        <p class="hint sub-note">
          校准：打完一局后看结算的「平均误差」，按提示调这个值。正值把判定往后推。<br />
          以上参数都会存在本机，下次打开自动沿用。
        </p>

        <div v-if="result" class="metrics">
          <div class="metric"><span class="k">BPM</span><b>{{ result.bpm || '失败' }}</b></div>
          <div class="metric">
            <span class="k">原始检测</span>
            <b :class="{ corrected: result.rawBpm !== result.bpm }">{{ result.rawBpm }}</b>
          </div>
          <div class="metric">
            <span class="k">首拍偏移</span>
            <b :class="{ corrected: Math.abs(result.rawOffset - result.offset) > 0.005 }">
              {{ result.offset.toFixed(3) }}s
            </b>
          </div>
          <div class="metric"><span class="k">原始偏移</span><b>{{ result.rawOffset.toFixed(3) }}s</b></div>
          <div class="metric"><span class="k">获取</span><b>{{ timings.fetch }}ms</b></div>
          <div class="metric"><span class="k">解码</span><b>{{ timings.decode }}ms</b></div>
          <div class="metric"><span class="k">分析</span><b>{{ timings.analyze }}ms</b></div>
        </div>
      </section>

      <section v-if="logs.length" class="panel">
        <h3>日志</h3>
        <pre class="logs">{{ logs.join('\n') }}</pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
/*
 * 视觉方向：赛博霓虹。
 *
 * 三条约束贯穿全局：
 * 1. 背景永远是深紫黑的渐变，不用纯黑——纯黑会让霓虹色显得刺眼且廉价
 * 2. 高饱和色（洋红/青）只出现在需要被点击或需要被读的地方，
 *    大面积区域一律低饱和，否则"发光"就不再是重点
 * 3. 中性色统一往紫色偏（chroma 很低但不为 0），避免出现死灰
 */
.lab {
  position: relative;
  min-height: 100%;
  padding: clamp(68px, 7vw, 84px) clamp(16px, 3vw, 44px) 72px;
  overflow: hidden;
  color: #e9e6f5;
  background:
    radial-gradient(90% 65% at 15% 0%, #1e1436 0%, transparent 60%),
    radial-gradient(70% 60% at 90% 15%, #2a1030 0%, transparent 55%),
    linear-gradient(180deg, #0d0a1a 0%, #07060f 100%);
  font-family: 'Rajdhani', system-ui, -apple-system, sans-serif;
}

.game-center-back {
  position: absolute;
  z-index: 3;
  top: 18px;
  left: 18px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  background: rgba(13, 10, 26, 0.72);
  color: #b9b4ca;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(12px);
  transition:
    border-color 0.2s,
    color 0.2s,
    background 0.2s;
}

.game-center-back:hover {
  border-color: rgba(0, 229, 255, 0.42);
  background: rgba(24, 17, 43, 0.9);
  color: #fff;
}

/* 细网格：给背景一点"技术感"的纹理，但压到几乎看不见 */
.bg-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(80% 60% at 50% 30%, #000 0%, transparent 100%);
}
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
}
.orb-a {
  width: 460px;
  height: 460px;
  left: -160px;
  bottom: -180px;
  background: rgba(94, 40, 160, 0.3);
}
.orb-b {
  width: 400px;
  height: 400px;
  right: -120px;
  top: 40px;
  background: rgba(200, 40, 110, 0.18);
}

.lab-inner {
  position: relative;
  z-index: 1;
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  /*
   * 左栏窄、右栏宽：品牌区不需要那么多空间，交互区才需要。
   * 用 minmax 而非固定值，让两栏在 720-1180px 之间平滑压缩，
   * 而不是一到某个宽度就突然塌成单列。
   */
  grid-template-columns: minmax(240px, 0.8fr) minmax(320px, 1fr);
  gap: clamp(20px, 3.4vw, 56px);
  align-items: start;
}

/* ===== 左栏 ===== */
.wordmark {
  margin: 0;
  display: flex;
  flex-direction: column;
  /* 巨大字号 + 极紧行距，是设计稿最强的视觉锚点 */
  font-size: clamp(46px, 7.2vw, 86px);
  font-weight: 700;
  line-height: 0.88;
  letter-spacing: 0.06em;
  color: #fff;
  text-shadow: 0 0 46px rgba(255, 46, 99, 0.35);
}
.wordmark span:last-child {
  color: #ff2e63;
  text-shadow: 0 0 40px rgba(255, 46, 99, 0.6);
}
.wordmark-cn {
  margin: 12px 0 0;
  color: #00e5ff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5em;
  text-shadow: 0 0 18px rgba(0, 229, 255, 0.5);
}
.tagline {
  margin: 22px 0 0;
  max-width: 30ch;
  color: #8d84b4;
  font-size: 13.5px;
  line-height: 1.75;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 32px;
}
.entry {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.24s cubic-bezier(0.25, 1, 0.5, 1),
    border-color 0.24s cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.entry input[type='file'] {
  display: none;
}
.entry:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.24);
}
.entry:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
/* 主入口用渐变实底，与次要入口形成明确的层级差 */
.entry.primary {
  border-color: transparent;
  background: linear-gradient(96deg, #ff2e63 0%, #b52fc9 52%, #7b3bf0 100%);
  box-shadow: 0 10px 34px rgba(169, 52, 208, 0.35);
}
.entry.primary:hover:not(:disabled) {
  box-shadow: 0 14px 42px rgba(169, 52, 208, 0.5);
}
.entry-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  font-size: 13px;
}
.entry-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.entry-text b {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.entry-text small {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  opacity: 0.72;
}
.entry-badge {
  margin-left: auto;
  padding: 4px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.adv-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 26px;
  padding: 0;
  border: none;
  background: none;
  color: #6f679a;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: color 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.adv-toggle:hover {
  color: #b9b2d4;
}
.gear {
  font-size: 14px;
}

/* ===== 右栏选曲卡 ===== */
.deck {
  padding: 22px;
  border: 1px solid rgba(0, 229, 255, 0.22);
  border-radius: 18px;
  background: rgba(14, 11, 28, 0.72);
  /* 外发光 + 内侧一道高光，让卡片看起来是"亮着的"而非贴上去的 */
  box-shadow:
    0 0 42px rgba(0, 229, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(10px);
}
.deck-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.deck-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.star {
  color: #00e5ff;
  font-size: 11px;
}
.tag {
  margin-left: auto;
  padding: 3px 9px;
  border: 1px solid rgba(255, 46, 99, 0.45);
  border-radius: 5px;
  color: #ff5c85;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.search-row {
  display: flex;
  gap: 8px;
}
.search-input {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.3);
  color: #e9e6f5;
  font-family: inherit;
  font-size: 13.5px;
  transition: border-color 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.search-input::placeholder {
  color: #5f5885;
}
.search-input:focus {
  outline: none;
  border-color: rgba(0, 229, 255, 0.55);
}
.search-input:focus-visible {
  box-shadow: 0 0 0 3px rgba(0, 229, 255, 0.16);
}
.search-btn {
  flex: none;
  padding: 10px 18px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 9px;
  background: rgba(0, 229, 255, 0.1);
  color: #6fe6ff;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    background 0.2s cubic-bezier(0.25, 1, 0.5, 1),
    color 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.search-btn:hover:not(:disabled) {
  background: rgba(0, 229, 255, 0.2);
  color: #fff;
}
.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.deck-label {
  margin: 16px 0 8px;
  color: #635b8c;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
}

.songs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 210px;
  overflow-y: auto;
}
.songs li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition:
    background 0.16s cubic-bezier(0.25, 1, 0.5, 1),
    border-color 0.16s cubic-bezier(0.25, 1, 0.5, 1);
}
.songs li:hover {
  background: rgba(255, 255, 255, 0.07);
}
.songs li.active {
  border-color: rgba(61, 218, 215, 0.5);
  background: rgba(61, 218, 215, 0.1);
}
.dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
}
.songs li.active .dot {
  background: #3ddad7;
  box-shadow: 0 0 8px #3ddad7;
}
.idx {
  flex: none;
  color: #5f5885;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.s-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.s-artist {
  flex: none;
  max-width: 34%;
  color: #6f679a;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.analyzing {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 9px;
  background: rgba(0, 229, 255, 0.06);
  color: #6fe6ff;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00e5ff;
  animation: pulse 1.1s cubic-bezier(0.25, 1, 0.5, 1) infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 0.25;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* 已选中的曲子 */
.chosen {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.26);
}
.chosen-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.chosen-name {
  flex: 1;
  min-width: 0;
}
.chosen-name .deck-label {
  margin: 0 0 3px;
}
.chosen-name b {
  display: block;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bpm-pill {
  flex: none;
  padding: 4px 11px;
  border: 1px solid rgba(0, 229, 255, 0.4);
  border-radius: 6px;
  color: #6fe6ff;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
}
.chosen-facts {
  display: flex;
  gap: 14px;
  margin-top: 8px;
  color: #6f679a;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.chosen-facts .warn {
  color: #ffb04d;
}

.diffs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.diff {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 8px 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  color: #8d84b4;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color 0.18s cubic-bezier(0.25, 1, 0.5, 1),
    background 0.18s cubic-bezier(0.25, 1, 0.5, 1),
    color 0.18s cubic-bezier(0.25, 1, 0.5, 1);
}
.diff b {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.diff small {
  font-size: 9.5px;
  font-weight: 600;
  opacity: 0.62;
  font-variant-numeric: tabular-nums;
}
.diff:hover {
  border-color: rgba(255, 255, 255, 0.24);
  color: #d6d0ea;
}
/* 四档各用一个色相，难度递增时颜色也在"升温" */
.diff.easy.on {
  border-color: #3ddad7;
  background: rgba(61, 218, 215, 0.14);
  color: #7af5c8;
}
.diff.normal.on {
  border-color: #00e5ff;
  background: rgba(0, 229, 255, 0.14);
  color: #6fe6ff;
}
.diff.hard.on {
  border-color: #ffd166;
  background: rgba(255, 209, 102, 0.14);
  color: #ffd166;
}
.diff.master.on {
  border-color: #ff2e63;
  background: rgba(255, 46, 99, 0.15);
  color: #ff6b8f;
}

.go {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
  margin-top: 14px;
  padding: 13px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(96deg, #ff2e63 0%, #b52fc9 55%, #7b3bf0 100%);
  color: #fff;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 8px 26px rgba(169, 52, 208, 0.34);
  transition:
    transform 0.22s cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 0.22s cubic-bezier(0.25, 1, 0.5, 1);
}
.go:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 34px rgba(169, 52, 208, 0.5);
}
.go:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.go-icon {
  font-size: 10px;
}
.gen-info {
  margin: 10px 0 0;
  color: #635b8c;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.empty {
  margin: 20px 0 4px;
  color: #7c749f;
  font-size: 12.5px;
  line-height: 1.8;
}
.dim {
  color: #56507a;
}
.err {
  margin: 12px 0 0;
  padding: 9px 13px;
  border-left: 2px solid #ff2e63;
  border-radius: 0 6px 6px 0;
  background: rgba(255, 46, 99, 0.09);
  color: #ff7d9c;
  font-size: 12px;
}

/* ===== 高级面板 ===== */
.advanced {
  position: relative;
  z-index: 1;
  max-width: 1180px;
  margin: 40px auto 0;
  display: grid;
  gap: 16px;
  animation: adv-in 0.36s cubic-bezier(0.25, 1, 0.5, 1);
}
@keyframes adv-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
.panel {
  padding: 18px 20px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.022);
}
.panel h3 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #a99fd0;
}
.hint {
  margin: 0 0 12px;
  color: #7c749f;
  font-size: 12px;
  line-height: 1.7;
}
.sub-note {
  color: #5f5885;
  font-size: 11px;
}
.c-beat {
  color: #6fe6ff;
}
.c-onset {
  color: #ffd166;
}

.controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.ctl-label {
  color: #6f679a;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.controls button,
.actions button {
  padding: 6px 13px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  color: #b9b2d4;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.18s cubic-bezier(0.25, 1, 0.5, 1),
    background 0.18s cubic-bezier(0.25, 1, 0.5, 1),
    color 0.18s cubic-bezier(0.25, 1, 0.5, 1);
}
.controls button:hover:not(:disabled),
.actions button:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.26);
  color: #fff;
}
.controls button.on {
  border-color: rgba(0, 229, 255, 0.5);
  background: rgba(0, 229, 255, 0.13);
  color: #6fe6ff;
}
.controls button:disabled,
.actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
}
input[type='range'] {
  width: 130px;
  accent-color: #00e5ff;
}
input[type='range']:disabled {
  opacity: 0.4;
}
.range-val {
  min-width: 48px;
  color: #b9b2d4;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.eff-bpm {
  color: #ffd166;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat-note {
  margin: 10px 0;
  padding: 10px 13px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  color: #8d84b4;
  font-size: 11.5px;
  line-height: 1.7;
}
.stat-note b {
  color: #d6d0ea;
  font-variant-numeric: tabular-nums;
}
.stat-note .warn,
.warn {
  color: #ffb04d !important;
}

.beat-stage {
  display: grid;
  place-items: center;
  height: 88px;
  margin: 6px 0;
}
.beat-circle {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: radial-gradient(circle, #6fe6ff 0%, rgba(0, 229, 255, 0.15) 70%);
}
.beat-circle.accent {
  background: radial-gradient(circle, #ffd166 0%, rgba(255, 209, 102, 0.18) 70%);
}
.clock,
.latency,
.tl-label {
  margin: 2px 0;
  color: #6f679a;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.latency {
  color: #56507a;
  font-size: 10.5px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.timeline-wrap {
  margin-top: 16px;
}
.timeline {
  position: relative;
  height: 34px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.34);
  overflow: hidden;
}
.onset {
  position: absolute;
  top: 5px;
  bottom: 5px;
  width: 1px;
  background: rgba(0, 229, 255, 0.5);
}
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ff2e63;
  box-shadow: 0 0 8px #ff2e63;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  margin-top: 14px;
}
.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 11px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}
.metric .k {
  color: #635b8c;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.metric b {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.metric b.corrected {
  color: #ffd166;
}

.logs {
  max-height: 200px;
  margin: 0;
  overflow: auto;
  color: #7c749f;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-wrap;
}

/* 游玩时占满视口 */
.fullscreen-play {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #07060f;
}

/* ===== 窄屏 ===== */
@media (max-width: 720px) {
  /* 单列堆叠：两栏低于 720px 会让选曲卡窄到无法用 */
  .lab-inner {
    grid-template-columns: 1fr;
    gap: 26px;
  }
  .tagline {
    max-width: none;
  }
  .diffs {
    grid-template-columns: repeat(2, 1fr);
  }
  /* 单列时入口按钮限宽，撑满整行会显得像横幅而非按钮 */
  .entries {
    max-width: 420px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .advanced,
  .pulse {
    animation: none;
  }
  .entry:hover,
  .go:hover {
    transform: none;
  }
}
</style>
