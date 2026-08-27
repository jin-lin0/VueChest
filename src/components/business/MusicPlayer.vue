<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMusicStore } from '@/stores/music'
import { setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config/storage-keys'
import Drawer from '@/components/common/Drawer.vue'
import EmptyState from '@/components/common/EmptyState.vue'

defineOptions({ name: 'MusicPlayer' })

const music = useMusicStore()
const router = useRouter()

function sendToRhythm() {
  const song = music.activeSong || music.currentSong
  if (!song || !music.songUrl) return
  setStorage(STORAGE_KEYS.RHYTHM_SOURCE, {
    id: song.id,
    title: song.name,
    artist: song.artists,
    url: music.songUrl,
  })
  music.isPlaying = false
  router.push('/rhythm')
}

// —— 播放失败提示 toast ——
const playErrorToast = ref('')
let playErrorTimer: ReturnType<typeof setTimeout> | null = null

const showPlayerToast = (message: string, duration = 3200) => {
  playErrorToast.value = message
  if (playErrorTimer) clearTimeout(playErrorTimer)
  playErrorTimer = setTimeout(() => {
    playErrorToast.value = ''
    playErrorTimer = null
  }, duration)
}

onUnmounted(() => {
  if (playErrorTimer) clearTimeout(playErrorTimer)
})

const onAudioError = () => {
  if (!music.songUrl) return
  music.isPlaying = false
  showPlayerToast('该歌曲暂不可播放（可能因版权 / 地区限制）')
}

// 沉浸式游戏页（全屏 canvas）隐藏播放条，避免遮挡游戏画面
const route = useRoute()
const GAME_ROUTE_PREFIXES = ['/snake', '/racing', '/rhythm', '/neon-survivor']
const isGameRoute = computed(() => GAME_ROUTE_PREFIXES.some((p) => route.path.startsWith(p)))

// 播放条作为 App.vue 外壳的 flex 兄弟节点钉在底部（见 App.vue 的 .app / .app-main 布局），
// 预留空间只在根布局发生一次，本组件不再操作 body / 不再向各页面注入逻辑。

// --- Refs ---
const audioRef = ref<HTMLAudioElement | null>(null)
const showLyrics = ref(false)
const drawerTab = ref<'playlist' | 'simi' | 'history'>('playlist')
const progressDragging = ref(false)
const progressPercent = ref(0)
const lyricContainerRef = ref<HTMLDivElement | null>(null)
const sleepControlRef = ref<HTMLElement | null>(null)
const showSleepMenu = ref(false)
const sleepMinutes = ref(30)
const sleepEndsAt = ref<number | null>(null)
const sleepRemaining = ref(0)
const sleepPresets = [15, 30, 45, 60, 90]
let sleepTimer: ReturnType<typeof setInterval> | null = null

// --- Audio control ---
const onTimeUpdate = () => {
  if (!audioRef.value || progressDragging.value) return
  music.currentTime = audioRef.value.currentTime
  music.duration = audioRef.value.duration || 0
  progressPercent.value = music.duration > 0 ? (music.currentTime / music.duration) * 100 : 0
}

const onAudioEnded = () => {
  music.playNext()
}

const onAudioPlay = () => {
  music.isPlaying = true
}

const onAudioPause = () => {
  music.isPlaying = false
}

const onAudioLoaded = () => {
  if (audioRef.value && music.isPlaying) {
    audioRef.value.play().catch(() => {})
  }
}

const togglePlayPause = () => {
  if (!audioRef.value) return
  if (music.isPlaying) {
    audioRef.value.pause()
  } else {
    audioRef.value.play().catch(() => {})
  }
  music.togglePlay()
}

const seekTo = (e: MouseEvent) => {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  if (audioRef.value && music.duration > 0) {
    audioRef.value.currentTime = percent * music.duration
    music.currentTime = audioRef.value.currentTime
    progressPercent.value = percent * 100
  }
}

const onProgressMouseDown = (e: MouseEvent) => {
  progressDragging.value = true
  seekTo(e)
  const onMove = (ev: MouseEvent) => seekTo(ev)
  const onUp = () => {
    progressDragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const changeVolume = (e: MouseEvent) => {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  music.setVolume(v)
  if (audioRef.value) audioRef.value.volume = v
}

watch(
  () => music.isPlaying,
  (playing) => {
    if (!audioRef.value) return
    if (playing) {
      audioRef.value.play().catch(() => {})
    } else {
      audioRef.value.pause()
    }
  },
)

// --- Lyrics auto-scroll ---
const scrollToCurrentLyric = () => {
  const idx = music.currentLyricIndex
  if (idx < 0 || !lyricContainerRef.value) return
  const el = lyricContainerRef.value.children[idx] as HTMLElement | undefined
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

watch(
  () => music.currentLyricIndex,
  () => scrollToCurrentLyric(),
)

watch(
  () => showLyrics.value,
  async (show) => {
    if (show) {
      await nextTick()
      scrollToCurrentLyric()
    }
  },
)

// --- Format helpers ---
const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const playModeKey = computed(() => music.playMode || 'list')

const playModeLabel = computed(() => {
  const labels: Record<string, string> = {
    list: '列表循环',
    single: '单曲循环',
    random: '随机播放',
  }
  return labels[music.playMode] || labels.list
})

// --- Playlist ---
const playFromPlaylist = (index: number) => {
  const song = music.playlist[index]
  if (song) music.playSong(song)
}

const tickSleepTimer = () => {
  if (!sleepEndsAt.value) return
  sleepRemaining.value = Math.max(0, Math.ceil((sleepEndsAt.value - Date.now()) / 1000))
  if (sleepRemaining.value > 0) return
  audioRef.value?.pause()
  music.isPlaying = false
  sleepEndsAt.value = null
  if (sleepTimer) clearInterval(sleepTimer)
  sleepTimer = null
  showSleepMenu.value = false
  showPlayerToast('睡眠定时结束，播放已暂停', 3800)
}

const startSleepTimer = () => {
  const wasActive = Boolean(sleepEndsAt.value)
  const minutes = Math.max(1, Math.min(180, Number(sleepMinutes.value) || 30))
  sleepMinutes.value = minutes
  sleepEndsAt.value = Date.now() + minutes * 60_000
  sleepRemaining.value = minutes * 60
  if (sleepTimer) clearInterval(sleepTimer)
  sleepTimer = setInterval(tickSleepTimer, 1000)
  showSleepMenu.value = false
  showPlayerToast(wasActive ? `睡眠定时已更新为 ${minutes} 分钟` : `已开启 ${minutes} 分钟睡眠定时`)
}

const cancelSleepTimer = () => {
  sleepEndsAt.value = null
  sleepRemaining.value = 0
  if (sleepTimer) clearInterval(sleepTimer)
  sleepTimer = null
  showSleepMenu.value = false
  showPlayerToast('已取消睡眠定时')
}

const selectSleepPreset = (minutes: number) => {
  sleepMinutes.value = minutes
}

const sleepLabel = computed(() => {
  if (!sleepRemaining.value) return '定时'
  if (sleepRemaining.value < 60) return `${sleepRemaining.value}s`
  const minutes = Math.ceil(sleepRemaining.value / 60)
  return `${minutes}m`
})

const sleepEndLabel = computed(() => {
  if (!sleepEndsAt.value) return ''
  return new Date(sleepEndsAt.value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const sleepRemainingLabel = computed(() => {
  if (!sleepRemaining.value) return ''
  const minutes = Math.floor(sleepRemaining.value / 60)
  const seconds = sleepRemaining.value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
})

const onDocumentPointerDown = (event: PointerEvent) => {
  if (!showSleepMenu.value) return
  if (!sleepControlRef.value?.contains(event.target as Node)) showSleepMenu.value = false
}

// --- Keyboard shortcuts ---
const onKeydown = (e: KeyboardEvent) => {
  if (e.code === 'Escape' && showSleepMenu.value) {
    showSleepMenu.value = false
    return
  }
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlayPause()
  } else if (e.code === 'ArrowLeft') {
    music.playPrev()
  } else if (e.code === 'ArrowRight') {
    music.playNext()
  } else if (e.code === 'ArrowUp') {
    e.preventDefault()
    music.setVolume(music.volume + 0.05)
  } else if (e.code === 'ArrowDown') {
    e.preventDefault()
    music.setVolume(music.volume - 0.05)
  } else if (e.code === 'KeyM') {
    music.setVolume(music.volume > 0 ? 0 : 0.7)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  if (sleepTimer) clearInterval(sleepTimer)
})
</script>

<template>
  <!-- Playlist drawer: always mountable, independent of playback state -->
  <Drawer
    :open="music.showPlaylist"
    side="right"
    :dark="true"
    :show-close="false"
    :width="'min(360px, 88vw)'"
    :style="{
      '--vc-drawer-overlay': 'rgba(0, 0, 0, 0.55)',
      '--vc-drawer-bg': 'rgba(18, 18, 32, 0.97)',
      '--vc-drawer-radius': 'var(--radius-lg) 0 0 var(--radius-lg)',
      '--vc-drawer-body-pad': '8px',
      '--vc-drawer-header-pad': '14px 16px',
    }"
    @close="music.showPlaylist = false"
  >
    <template #header>
      <div class="drawer-tabs">
        <button :class="{ active: drawerTab === 'playlist' }" @click="drawerTab = 'playlist'">
          播放列表 ({{ music.playlist.length }})
        </button>
        <button :class="{ active: drawerTab === 'simi' }" @click="drawerTab = 'simi'">
          相似推荐
        </button>
        <button :class="{ active: drawerTab === 'history' }" @click="drawerTab = 'history'">
          最近播放
        </button>
      </div>
      <button class="drawer-close" @click="music.showPlaylist = false">&times;</button>
    </template>

    <!-- 播放列表 -->
    <template v-if="drawerTab === 'playlist'">
      <div v-if="music.playlist.length" class="queue-toolbar">
        <button @click="music.shufflePlaylist">随机排序</button>
        <button @click="music.clearPlaylist">清空队列</button>
      </div>
      <EmptyState v-if="music.playlist.length === 0" icon="🎵" title="播放列表为空" />
      <div
        v-for="(song, index) in music.playlist"
        :key="song.id + '-' + index"
        class="song-item"
        :class="{ playing: index === music.currentIndex }"
        @click="playFromPlaylist(index)"
      >
        <span class="song-index">{{ index + 1 }}</span>
        <div class="song-info">
          <div class="song-name">{{ song.name }}</div>
          <div class="song-artist">{{ song.artists }}</div>
        </div>
        <button class="remove-btn" @click.stop="music.removeSongFromPlaylist(index)">
          &times;
        </button>
      </div>
    </template>

    <!-- 相似推荐 -->
    <template v-else-if="drawerTab === 'simi'">
      <div v-if="music.isLoadingSimi" class="drawer-loading">加载中...</div>
      <EmptyState v-else-if="music.simiSongs.length === 0" icon="🎶" title="暂无相似歌曲推荐" />
      <div
        v-for="song in music.simiSongs"
        :key="song.id"
        class="song-item"
        :class="{ playing: music.activeSong?.id === song.id }"
        @click="music.playSong(song, music.simiSongs)"
      >
        <img
          v-if="song.coverUrl"
          :src="song.coverUrl + '?param=80y80'"
          class="simi-cover"
          alt=""
          loading="lazy"
        />
        <div class="song-info">
          <div class="song-name">{{ song.name }}</div>
          <div class="song-artist">{{ song.artists }}</div>
        </div>
        <button
          class="remove-btn"
          :class="{ favorited: music.isFavoriteSong(song.id) }"
          @click.stop="music.toggleFavoriteSong(song)"
        >
          {{ music.isFavoriteSong(song.id) ? '❤️' : '🤍' }}
        </button>
      </div>
    </template>
    <template v-else>
      <div v-if="music.playHistory.length" class="queue-toolbar">
        <span>最近 {{ music.playHistory.length }} 首</span>
        <button @click="music.clearPlayHistory">清空记录</button>
      </div>
      <EmptyState v-if="music.playHistory.length === 0" icon="◷" title="暂无播放记录" />
      <div
        v-for="song in music.playHistory"
        :key="song.id"
        class="song-item"
        @click="music.playSong(song)"
      >
        <img
          v-if="song.coverUrl"
          :src="song.coverUrl + '?param=80y80'"
          class="simi-cover"
          alt=""
          loading="lazy"
        />
        <div class="song-info">
          <div class="song-name">{{ song.name }}</div>
          <div class="song-artist">{{ song.artists }}</div>
        </div>
        <button class="remove-btn" @click.stop="music.removePlayHistoryItem(song.id)">
          &times;
        </button>
      </div>
    </template>
  </Drawer>

  <template v-if="music.playerBarVisible && music.activeSong">
    <!-- Player bar（游戏页用 v-show 隐藏，但 audio 仍挂载、音乐继续播放）-->
    <div class="player-bar vc-dark" v-show="!isGameRoute">
      <!-- Progress bar -->
      <div class="progress-bar-container" @mousedown="onProgressMouseDown">
        <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
      </div>

      <div class="player-controls">
        <!-- Song info -->
        <div class="player-song-info">
          <img
            v-if="music.activeSong.coverUrl"
            :src="music.activeSong.coverUrl + '?param=80y80'"
            class="player-cover"
            alt=""
          />
          <div v-else class="player-cover-placeholder">🎵</div>
          <div class="player-song-text">
            <div class="player-song-name">{{ music.activeSong.name }}</div>
            <div class="player-song-artist">{{ music.activeSong.artists }}</div>
          </div>
        </div>

        <!-- Center controls -->
        <div class="center-controls">
          <button class="mode-btn" :title="playModeLabel" @click="music.cyclePlayMode()">
            <!-- List loop -->
            <svg
              v-if="playModeKey === 'list'"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <!-- Single loop -->
            <svg
              v-else-if="playModeKey === 'single'"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              <text
                x="12"
                y="12"
                text-anchor="middle"
                dominant-baseline="central"
                fill="currentColor"
                stroke="none"
                font-size="9"
                font-weight="700"
              >
                1
              </text>
            </svg>
            <!-- Random -->
            <svg
              v-else
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>
          <button class="ctrl-btn" @click="music.playPrev()">⏮</button>
          <button class="play-btn" @click="togglePlayPause" :disabled="music.isLoadingUrl">
            <!-- Loading spinner -->
            <svg
              v-if="music.isLoadingUrl"
              class="spin-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <!-- Pause icon -->
            <svg
              v-else-if="music.isPlaying"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect x="5" y="3" width="5" height="18" rx="1" />
              <rect x="14" y="3" width="5" height="18" rx="1" />
            </svg>
            <!-- Play icon (triangle, centroid-centered) -->
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="8,4 8,20 20,12" />
            </svg>
          </button>
          <button class="ctrl-btn" @click="music.playNext()">⏭</button>
          <button
            class="fav-btn"
            :class="{ favorited: music.isFavorite }"
            @click="music.toggleFavorite()"
          >
            {{ music.isFavorite ? '❤️' : '🤍' }}
          </button>
        </div>

        <!-- Right controls -->
        <div class="right-controls">
          <span class="time-display">
            {{ formatTime(music.currentTime) }} / {{ formatTime(music.duration) }}
          </span>
          <button class="lyrics-btn" title="发送到音游制谱" @click="sendToRhythm">🎹</button>
          <button
            class="lyrics-btn"
            :class="{ active: showLyrics }"
            @click="showLyrics = !showLyrics"
          >
            词
          </button>
          <div ref="sleepControlRef" class="sleep-control">
            <button
              class="sleep-btn"
              :class="{ active: sleepEndsAt }"
              @click="showSleepMenu = !showSleepMenu"
              :title="sleepEndsAt ? `睡眠定时至 ${sleepEndLabel}` : '睡眠定时'"
            >
              {{ sleepLabel }}
            </button>
            <div v-if="showSleepMenu" class="sleep-menu" @click.stop>
              <header>
                <strong>睡眠定时</strong>
                <button type="button" aria-label="关闭睡眠定时" @click="showSleepMenu = false">
                  &times;
                </button>
              </header>
              <div v-if="sleepEndsAt" class="sleep-running-status">
                <span>运行中</span>
                <strong>{{ sleepRemainingLabel }}</strong>
                <small>{{ sleepEndLabel }} 暂停播放</small>
              </div>
              <div class="sleep-presets" aria-label="常用睡眠时长">
                <button
                  v-for="minutes in sleepPresets"
                  :key="minutes"
                  type="button"
                  :class="{ active: sleepMinutes === minutes }"
                  @click="selectSleepPreset(minutes)"
                >
                  {{ minutes }} 分
                </button>
              </div>
              <label class="sleep-custom-duration">
                <span>自定义</span>
                <input v-model.number="sleepMinutes" type="number" min="1" max="180" />
                <span>分钟</span>
              </label>
              <div class="sleep-menu-actions">
                <button class="primary" type="button" @click="startSleepTimer">
                  {{ sleepEndsAt ? '更新计时' : '开始计时' }}
                </button>
                <button v-if="sleepEndsAt" class="cancel" type="button" @click="cancelSleepTimer">
                  取消定时
                </button>
              </div>
            </div>
          </div>
          <button
            class="list-btn"
            @click="music.showPlaylist = !music.showPlaylist"
            :title="`播放列表(${music.playlist.length})`"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <div class="volume-control" @click="changeVolume">
            <div class="volume-bar-bg">
              <div class="volume-bar" :style="{ width: music.volume * 100 + '%' }"></div>
            </div>
          </div>
          <button class="close-btn" @click="music.closePlayer()" title="关闭播放器">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Audio element -->
    <audio
      ref="audioRef"
      :src="music.songUrl"
      @timeupdate="onTimeUpdate"
      @ended="onAudioEnded"
      @play="onAudioPlay"
      @pause="onAudioPause"
      @loadeddata="onAudioLoaded"
      @error="onAudioError"
    ></audio>

    <!-- 不可播放 / 加载失败 提示 -->
    <Transition name="toast-fade">
      <div v-if="playErrorToast" class="play-error-toast">{{ playErrorToast }}</div>
    </Transition>

    <!-- Lyrics overlay -->
    <Transition name="lyrics-fade">
      <div
        v-if="showLyrics && !isGameRoute"
        class="lyrics-overlay vc-dark"
        @click.self="showLyrics = false"
      >
        <div class="lyrics-panel">
          <div class="lyrics-header">
            <h2>{{ music.activeSong.name }}</h2>
            <p>{{ music.activeSong.artists }}</p>
            <button class="close-lyrics" @click="showLyrics = false">&times;</button>
          </div>
          <div ref="lyricContainerRef" class="lyrics-body vc-scrollbar vc-scrollbar--thin">
            <div v-if="music.lyrics.length === 0" class="no-lyrics">暂无歌词</div>
            <div
              v-for="(line, idx) in music.lyrics"
              :key="idx"
              class="lyric-line"
              :class="{ active: idx === music.currentLyricIndex }"
            >
              {{ line.text }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </template>
</template>

<style scoped>
/* ===== Theme Variables ===== */
.player-bar,
.lyrics-overlay {
  --accent: #6c5ce7;
  --accent-light: #a29bfe;
  --accent-gradient: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
  --accent-gradient-vivid: linear-gradient(135deg, #6c5ce7 0%, #fd79a8 100%);
  --bg-card: rgba(255, 255, 255, 0.06);
  --bg-card-hover: rgba(255, 255, 255, 0.1);
  --text: #f0f0f5;
  --text-secondary: #8888a0;
  --text-dim: #55556a;
  --border: rgba(255, 255, 255, 0.08);
  --radius-sm: 8px;
  --radius-lg: 18px;
}

.player-bar {
  /* 改为流内元素：作为 App.vue 外壳的 flex 兄弟节点钉在底部，
     播放条出现时自然把 .app-main 顶上去 72px，无需 fixed、无需各页面感知 */
  position: relative;
  flex-shrink: 0;
  width: 100%;
  background: rgba(20, 20, 35, 0.88);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.4);
  z-index: 200;
  border-top: 1px solid var(--border);
}

.progress-bar-container {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  border-radius: 2px;
  position: relative;
  transition: height 0.15s;
}

.progress-bar {
  height: 100%;
  background: var(--accent-gradient-vivid);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.player-controls {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  gap: 16px;
}

.player-song-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.player-cover {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.player-cover-placeholder {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-gradient);
  font-size: 22px;
  flex-shrink: 0;
}

.player-song-text {
  min-width: 0;
}

.player-song-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-song-artist {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}

/* ===== Center Controls ===== */
.center-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.mode-btn,
.ctrl-btn,
.fav-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  font-size: 16px;
  color: var(--text-secondary);
  transition:
    background 0.2s,
    color 0.2s,
    transform 0.15s;
}

.mode-btn:hover,
.ctrl-btn:hover,
.fav-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.ctrl-btn:active {
  transform: scale(0.9);
}

.play-btn {
  background: var(--accent-gradient);
  border: none;
  color: white;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.15s,
    box-shadow 0.2s;
  box-shadow: 0 4px 16px rgba(108, 92, 231, 0.4);
}

.play-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(108, 92, 231, 0.5);
}

.play-btn:active {
  transform: scale(0.95);
}

.play-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.spin-icon {
  animation: vc-spin 1s linear infinite;
}

.fav-btn.favorited {
  color: #fd79a8;
}

/* ===== Right Controls ===== */
.right-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.time-display {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.lyrics-btn {
  font-size: 12px;
  font-weight: 700;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--border);
  cursor: pointer;
  border-radius: 6px;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.sleep-control {
  position: relative;
}
.sleep-btn {
  min-width: 38px;
  height: 30px;
  padding: 0 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 10px;
  font-weight: 800;
}
.sleep-btn.active {
  border-color: var(--accent);
  background: rgba(108, 92, 231, 0.18);
  color: #fff;
}
.sleep-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 12px);
  width: 250px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #1b1b2d;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}
.sleep-menu > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
}
.sleep-menu > header strong {
  color: var(--text);
  font-size: 13px;
}
.sleep-menu > header button {
  width: 25px;
  height: 25px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
.sleep-menu > header button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.sleep-running-status {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 3px 8px;
  margin-bottom: 11px;
  padding: 9px 10px;
  border: 1px solid rgba(108, 92, 231, 0.28);
  border-radius: 9px;
  background: rgba(108, 92, 231, 0.11);
}
.sleep-running-status > span {
  grid-row: 1 / span 2;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(108, 92, 231, 0.22);
  color: #cfc8ff;
  font-size: 9px;
}
.sleep-running-status strong {
  color: #fff;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.sleep-running-status small {
  color: var(--text-secondary);
  font-size: 9px;
}
.sleep-presets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}
.sleep-presets button {
  height: 31px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 10px;
}
.sleep-presets button:hover,
.sleep-presets button.active {
  border-color: rgba(108, 92, 231, 0.7);
  background: rgba(108, 92, 231, 0.16);
  color: #fff;
}
.sleep-custom-duration {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.sleep-custom-duration input {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  outline: 0;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.sleep-custom-duration span {
  color: var(--text-secondary);
  font-size: 10px;
}
.sleep-menu-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 7px;
  margin-top: 11px;
}
.sleep-menu-actions button {
  height: 34px;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}
.sleep-menu-actions button.primary {
  background: var(--accent);
  color: #fff;
}
.sleep-menu-actions button.cancel {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}
.queue-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 8px 10px;
  color: var(--text-secondary);
  font-size: 10px;
}
.queue-toolbar span {
  margin-right: auto;
}
.queue-toolbar button {
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 10px;
}

.lyrics-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.lyrics-btn.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
  box-shadow: 0 2px 10px rgba(108, 92, 231, 0.3);
}

.list-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--border);
  cursor: pointer;
  border-radius: 6px;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.list-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.volume-control {
  width: 80px;
  cursor: pointer;
  padding: 8px 0;
}

.volume-bar-bg {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.volume-bar {
  height: 100%;
  background: var(--accent-gradient);
  border-radius: 2px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #fd79a8;
  background: rgba(253, 121, 168, 0.1);
}

/* ===== Lyrics Overlay ===== */
.lyrics-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 10, 20, 0.94);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: opacity;
}

.lyrics-fade-enter-active {
  transition: opacity 0.25s ease;
}
.lyrics-fade-leave-active {
  transition: opacity 0.2s ease;
}
.lyrics-fade-enter-from,
.lyrics-fade-leave-to {
  opacity: 0;
}

.lyrics-panel {
  background: rgba(20, 20, 40, 0.6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 92%;
  max-width: 520px;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.lyrics-header {
  padding: 24px 24px 16px;
  text-align: center;
  position: relative;
  border-bottom: 1px solid var(--border);
}

.lyrics-header h2 {
  font-size: 20px;
  margin: 0;
  font-weight: 700;
  color: var(--text);
}

.lyrics-header p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 6px 0 0;
}

.close-lyrics {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  font-size: 18px;
  cursor: pointer;
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.2s,
    color 0.2s;
}

.close-lyrics:hover {
  background: var(--bg-card-hover);
  color: var(--text);
}

.lyrics-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(4vh) 24px calc(25vh + 8px);
  text-align: center;
  mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%);
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 12%,
    black 88%,
    transparent 100%
  );
}

.lyric-line {
  padding: 10px 0;
  font-size: 15px;
  color: var(--text-dim);
  transition: all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
  line-height: 1.8;
}

.lyric-line.active {
  color: var(--text);
  font-size: 19px;
  font-weight: 700;
  text-shadow: 0 0 20px rgba(108, 92, 231, 0.5);
  transform: scale(1.04);
}

.no-lyrics {
  color: var(--text-dim);
  padding: 48px 0;
}

/* ===== Playlist Drawer（外壳由公共 <Drawer> 提供，以下仅内容样式） ===== */
/* 音乐暗色调色板：播放列表内容挂在其根节点上，配合 Drawer 的 :dark（.vc-dark 作用域）
   以保持原有暗色外观 */
.drawer-tabs,
.drawer-close,
.drawer-loading,
.song-item {
  --accent: #6c5ce7;
  --accent-light: #a29bfe;
  --bg-card: rgba(255, 255, 255, 0.06);
  --bg-card-hover: rgba(255, 255, 255, 0.1);
  --text: #f0f0f5;
  --text-secondary: #8888a0;
  --text-dim: #55556a;
  --border: rgba(255, 255, 255, 0.08);
}

.drawer-tabs {
  display: flex;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.drawer-tabs button {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 8px;
  white-space: nowrap;
  transition:
    background 0.2s,
    color 0.2s;
}

.drawer-tabs button:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}

.drawer-tabs button.active {
  color: #fff;
  background: var(--accent);
}

.drawer-close {
  background: var(--bg-card);
  border: 1px solid var(--border);
  font-size: 18px;
  cursor: pointer;
  color: var(--text-secondary);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background 0.2s,
    color 0.2s;
}

.drawer-close:hover {
  background: var(--bg-card-hover);
  color: var(--text);
}

.drawer-loading {
  text-align: center;
  padding: 40px 16px;
  color: var(--text-dim);
  font-size: 14px;
}

.simi-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.remove-btn.favorited {
  color: #fd79a8;
  opacity: 1;
}

/* Song item shared styles */
.song-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  background: var(--bg-card);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.song-item:hover {
  background: var(--bg-card-hover);
  border-color: var(--border);
}

.song-item.playing {
  background: rgba(108, 92, 231, 0.12);
  border-color: rgba(108, 92, 231, 0.25);
}

.song-item.playing .song-index {
  color: var(--accent-light);
}

.song-item.playing .song-name {
  color: var(--accent-light);
}

.song-index {
  width: 26px;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.song-info {
  flex: 1;
  min-width: 0;
}

.song-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-artist {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  flex-shrink: 0;
  opacity: 0.5;
  transition:
    opacity 0.2s,
    color 0.2s;
}

.remove-btn:hover {
  color: #fd79a8;
  opacity: 1;
}

/* ===== 不可播放提示 toast ===== */
.play-error-toast {
  position: fixed;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  z-index: 400;
  max-width: 86vw;
  padding: 10px 18px;
  border-radius: 24px;
  background: rgba(40, 20, 28, 0.92);
  border: 1px solid rgba(253, 121, 168, 0.35);
  color: #ffd5e2;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  pointer-events: none;
  text-align: center;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* Responsive */
@media (max-width: 640px) {
  .right-controls .time-display {
    display: none;
  }

  .volume-control {
    display: none;
  }

  .player-cover,
  .player-cover-placeholder {
    display: none;
  }

  .player-song-info {
    flex: 1;
    min-width: 0;
  }

  .lyrics-panel {
    width: 96%;
    max-height: 80vh;
  }

  .player-controls {
    padding: 8px 10px;
    gap: 6px;
  }

  .center-controls {
    gap: 0;
  }

  .play-btn {
    width: 38px;
    height: 38px;
    font-size: 15px;
  }

  .mode-btn,
  .fav-btn {
    padding: 6px;
  }
}
</style>
