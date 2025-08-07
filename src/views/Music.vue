<script setup lang="ts">
import { ref, defineComponent, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

// 定义多词组件名称
defineComponent({
  name: 'MusicView',
})

interface Song {
  id: number
  title: string
  artist: string
  album: string
  cover: string
  duration: number // 秒数
  url: string
}

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const songs = ref<Song[]>([
  {
    id: 1,
    title: '罗生门',
    artist: '张子豪',
    album: '罗生门',
    cover: 'https://picsum.photos/id/6/300/300',
    duration: 243,
    url: 'https://m701.music.126.net/20250808024717/80130da9f6c40662b3dc91a17ce9381a/jdymusic/obj/wo3DlMOGwrbDjj7DisKw/14096444542/bafc/a068/39f8/9a9e06e5634410b5e7e81df24749e656.mp3?vuutv=wkn0fQpH9DZceJ9ph7NncBhOMwEGVjGH+KzQxBbfVlT+J9mRdHzeRyl09IbX7/joyPZv407F6XeaDL6cy43JefHSMRl67BzMcqrEfxNQGiw=',
  },
])

const currentSongId = ref<number | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const volume = ref(0.7)
const audioElement = ref<HTMLAudioElement | null>(null)
const isRepeat = ref(false)
const isShuffle = ref(false)

const currentSong = computed(() => {
  if (currentSongId.value === null) return null
  return songs.value.find((song) => song.id === currentSongId.value) || null
})

const progress = computed(() => {
  if (!currentSong.value) return 0
  return (currentTime.value / currentSong.value.duration) * 100
})

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

const playSong = (id: number) => {
  currentSongId.value = id
  isPlaying.value = true
  currentTime.value = 0

  // 在下一个事件循环中设置音频元素，确保DOM已更新
  setTimeout(() => {
    if (audioElement.value) {
      audioElement.value.currentTime = 0
      audioElement.value.play()
    }
  }, 0)
}

const togglePlay = () => {
  if (!currentSong.value) {
    // 如果没有当前歌曲，播放第一首
    if (songs.value.length > 0) {
      playSong(songs.value[0].id)
    }
    return
  }

  isPlaying.value = !isPlaying.value

  if (audioElement.value) {
    if (isPlaying.value) {
      audioElement.value.play()
    } else {
      audioElement.value.pause()
    }
  }
}

const nextSong = () => {
  if (!currentSong.value || songs.value.length <= 1) return

  let nextIndex = 0

  if (isShuffle.value) {
    // 随机播放模式
    let randomIndex
    do {
      randomIndex = Math.floor(Math.random() * songs.value.length)
    } while (songs.value[randomIndex].id === currentSongId.value && songs.value.length > 1)
    nextIndex = randomIndex
  } else {
    // 顺序播放模式
    const currentIndex = songs.value.findIndex((song) => song.id === currentSongId.value)
    nextIndex = (currentIndex + 1) % songs.value.length
  }

  playSong(songs.value[nextIndex].id)
}

const prevSong = () => {
  if (!currentSong.value || songs.value.length <= 1) return

  const currentIndex = songs.value.findIndex((song) => song.id === currentSongId.value)
  let prevIndex

  if (isShuffle.value) {
    // 随机播放模式
    let randomIndex
    do {
      randomIndex = Math.floor(Math.random() * songs.value.length)
    } while (songs.value[randomIndex].id === currentSongId.value && songs.value.length > 1)
    prevIndex = randomIndex
  } else {
    // 顺序播放模式
    prevIndex = (currentIndex - 1 + songs.value.length) % songs.value.length
  }

  playSong(songs.value[prevIndex].id)
}

const updateProgress = (e: Event) => {
  const target = e.target as HTMLInputElement
  const seekTime = (parseFloat(target.value) / 100) * (currentSong.value?.duration || 0)
  currentTime.value = seekTime

  if (audioElement.value) {
    audioElement.value.currentTime = seekTime
  }
}

const updateVolume = (e: Event) => {
  const target = e.target as HTMLInputElement
  volume.value = parseFloat(target.value)

  if (audioElement.value) {
    audioElement.value.volume = volume.value
  }
}

const toggleRepeat = () => {
  isRepeat.value = !isRepeat.value
}

const toggleShuffle = () => {
  isShuffle.value = !isShuffle.value
}

const handleTimeUpdate = () => {
  if (audioElement.value) {
    currentTime.value = audioElement.value.currentTime
  }
}

const handleEnded = () => {
  if (isRepeat.value) {
    // 单曲循环
    if (audioElement.value) {
      audioElement.value.currentTime = 0
      audioElement.value.play()
    }
  } else {
    // 播放下一首
    nextSong()
  }
}

onMounted(() => {
  audioElement.value = document.querySelector('#audio-player')

  if (audioElement.value) {
    audioElement.value.volume = volume.value
    audioElement.value.addEventListener('timeupdate', handleTimeUpdate)
    audioElement.value.addEventListener('ended', handleEnded)
  }
})

onUnmounted(() => {
  if (audioElement.value) {
    audioElement.value.removeEventListener('timeupdate', handleTimeUpdate)
    audioElement.value.removeEventListener('ended', handleEnded)
  }
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>音乐播放器</h1>
    </header>

    <main class="music-content">
      <div class="music-player">
        <div class="now-playing">
          <div class="album-cover" :class="{ rotating: isPlaying }">
            <img v-if="currentSong" :src="currentSong.cover" :alt="currentSong.title" />
            <div v-else class="no-cover">选择歌曲</div>
          </div>

          <div class="song-info">
            <h2>{{ currentSong?.title || '未选择歌曲' }}</h2>
            <p>{{ currentSong?.artist || '点击下方列表播放' }}</p>
            <p class="album-name">{{ currentSong?.album || '' }}</p>
          </div>
        </div>

        <div class="player-controls">
          <div class="progress-container">
            <span class="time">{{ formatTime(currentTime) }}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              :value="progress"
              @input="updateProgress"
              class="progress-bar"
            />
            <span class="time">{{ currentSong ? formatTime(currentSong.duration) : '0:00' }}</span>
          </div>

          <div class="control-buttons">
            <button class="control-button" :class="{ active: isShuffle }" @click="toggleShuffle">
              🔀
            </button>
            <button class="control-button" @click="prevSong">⏮️</button>
            <button class="play-button" @click="togglePlay">
              {{ isPlaying ? '⏸️' : '▶️' }}
            </button>
            <button class="control-button" @click="nextSong">⏭️</button>
            <button class="control-button" :class="{ active: isRepeat }" @click="toggleRepeat">
              🔁
            </button>
          </div>

          <div class="volume-container">
            <span class="volume-icon">🔊</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="volume"
              @input="updateVolume"
              class="volume-bar"
            />
          </div>
        </div>
      </div>

      <div class="song-list">
        <h3>播放列表</h3>
        <div class="list-container">
          <div
            v-for="song in songs"
            :key="song.id"
            class="song-item"
            :class="{ active: currentSongId === song.id }"
            @click="playSong(song.id)"
          >
            <div class="song-cover">
              <img :src="song.cover" :alt="song.title" />
              <div class="play-indicator" v-if="currentSongId === song.id && isPlaying">▶️</div>
            </div>
            <div class="song-details">
              <div class="song-title">{{ song.title }}</div>
              <div class="song-artist">{{ song.artist }}</div>
            </div>
            <div class="song-duration">{{ formatTime(song.duration) }}</div>
          </div>
        </div>
      </div>
    </main>

    <!-- 隐藏的音频元素 -->
    <audio id="audio-player" :src="currentSong?.url"></audio>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.back-button {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}

.back-button:hover {
  background-color: #2980b9;
}

.app-header h1 {
  margin: 0;
  font-size: 2rem;
  color: #2c3e50;
}

.music-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.music-player {
  background-color: #fff;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.now-playing {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.album-cover {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  overflow: hidden;
  margin-right: 2rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-cover {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #ddd;
  color: #666;
  font-weight: bold;
}

.rotating {
  animation: rotate 20s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.song-info {
  flex: 1;
}

.song-info h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.8rem;
  color: #2c3e50;
}

.song-info p {
  margin: 0 0 0.3rem 0;
  font-size: 1.2rem;
  color: #7f8c8d;
}

.album-name {
  font-size: 1rem !important;
  color: #95a5a6 !important;
}

.player-controls {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.time {
  font-size: 0.9rem;
  color: #7f8c8d;
  width: 45px;
  text-align: center;
}

.progress-bar {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #ddd;
  border-radius: 3px;
  outline: none;
}

.progress-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #3498db;
  border-radius: 50%;
  cursor: pointer;
}

.control-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
}

.control-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #7f8c8d;
  transition: color 0.2s;
}

.control-button:hover {
  color: #2c3e50;
}

.control-button.active {
  color: #3498db;
}

.play-button {
  background-color: #3498db;
  color: white;
  border: none;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  font-size: 1.8rem;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: background-color 0.2s;
}

.play-button:hover {
  background-color: #2980b9;
}

.volume-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.volume-icon {
  font-size: 1.2rem;
  color: #7f8c8d;
}

.volume-bar {
  width: 100px;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #ddd;
  border-radius: 3px;
  outline: none;
}

.volume-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #3498db;
  border-radius: 50%;
  cursor: pointer;
}

.song-list {
  background-color: #fff;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.song-list h3 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
}

.list-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.song-item {
  display: flex;
  align-items: center;
  padding: 0.8rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.song-item:hover {
  background-color: #f5f5f5;
}

.song-item.active {
  background-color: #e3f2fd;
}

.song-cover {
  width: 50px;
  height: 50px;
  border-radius: 4px;
  overflow: hidden;
  margin-right: 1rem;
  position: relative;
}

.song-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.play-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
}

.song-details {
  flex: 1;
}

.song-title {
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 0.3rem;
}

.song-artist {
  font-size: 0.9rem;
  color: #7f8c8d;
}

.song-duration {
  font-size: 0.9rem;
  color: #95a5a6;
}
</style>
