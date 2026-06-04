<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useMusicStore } from '@/stores'

defineOptions({ name: 'MusicPlayer' })

const music = useMusicStore()

// --- Refs ---
const audioRef = ref<HTMLAudioElement | null>(null)
const showLyrics = ref(false)
const progressDragging = ref(false)
const progressPercent = ref(0)
const lyricContainerRef = ref<HTMLDivElement | null>(null)

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

// --- Watch songUrl to load ---
watch(
  () => music.songUrl,
  async (url) => {
    if (!url) return
    await nextTick()
    if (audioRef.value) {
      audioRef.value.volume = music.volume
      audioRef.value.play().catch(() => {})
    }
  },
)

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

// --- Keyboard shortcuts ---
const onKeydown = (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlayPause()
  } else if (e.code === 'ArrowLeft') {
    music.playPrev()
  } else if (e.code === 'ArrowRight') {
    music.playNext()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

// Expose for parent
defineExpose({})
</script>

<template>
  <!-- Playlist drawer: always mountable, independent of playback state -->
  <Transition name="drawer-slide">
    <div
      v-if="music.showPlaylist"
      class="playlist-drawer-overlay"
      @click.self="music.showPlaylist = false"
    >
      <div class="playlist-drawer">
        <div class="drawer-header">
          <h3>播放列表 ({{ music.playlist.length }})</h3>
          <button @click="music.showPlaylist = false">&times;</button>
        </div>
        <div class="drawer-body">
          <div v-if="music.playlist.length === 0" class="empty-state">播放列表为空</div>
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
        </div>
      </div>
    </div>
  </Transition>

  <template v-if="music.activeSong">
    <!-- Player bar -->
    <div class="player-bar">
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
                y="15"
                text-anchor="middle"
                fill="currentColor"
                stroke="none"
                font-size="10"
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
            <span v-if="music.isLoadingUrl">⏳</span>
            <span v-else>{{ music.isPlaying ? '⏸' : '▶' }}</span>
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
          <button
            class="lyrics-btn"
            :class="{ active: showLyrics }"
            @click="showLyrics = !showLyrics"
          >
            词
          </button>
          <button class="list-btn" @click="music.showPlaylist = !music.showPlaylist">
            列表({{ music.playlist.length }})
          </button>
          <div class="volume-control" @click="changeVolume">
            <div class="volume-bar-bg">
              <div class="volume-bar" :style="{ width: music.volume * 100 + '%' }"></div>
            </div>
          </div>
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
    ></audio>

    <!-- Lyrics overlay -->
    <Transition name="lyrics-fade">
      <div v-if="showLyrics" class="lyrics-overlay" @click.self="showLyrics = false">
        <div class="lyrics-panel">
          <div class="lyrics-header">
            <h2>{{ music.activeSong.name }}</h2>
            <p>{{ music.activeSong.artists }}</p>
            <button class="close-lyrics" @click="showLyrics = false">&times;</button>
          </div>
          <div ref="lyricContainerRef" class="lyrics-body">
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
.playlist-drawer-overlay,
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

/* ===== Player Bar ===== */
.player-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 1060px;
  background: rgba(20, 20, 35, 0.88);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.4);
  z-index: 200;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
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

.progress-bar-container:hover {
  height: 6px;
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
  font-size: 12px;
  white-space: nowrap;
  padding: 5px 10px;
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
  padding: calc(25vh) 24px calc(25vh + 8px);
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

/* ===== Playlist Drawer ===== */
.playlist-drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 250;
  display: flex;
  justify-content: flex-end;
  will-change: opacity;
}

.playlist-drawer {
  width: 360px;
  max-width: 88vw;
  background: rgba(18, 18, 32, 0.97);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  overflow: hidden;
  border-left: 1px solid var(--border);
  will-change: transform;
}

.drawer-slide-enter-active {
  transition: opacity 0.25s ease;
}
.drawer-slide-enter-active .playlist-drawer {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-slide-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-slide-leave-active .playlist-drawer {
  transition: transform 0.2s ease-in;
}
.drawer-slide-enter-from {
  opacity: 0;
}
.drawer-slide-enter-from .playlist-drawer {
  transform: translateX(100%);
}
.drawer-slide-leave-to {
  opacity: 0;
}
.drawer-slide-leave-to .playlist-drawer {
  transform: translateX(100%);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
}

.drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.drawer-header button {
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
  transition:
    background 0.2s,
    color 0.2s;
}

.drawer-header button:hover {
  background: var(--bg-card-hover);
  color: var(--text);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
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

.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-dim);
  font-size: 14px;
}

/* Scrollbar */
.lyrics-body::-webkit-scrollbar,
.drawer-body::-webkit-scrollbar {
  width: 5px;
}

.lyrics-body::-webkit-scrollbar-thumb,
.drawer-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.lyrics-body::-webkit-scrollbar-track,
.drawer-body::-webkit-scrollbar-track {
  background: transparent;
}

/* Responsive */
@media (max-width: 640px) {
  .right-controls .time-display {
    display: none;
  }

  .volume-control {
    display: none;
  }

  .player-song-text {
    max-width: 110px;
  }

  .playlist-drawer {
    width: 300px;
  }

  .lyrics-panel {
    width: 96%;
    max-height: 80vh;
  }

  .player-controls {
    padding: 8px 14px;
    gap: 10px;
  }

  .play-btn {
    width: 38px;
    height: 38px;
    font-size: 15px;
  }
}
</style>
