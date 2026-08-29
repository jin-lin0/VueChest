<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMusicStore, type FavoriteGroup } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import DiscoverPanel from './components/DiscoverPanel.vue'
import SearchPanel from './components/SearchPanel.vue'
import ArtistDetail from './components/ArtistDetail.vue'
import AlbumDetail from './components/AlbumDetail.vue'
import FavoriteMenu from './components/FavoriteMenu.vue'
import './components/music-shared.css'

defineOptions({ name: 'MusicView' })

const router = useRouter()
const music = useMusicStore()
const auth = useAuthStore()

const goBack = () => router.push('/')

const activeTab = ref<'discover' | 'search' | 'favorites' | 'history'>('discover')

// ===== 收藏分组展示 =====
const activeGroupId = ref<number | null>(null)

// 未登录时退化为本地“我的喜欢”；登录后展示服务端分组
const displayGroups = computed<FavoriteGroup[]>(() => {
  if (auth.isAuthenticated && music.groupsLoaded) {
    return music.favoriteGroups
  }
  return [{ id: 0, name: '我的喜欢', isDefault: true, songs: music.favorites }]
})

const currentGroup = computed<FavoriteGroup | null>(() => {
  const list = displayGroups.value
  return list.find((g) => g.id === activeGroupId.value) || list[0] || null
})

// 登录态变化时重新水合收藏分组
watch(
  () => auth.isAuthenticated,
  async (val) => {
    activeGroupId.value = null
    if (val) await music.loadFavoriteGroups()
  },
)

onMounted(async () => {
  if (auth.isAuthenticated) await music.loadFavoriteGroups()
})
</script>

<template>
  <div class="music-page vc-dark">
    <div class="music-page-inner">
      <!-- Header -->
      <div class="page-header">
        <button class="back-btn" @click="goBack">&larr;</button>
        <div class="music-title">
          <h1>音乐播放器</h1>
          <small>{{ music.playlist.length }} 首队列 · {{ music.favorites.length }} 首收藏</small>
        </div>
        <button class="header-queue" @click="music.showPlaylist = true">
          播放队列 {{ music.playlist.length }}
        </button>
      </div>

      <!-- Main content -->
      <div class="main-content vc-scrollbar vc-scrollbar--thin">
        <!-- Tabs -->
        <div class="tabs">
          <button :class="{ active: activeTab === 'discover' }" @click="activeTab = 'discover'">
            发现
          </button>
          <button :class="{ active: activeTab === 'search' }" @click="activeTab = 'search'">
            搜索
          </button>
          <button :class="{ active: activeTab === 'favorites' }" @click="activeTab = 'favorites'">
            我的收藏
          </button>
          <button :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">
            最近播放
          </button>
        </div>

        <!-- Discover -->
        <DiscoverPanel v-show="activeTab === 'discover'" />

        <!-- Search -->
        <SearchPanel v-show="activeTab === 'search'" />

        <!-- Favorites -->
        <div v-show="activeTab === 'favorites'" class="content-section">
          <!-- 分组切换（我的喜欢 + 用户自建分组） -->
          <div v-if="displayGroups.length" class="fav-group-tabs">
            <button
              v-for="g in displayGroups"
              :key="g.id"
              :class="{ active: currentGroup?.id === g.id }"
              @click="activeGroupId = g.id"
            >
              {{ g.name }}
              <span class="fav-count">{{ g.songs.length }}</span>
            </button>
          </div>

          <div v-if="!currentGroup || currentGroup.songs.length === 0" class="ms-empty">
            还没有收藏歌曲，搜索并点击心形图标收藏吧
          </div>
          <div v-else class="ms-song-list">
            <div
              v-for="(song, index) in currentGroup?.songs || []"
              :key="song.id"
              class="ms-song-item"
              :class="{ playing: music.activeSong?.id === song.id }"
              @click="music.playSong(song, currentGroup?.songs || [])"
            >
              <span class="ms-song-index">{{ index + 1 }}</span>
              <img
                v-if="song.coverUrl"
                :src="song.coverUrl + '?param=100y100'"
                class="ms-song-cover"
                alt=""
                loading="lazy"
              />
              <div class="ms-song-info">
                <div class="ms-song-name">{{ song.name }}</div>
                <div class="ms-song-artist">
                  <span
                    v-if="song.artistId"
                    class="ms-link"
                    @click.stop="music.openArtist(song.artistId)"
                    >{{ song.artists }}</span
                  >
                  <span v-else>{{ song.artists }}</span>
                  <template v-if="song.album">
                    -
                    <span
                      v-if="song.albumId"
                      class="ms-link"
                      @click.stop="music.openAlbum(song.albumId)"
                      >{{ song.album }}</span
                    >
                    <span v-else>{{ song.album }}</span>
                  </template>
                </div>
              </div>
              <span v-if="song.duration" class="ms-song-duration">{{
                music.formatDuration(song.duration)
              }}</span>
              <FavoriteMenu :song="song" />
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'history'" class="content-section history-section">
          <div class="history-heading">
            <div>
              <h2>最近播放</h2>
              <small>本机保留最近 {{ music.playHistory.length }} 首</small>
            </div>
            <button v-if="music.playHistory.length" @click="music.clearPlayHistory">
              清空记录
            </button>
          </div>
          <div v-if="!music.playHistory.length" class="ms-empty">暂无播放记录</div>
          <div v-else class="ms-song-list">
            <div
              v-for="(song, index) in music.playHistory"
              :key="song.id"
              class="ms-song-item"
              :class="{ playing: music.activeSong?.id === song.id }"
              @click="music.playSong(song)"
            >
              <span class="ms-song-index">{{ index + 1 }}</span>
              <img
                v-if="song.coverUrl"
                :src="song.coverUrl + '?param=100y100'"
                class="ms-song-cover"
                alt=""
                loading="lazy"
              />
              <div class="ms-song-info">
                <div class="ms-song-name">{{ song.name }}</div>
                <div class="ms-song-artist">{{ song.artists }} · {{ song.album }}</div>
              </div>
              <span v-if="song.duration" class="ms-song-duration">{{
                music.formatDuration(song.duration)
              }}</span>
              <button
                class="history-remove"
                aria-label="移除播放记录"
                @click.stop="music.removePlayHistoryItem(song.id)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail overlays -->
    <ArtistDetail v-if="music.detailView === 'artist'" />
    <AlbumDetail v-if="music.detailView === 'album'" />
  </div>
</template>

<style scoped>
/* ===== Theme Variables ===== */
.music-page {
  --accent-light: #a29bfe;
  --accent-gradient: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
  --accent-gradient-vivid: linear-gradient(135deg, #6c5ce7 0%, #fd79a8 100%);
  --bg: #141423;
  --bg-card: rgba(255, 255, 255, 0.06);
  --bg-card-hover: rgba(255, 255, 255, 0.1);
  --bg-surface: rgba(255, 255, 255, 0.04);
  --bg-popover: #181826;
  --text: #f0f0f5;
  --text-secondary: #8888a0;
  --text-dim: #55556a;
  --border: rgba(255, 255, 255, 0.08);
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 18px;

  width: 100%;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', sans-serif;
}

.music-page-inner {
  max-width: 1060px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* ===== Header (glassmorphism) ===== */
.page-header {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  background: rgba(20, 20, 35, 0.78);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  color: var(--text);
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid var(--border);
}

.music-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  line-height: 1.2;
}
.music-title small {
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
}
.header-queue {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text);
  cursor: pointer;
  font-size: var(--font-size-meta);
}
.history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.history-heading h2 {
  margin: 0;
  font-size: var(--font-size-title-lg);
}
.history-heading small {
  color: var(--text-secondary);
}
.history-heading button,
.history-remove {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.history-remove {
  padding: 8px;
  font-size: var(--font-size-title-lg);
}

.back-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: var(--font-size-title-lg);
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
  font-size: var(--font-size-title-lg);
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
  font-size: var(--font-size-body);
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

/* ===== 收藏分组标签页 ===== */
.fav-group-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.fav-group-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  font-size: var(--font-size-control);
  font-weight: 500;
  background: var(--bg-card);
  color: var(--text-secondary);
  transition: all 0.2s;
}

.fav-group-tabs button:hover {
  color: var(--text);
  background: var(--bg-card-hover);
}

.fav-group-tabs button.active {
  background: var(--accent-gradient);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 12px rgba(108, 92, 231, 0.3);
}

.fav-count {
  font-size: var(--font-size-meta);
  opacity: 0.7;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 999px;
  padding: 1px 7px;
  min-width: 18px;
  text-align: center;
}

.fav-group-tabs button.active .fav-count {
  background: rgba(255, 255, 255, 0.22);
}

/* ===== Responsive ===== */
@media (max-width: 640px) {
  .main-content {
    padding: 14px;
  }
}
</style>
