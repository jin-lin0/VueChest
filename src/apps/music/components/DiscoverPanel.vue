<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMusicStore, type Song, type Playlist } from '@/stores'
import FavoriteMenu from './FavoriteMenu.vue'

defineOptions({ name: 'DiscoverPanel' })

const music = useMusicStore()

// 发现页子视图：home（首页）/ artists（推荐歌手）/ rank（排行榜）
const subView = ref<'home' | 'artists' | 'rank'>('home')

const openPlaylist = async (pl: Playlist) => {
  await music.loadPlaylistTracks(pl.id, pl.server || 'netease')
  music.showPlaylist = true
}

const playSong = (song: Song) => {
  music.playSong(song, music.newSongs)
}

const onArtistClick = (e: Event, song: Song) => {
  e.stopPropagation()
  if (song.artistId) music.openArtist(song.artistId)
}

onMounted(() => {
  music.fetchDiscover()
  music.fetchPlaylistCats().then(() => music.fetchCatPlaylists(music.activeCat || '全部'))
  // 浅入口数据预取（缓存命中，不重复请求 toplist）
  music.fetchTopArtists()
  music.fetchTopBoards()
})
</script>

<template>
  <div class="discover-panel">
    <!-- ===== 浅入口：图标行（仅首页显示） ===== -->
    <div v-if="subView === 'home'" class="ms-entry-row">
      <button class="ms-entry" @click="subView = 'artists'">
        <span class="ms-entry-icon">🎤</span>
        <span class="ms-entry-label">推荐歌手</span>
      </button>
      <button class="ms-entry" @click="subView = 'rank'">
        <span class="ms-entry-icon">🏆</span>
        <span class="ms-entry-label">排行榜</span>
      </button>
    </div>

    <!-- ===== 推荐歌手子视图 ===== -->
    <template v-else-if="subView === 'artists'">
      <div class="ms-sub-head">
        <button class="ms-back" @click="subView = 'home'">&larr;</button>
        <h2>推荐歌手</h2>
      </div>

      <div class="ms-chips">
        <button
          v-for="c in music.artistCats"
          :key="c.cat"
          class="ms-chip"
          :class="{ active: music.activeArtistCat === c.cat }"
          @click="music.fetchArtistList(c.cat)"
        >
          {{ c.key }}
        </button>
      </div>

      <div v-if="music.isLoadingArtists && music.topArtists.length === 0" class="ms-loading">
        加载中...
      </div>
      <div v-else-if="music.topArtists.length === 0" class="ms-empty">暂无歌手</div>
      <div v-else class="ms-card-grid">
        <div
          v-for="a in music.topArtists"
          :key="a.id"
          class="ms-card"
          @click="music.openArtist(a.id)"
        >
          <div class="ms-card-cover round">
            <img v-if="a.picUrl" :src="a.picUrl + '?param=300y300'" alt="" loading="lazy" />
            <div v-else class="ms-cover-ph">🎤</div>
          </div>
          <div class="ms-card-name">{{ a.name }}</div>
        </div>
      </div>
    </template>

    <!-- ===== 排行榜子视图 ===== -->
    <template v-else-if="subView === 'rank'">
      <div class="ms-sub-head">
        <button class="ms-back" @click="subView = 'home'">&larr;</button>
        <h2>排行榜</h2>
      </div>

      <div v-if="music.isLoadingBoards && music.topBoards.length === 0" class="ms-loading">
        加载中...
      </div>
      <div v-else-if="music.topBoards.length === 0" class="ms-empty">暂无榜单</div>
      <div v-else class="ms-card-grid">
        <div
          v-for="b in music.topBoards"
          :key="b.id"
          class="ms-card"
          @click="openPlaylist(b)"
        >
          <div class="ms-card-cover">
            <img v-if="b.coverUrl" :src="b.coverUrl + '?param=300y300'" alt="" loading="lazy" />
            <div v-else class="ms-cover-ph">🎵</div>
            <span v-if="b.trackCount > 0" class="ms-card-badge">{{ b.trackCount }}首</span>
          </div>
          <div class="ms-card-name">{{ b.name }}</div>
        </div>
      </div>
    </template>

    <!-- ===== 发现首页区块 ===== -->
    <template v-if="subView === 'home'">
      <!-- 1. 推荐歌单 -->
      <section class="ms-section">
        <div class="ms-section-head">
          <div class="ms-section-title"><span class="ms-accent-bar"></span>推荐歌单</div>
        </div>
        <div v-if="music.isLoadingDiscover && music.personalizedPlaylists.length === 0" class="ms-loading">
          加载中...
        </div>
        <div v-else-if="music.personalizedPlaylists.length === 0" class="ms-empty">暂无推荐歌单</div>
        <div v-else class="ms-card-grid">
          <div
            v-for="pl in music.personalizedPlaylists"
            :key="pl.id"
            class="ms-card"
            @click="openPlaylist(pl)"
          >
            <div class="ms-card-cover">
              <img v-if="pl.coverUrl" :src="pl.coverUrl + '?param=300y300'" alt="" loading="lazy" />
              <div v-else class="ms-cover-ph">🎵</div>
              <span v-if="pl.trackCount > 0" class="ms-card-badge">{{ pl.trackCount }}首</span>
            </div>
            <div class="ms-card-name">{{ pl.name }}</div>
          </div>
        </div>
      </section>

      <!-- 2. 新歌速递 -->
      <section class="ms-section">
        <div class="ms-section-head">
          <div class="ms-section-title"><span class="ms-accent-bar"></span>新歌速递</div>
        </div>
        <div v-if="music.isLoadingDiscover && music.newSongs.length === 0" class="ms-loading">
          加载中...
        </div>
        <div v-else-if="music.newSongs.length === 0" class="ms-empty">暂无新歌</div>
        <div v-else class="ms-song-list">
          <div
            v-for="(song, index) in music.newSongs.slice(0, 12)"
            :key="song.id"
            class="ms-song-item"
            :class="{ playing: music.activeSong?.id === song.id }"
            @click="playSong(song)"
          >
            <span class="ms-song-index">{{ index + 1 }}</span>
            <img
              v-if="song.coverUrl"
              class="ms-song-cover"
              :src="song.coverUrl + '?param=100y100'"
              alt=""
              loading="lazy"
            />
            <div v-else class="ms-song-cover ms-cover-ph" style="font-size: 20px">🎵</div>
            <div class="ms-song-info">
              <div class="ms-song-name">
                {{ song.name }}
                <span v-if="song.sq" class="ms-tag ms-tag-sq">SQ</span>
                <span v-if="song.fee === 1" class="ms-tag ms-tag-vip">VIP</span>
                <span v-if="song.mvId" class="ms-tag ms-tag-mv">MV</span>
              </div>
              <div class="ms-song-artist">
                <span v-if="song.artistId" class="ms-link" @click="onArtistClick($event, song)">{{
                  song.artists
                }}</span>
                <template v-else>{{ song.artists }}</template>
                <template v-if="song.album"> - {{ song.album }}</template>
              </div>
            </div>
            <span v-if="song.duration" class="ms-song-duration">{{ music.formatDuration(song.duration) }}</span>
            <FavoriteMenu :song="song" />
          </div>
        </div>
      </section>

      <!-- 4. 歌单广场 -->
      <section class="ms-section">
        <div class="ms-section-head">
          <div class="ms-section-title"><span class="ms-accent-bar"></span>歌单广场</div>
        </div>
        <div class="ms-chips">
          <button
            v-for="cat in music.playlistCats"
            :key="cat"
            class="ms-chip"
            :class="{ active: music.activeCat === cat }"
            @click="music.fetchCatPlaylists(cat)"
          >
            {{ cat }}
          </button>
        </div>
        <div v-if="music.isLoadingCat" class="ms-loading">加载中...</div>
        <div v-else-if="music.catPlaylists.length === 0" class="ms-empty">暂无该分类歌单</div>
        <div v-else class="ms-card-grid">
          <div
            v-for="pl in music.catPlaylists"
            :key="pl.id"
            class="ms-card"
            @click="openPlaylist(pl)"
          >
            <div class="ms-card-cover">
              <img v-if="pl.coverUrl" :src="pl.coverUrl + '?param=300y300'" alt="" loading="lazy" />
              <div v-else class="ms-cover-ph">🎵</div>
              <span v-if="pl.trackCount > 0" class="ms-card-badge">{{ pl.trackCount }}首</span>
            </div>
            <div class="ms-card-name">{{ pl.name }}</div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.discover-panel {
  display: flex;
  flex-direction: column;
}

/* ===== 浅入口图标行 ===== */
.ms-entry-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  margin-bottom: 26px;
}

.ms-entry {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  cursor: pointer;
  text-align: left;
  transition:
    transform 0.2s,
    border-color 0.2s,
    box-shadow 0.2s;
}

.ms-entry:hover {
  transform: translateY(-3px);
  border-color: rgba(108, 92, 231, 0.35);
  box-shadow: 0 8px 28px rgba(108, 92, 231, 0.18);
}

.ms-entry-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--accent-gradient);
  font-size: 24px;
  box-shadow: 0 4px 14px rgba(108, 92, 231, 0.35);
}

.ms-entry-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

/* ===== 子视图头部 ===== */
.ms-sub-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.ms-sub-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}

.ms-back {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  transition: background 0.2s;
  flex-shrink: 0;
}

.ms-back:hover {
  background: var(--bg-card-hover);
}
</style>
