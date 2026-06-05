<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMusicStore } from '@/stores'
import { debounce } from '@/utils'

defineOptions({ name: 'MusicView' })

const router = useRouter()
const music = useMusicStore()

const goBack = () => router.push('/')

// --- Refs ---
const searchInput = ref('')
const activeTab = ref<'search' | 'recommend' | 'favorites'>('recommend')

// --- Search ---
const doSearch = debounce(() => {
  if (searchInput.value.trim()) {
    music.searchSongs(searchInput.value)
    activeTab.value = 'search'
  }
}, 400)

const onSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && searchInput.value.trim()) {
    music.searchSongs(searchInput.value)
    activeTab.value = 'search'
  }
}

const searchFromHistory = (keyword: string) => {
  searchInput.value = keyword
  music.searchSongs(keyword)
  activeTab.value = 'search'
}

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// --- Play a song from search results ---
const playFromResults = (song: (typeof music.searchResults)[0]) => {
  music.playSong(song, music.searchResults)
}

const playFromFavorites = (song: (typeof music.favorites)[0]) => {
  music.playSong(song, music.favorites)
}

// --- Recommend playlists ---
const loadPlaylist = async (pl: (typeof music.recommendPlaylists)[0]) => {
  await music.loadPlaylistTracks(pl.id, pl.server || 'netease')
  music.showPlaylist = true
}

onMounted(() => {
  music.fetchRecommendPlaylists()
})
</script>

<template>
  <div class="music-page">
    <!-- Header -->
    <div class="page-header">
      <button class="back-btn" @click="goBack">&larr;</button>
      <h1>音乐播放器</h1>
    </div>

    <!-- Main content -->
    <div class="main-content" :class="{ 'has-player': music.activeSong }">
      <!-- Search bar -->
      <div class="search-bar">
        <input
          v-model="searchInput"
          type="text"
          placeholder="搜索歌曲、歌手..."
          @input="doSearch"
          @keydown="onSearchKeydown"
        />
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button :class="{ active: activeTab === 'recommend' }" @click="activeTab = 'recommend'">
          推荐歌单
        </button>
        <button :class="{ active: activeTab === 'search' }" @click="activeTab = 'search'">
          搜索结果
        </button>
        <button :class="{ active: activeTab === 'favorites' }" @click="activeTab = 'favorites'">
          我的收藏
        </button>
      </div>

      <!-- Recommend playlists -->
      <div v-if="activeTab === 'recommend'" class="content-section">
        <div v-if="music.isLoadingRecommend" class="loading">加载中...</div>
        <div v-else class="playlist-grid">
          <div
            v-for="pl in music.recommendPlaylists"
            :key="pl.id"
            class="playlist-card"
            @click="loadPlaylist(pl)"
          >
            <div class="playlist-cover">
              <img v-if="pl.coverUrl" :src="pl.coverUrl" alt="" loading="lazy" />
              <div v-else class="cover-placeholder">🎵</div>
              <span v-if="pl.trackCount" class="track-count">{{ pl.trackCount }}首</span>
            </div>
            <div class="playlist-name">{{ pl.name }}</div>
          </div>
        </div>
      </div>

      <!-- Search results -->
      <div v-if="activeTab === 'search'" class="content-section">
        <div v-if="music.isSearching" class="loading">搜索中...</div>
        <template v-else-if="music.searchResults.length > 0">
          <div class="result-count">共 {{ music.searchResults.length }} 首</div>
          <div class="song-list">
            <div
              v-for="(song, index) in music.searchResults"
              :key="song.id"
              class="song-item"
              :class="{ playing: music.activeSong?.id === song.id }"
              @click="playFromResults(song)"
            >
              <span class="song-index">{{ index + 1 }}</span>
              <div class="song-info">
                <div class="song-name">
                  {{ song.name }}
                  <span v-if="song.sq" class="tag-sq">SQ</span>
                  <span v-if="song.fee === 1" class="tag-vip">VIP</span>
                  <span v-if="song.mvId" class="tag-mv">MV</span>
                </div>
                <div class="song-artist">{{ song.artists }} - {{ song.album }}</div>
              </div>
              <span v-if="song.duration" class="song-duration">{{
                formatDuration(song.duration)
              }}</span>
              <button
                class="fav-btn-small"
                :class="{ favorited: music.isFavoriteSong(song.id) }"
                @click.stop="music.toggleFavoriteSong(song)"
              >
                {{ music.isFavoriteSong(song.id) ? '❤️' : '🤍' }}
              </button>
            </div>
          </div>
        </template>
        <div v-else-if="music.searchQuery && !music.isSearching" class="empty-state">
          未找到相关歌曲
        </div>
        <div v-else class="search-history-section">
          <div v-if="music.searchHistory.length > 0" class="history-header">
            <span>搜索历史</span>
            <button @click="music.clearSearchHistory()">清空</button>
          </div>
          <div class="history-tags">
            <span
              v-for="item in music.searchHistory"
              :key="item"
              class="history-tag"
              @click="searchFromHistory(item)"
            >
              {{ item }}
              <button class="history-remove" @click.stop="music.removeSearchHistory(item)">
                &times;
              </button>
            </span>
          </div>
        </div>
      </div>

      <!-- Favorites -->
      <div v-if="activeTab === 'favorites'" class="content-section">
        <div v-if="music.favorites.length === 0" class="empty-state">
          还没有收藏歌曲，搜索并点击心形图标收藏吧
        </div>
        <div v-else class="song-list">
          <div
            v-for="(song, index) in music.favorites"
            :key="song.id"
            class="song-item"
            :class="{ playing: music.activeSong?.id === song.id }"
            @click="playFromFavorites(song)"
          >
            <span class="song-index">{{ index + 1 }}</span>
            <div class="song-info">
              <div class="song-name">{{ song.name }}</div>
              <div class="song-artist">{{ song.artists }} - {{ song.album }}</div>
            </div>
            <button class="fav-btn-small favorited" @click.stop="music.toggleFavoriteSong(song)">
              ❤️
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== Theme Variables ===== */
.music-page {
  --accent: #6c5ce7;
  --accent-light: #a29bfe;
  --accent-gradient: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
  --accent-gradient-vivid: linear-gradient(135deg, #6c5ce7 0%, #fd79a8 100%);
  --bg: #0f0f1a;
  --bg-card: rgba(255, 255, 255, 0.06);
  --bg-card-hover: rgba(255, 255, 255, 0.1);
  --bg-surface: rgba(255, 255, 255, 0.04);
  --text: #f0f0f5;
  --text-secondary: #8888a0;
  --text-dim: #55556a;
  --border: rgba(255, 255, 255, 0.08);
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 18px;

  max-width: 1060px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', sans-serif;
}

/* ===== Header (glassmorphism) ===== */
.page-header {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  background: rgba(15, 15, 26, 0.75);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  color: var(--text);
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid var(--border);
}

.back-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  transition: background 0.2s;
}

.back-btn:hover {
  background: var(--bg-card-hover);
}

.page-header h1 {
  flex: 1;
  font-size: 18px;
  margin: 0;
  font-weight: 600;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ===== Main Content ===== */
.main-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.main-content.has-player {
  padding-bottom: 110px;
}

/* ===== Search Bar ===== */
.search-bar {
  margin-bottom: 20px;
}

.search-bar input {
  width: 100%;
  padding: 12px 20px;
  border: 1px solid var(--border);
  border-radius: 28px;
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
  background: var(--bg-card);
  color: var(--text);
  backdrop-filter: blur(10px);
  transition:
    border-color 0.25s,
    box-shadow 0.25s,
    background 0.25s;
}

.search-bar input::placeholder {
  color: var(--text-dim);
}

.search-bar input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.15);
  background: rgba(255, 255, 255, 0.08);
}

/* ===== Tabs ===== */
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  background: var(--bg-card);
  border-radius: 14px;
  padding: 5px;
  border: 1px solid var(--border);
}

.tabs button {
  flex: 1;
  padding: 9px 14px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.25s;
}

.tabs button:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}

.tabs button.active {
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: 0 2px 12px rgba(108, 92, 231, 0.35);
}

/* ===== Playlist Grid ===== */
.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}

.playlist-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.25s,
    box-shadow 0.25s,
    border-color 0.25s;
}

.playlist-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 8px 30px rgba(108, 92, 231, 0.2);
  border-color: rgba(108, 92, 231, 0.3);
}

.playlist-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
}

.playlist-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s;
}

.playlist-card:hover .playlist-cover img {
  transform: scale(1.06);
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-gradient-vivid);
  font-size: 44px;
}

.track-count {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
  color: white;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.playlist-name {
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ===== Song List ===== */
.song-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

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

.song-artist {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-duration {
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.song-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.tag-sq,
.tag-vip,
.tag-mv {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
  flex-shrink: 0;
}

.tag-sq {
  background: linear-gradient(135deg, #f093fb, #f5576c);
  color: #fff;
}

.tag-vip {
  background: linear-gradient(135deg, #f6d365, #fda085);
  color: #7c3aed;
}

.tag-mv {
  background: rgba(108, 92, 231, 0.15);
  color: var(--accent-light);
}

.fav-btn-small {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  flex-shrink: 0;
  opacity: 0.5;
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.fav-btn-small:hover {
  opacity: 1;
  transform: scale(1.15);
}

.fav-btn-small.favorited {
  opacity: 1;
}

.result-count {
  font-size: 13px;
  color: var(--text-dim);
  margin-bottom: 10px;
}

/* ===== Search History ===== */
.search-history-section {
  padding: 8px 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.history-header span {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.history-header button {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  transition: color 0.2s;
}

.history-header button:hover {
  color: var(--text);
}

.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-tag {
  padding: 6px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
}

.history-tag:hover {
  background: rgba(108, 92, 231, 0.12);
  color: var(--accent-light);
  border-color: rgba(108, 92, 231, 0.3);
}

.history-remove {
  margin-left: 6px;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.history-remove:hover {
  color: #fd79a8;
}

/* ===== Empty / Loading ===== */
.loading {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-dim);
  font-size: 14px;
}

.loading::before {
  content: '';
  display: block;
  width: 28px;
  height: 28px;
  margin: 0 auto 12px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-dim);
  font-size: 14px;
}

/* ===== Scrollbar ===== */
.main-content::-webkit-scrollbar {
  width: 5px;
}

.main-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
}

/* ===== Responsive ===== */
@media (max-width: 640px) {
  .main-content {
    padding: 14px;
  }

  .playlist-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
  }
}
</style>
