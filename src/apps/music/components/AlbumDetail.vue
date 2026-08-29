<script setup lang="ts">
import { ref } from 'vue'
import { useMusicStore, type Song } from '@/stores'
import { Skeleton } from '@/components'
import FavoriteMenu from './FavoriteMenu.vue'

defineOptions({ name: 'AlbumDetail' })

const music = useMusicStore()

// 简介展开 / 收起
const descExpanded = ref(false)

// 返回：从歌手页进入则回到歌手页，否则关闭详情
const goBack = () => {
  if (music.currentArtist) {
    music.detailView = 'artist'
  } else {
    music.closeDetail()
  }
}

const onPlayAll = () => {
  const first = music.albumSongs[0]
  if (first) music.playSong(first, music.albumSongs)
}

const onArtistClick = () => {
  const id = music.albumSongs[0]?.artistId || ''
  if (id) music.openArtist(id)
}

const onPlay = (song: Song) => {
  music.playSong(song, music.albumSongs)
}

const formatPublishDate = (ms?: number): string => {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('zh-CN')
}
</script>

<template>
  <div class="album-detail">
    <!-- 顶部返回栏 -->
    <div class="ad-topbar">
      <button class="ad-back" @click="goBack">←</button>
      <span class="ad-topbar-title">{{ music.currentAlbum?.name }}</span>
    </div>

    <!-- 整页加载（loading 且无数据） -->
    <div v-if="music.isLoadingAlbum && !music.currentAlbum" class="ms-loading ms-skel">
      <Skeleton :width="200" :height="14" text />
      <Skeleton :width="160" :height="14" text />
    </div>

    <template v-else-if="music.currentAlbum">
      <!-- 专辑头部 -->
      <div class="ad-header">
        <img
          v-if="music.currentAlbum.picUrl"
          :src="music.currentAlbum.picUrl + '?param=400y400'"
          class="ad-cover"
          alt=""
        />
        <div v-else class="ad-cover ad-cover-ph">♪</div>

        <div class="ad-meta">
          <div class="ad-type">专辑</div>
          <h1 class="ad-name">{{ music.currentAlbum.name }}</h1>

          <div class="ad-artist-row">
            <span
              v-if="music.albumSongs[0]?.artistId"
              class="ms-link ad-artist"
              @click="onArtistClick"
              >{{ music.currentAlbum.artist || music.albumSongs[0]?.artists }}</span
            >
            <span v-else class="ad-artist">{{ music.currentAlbum.artist || '未知歌手' }}</span>
          </div>

          <div class="ad-info">
            <span v-if="music.currentAlbum.publishTime"
              >发行：{{ formatPublishDate(music.currentAlbum.publishTime) }}</span
            >
            <span v-if="music.currentAlbum.size != null"> · {{ music.currentAlbum.size }} 首</span>
            <span v-if="music.currentAlbum.company"> · {{ music.currentAlbum.company }}</span>
          </div>

          <button v-if="music.albumSongs.length > 0" class="ad-playall" @click="onPlayAll">
            ▶ 播放全部
          </button>

          <!-- 简介 -->
          <div v-if="music.currentAlbum.description" class="ad-desc">
            <p class="ad-desc-text" :class="{ collapsed: !descExpanded }">
              {{ music.currentAlbum.description }}
            </p>
            <button class="ad-desc-toggle" @click="descExpanded = !descExpanded">
              {{ descExpanded ? '收起' : '展开' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 曲目列表 -->
      <div class="ms-section">
        <div class="ms-section-head">
          <div class="ms-section-title">
            <span class="ms-accent-bar"></span>曲目 ({{ music.albumSongs.length }})
          </div>
        </div>

        <div v-if="music.albumSongs.length > 0" class="ms-song-list">
          <div
            v-for="(song, index) in music.albumSongs"
            :key="song.id"
            class="ms-song-item"
            :class="{ playing: music.activeSong?.id === song.id }"
            @click="onPlay(song)"
          >
            <span class="ms-song-index">{{ index + 1 }}</span>
            <div class="ms-song-info">
              <div class="ms-song-name">
                {{ song.name }}
                <span v-if="song.sq" class="ms-tag ms-tag-sq">SQ</span>
                <span v-if="song.fee === 1" class="ms-tag ms-tag-vip">VIP</span>
                <span v-if="song.mvId" class="ms-tag ms-tag-mv">MV</span>
              </div>
              <div class="ms-song-artist">{{ song.artists }}</div>
            </div>
            <span v-if="song.duration" class="ms-song-duration">{{
              music.formatDuration(song.duration)
            }}</span>
            <FavoriteMenu :song="song" />
          </div>
        </div>

        <div v-else class="ms-empty">暂无曲目</div>
      </div>
    </template>

    <div v-else class="ms-empty">未找到专辑信息</div>
  </div>
</template>

<style scoped>
.album-detail {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 1060px;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
  z-index: 150;
  overflow-y: auto;
  padding: 0 20px 120px;
}

/* 顶部返回栏（吸顶） */
.ad-topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 0;
  margin-bottom: 10px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.ad-back {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text);
  font-size: var(--font-size-title-lg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.2s,
    border-color 0.2s,
    color 0.2s;
}

.ad-back:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent);
  color: var(--accent);
}

.ad-topbar-title {
  font-size: var(--font-size-title);
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 专辑头部 */
.ad-header {
  display: flex;
  gap: 28px;
  padding: 8px 0 24px;
}

.ad-cover {
  width: 220px;
  height: 220px;
  border-radius: var(--radius);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-surface);
  box-shadow: var(--shadow);
}

.ad-cover-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-display-md);
  color: var(--text-dim);
  background: var(--accent-gradient-vivid);
}

.ad-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ad-type {
  font-size: var(--font-size-small);
  color: var(--accent);
  font-weight: 600;
  letter-spacing: 2px;
}

.ad-name {
  font-size: var(--font-size-6xl);
  font-weight: 800;
  line-height: 1.2;
  margin: 0;
  color: var(--text);
}

.ad-artist {
  font-size: var(--font-size-body-lg);
  color: var(--text-secondary);
}

.ad-info {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: var(--font-size-control);
  color: var(--text-dim);
}

.ad-playall {
  align-self: flex-start;
  margin-top: 4px;
  padding: 10px 22px;
  border: none;
  border-radius: 24px;
  background: var(--accent-gradient);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.ad-playall:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(108, 92, 231, 0.35);
}

/* 简介 */
.ad-desc {
  margin-top: 4px;
}

.ad-desc-text {
  margin: 0;
  font-size: var(--font-size-control);
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-line;
}

.ad-desc-text.collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ad-desc-toggle {
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-size: var(--font-size-control);
  cursor: pointer;
  transition: opacity 0.2s;
}

.ad-desc-toggle:hover {
  opacity: 0.8;
}
</style>
