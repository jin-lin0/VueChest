<script setup lang="ts">
import { ref } from 'vue'
import { useMusicStore, type Album } from '@/stores'
import { Skeleton } from '@/components'
import FavoriteMenu from './FavoriteMenu.vue'

defineOptions({ name: 'ArtistDetail' })

const music = useMusicStore()

const descExpanded = ref(false)

const playAll = () => {
  const list = music.artistHotSongs
  if (list.length > 0) {
    music.playSong(list[0], list)
  }
}

const albumYear = (album: Album): number => new Date(album.publishTime as number).getFullYear()
</script>

<template>
  <div class="artist-detail">
    <!-- 顶部返回栏 -->
    <div class="artist-bar">
      <button class="artist-back" @click="music.closeDetail()">←</button>
      <span class="artist-bar-title">歌手详情</span>
    </div>

    <!-- 加载中 -->
    <div v-if="music.isLoadingArtist && !music.currentArtist" class="ms-loading ms-skel">
      <Skeleton :width="200" :height="14" text />
      <Skeleton :width="160" :height="14" text />
    </div>

    <!-- 内容 -->
    <template v-else-if="music.currentArtist">
      <!-- 歌手头图区 -->
      <div class="artist-header">
        <div class="artist-avatar">
          <img
            v-if="music.currentArtist.picUrl"
            :src="music.currentArtist.picUrl + '?param=400y400'"
            :alt="music.currentArtist.name"
          />
          <div v-else class="ms-cover-ph round">💿</div>
        </div>
        <div class="artist-meta">
          <h1 class="artist-name">{{ music.currentArtist.name }}</h1>
          <div v-if="music.currentArtist.musicSize != null || music.currentArtist.albumSize != null" class="artist-stats">
            <span v-if="music.currentArtist.musicSize != null">{{ music.currentArtist.musicSize }} 首歌</span>
            <span v-if="music.currentArtist.musicSize != null && music.currentArtist.albumSize != null"> · </span>
            <span v-if="music.currentArtist.albumSize != null">{{ music.currentArtist.albumSize }} 张专辑</span>
          </div>
          <p
            v-if="music.currentArtist.briefDesc"
            class="artist-desc"
            :class="{ clamp: !descExpanded }"
          >{{ music.currentArtist.briefDesc }}</p>
          <button
            v-if="music.currentArtist.briefDesc"
            class="desc-toggle"
            @click="descExpanded = !descExpanded"
          >{{ descExpanded ? '收起' : '展开' }}</button>
        </div>
      </div>

      <!-- 热门歌曲 -->
      <div class="ms-section">
        <div class="ms-section-head">
          <div class="ms-section-title"><span class="ms-accent-bar"></span>热门歌曲</div>
          <button
            v-if="music.artistHotSongs.length > 0"
            class="ms-section-more"
            @click="playAll()"
          >播放全部</button>
        </div>

        <div v-if="music.artistHotSongs.length > 0" class="ms-song-list">
          <div
            v-for="(song, index) in music.artistHotSongs"
            :key="song.id"
            class="ms-song-item"
            :class="{ playing: music.activeSong?.id === song.id }"
            @click="music.playSong(song, music.artistHotSongs)"
          >
            <span class="ms-song-index">{{ index + 1 }}</span>
            <img
              v-if="song.coverUrl"
              :src="song.coverUrl + '?param=100y100'"
              class="ms-song-cover"
              alt=""
            />
            <div v-else class="ms-song-cover ms-cover-ph">💿</div>
            <div class="ms-song-info">
              <div class="ms-song-name">
                {{ song.name }}
                <span v-if="song.sq" class="ms-tag ms-tag-sq">SQ</span>
                <span v-if="song.fee === 1" class="ms-tag ms-tag-vip">VIP</span>
                <span v-if="song.mvId" class="ms-tag ms-tag-mv">MV</span>
              </div>
              <div class="ms-song-artist">{{ song.artists }} - {{ song.album }}</div>
            </div>
            <span v-if="song.duration" class="ms-song-duration">{{
              music.formatDuration(song.duration)
            }}</span>
            <FavoriteMenu :song="song" />
          </div>
        </div>
        <div v-else class="ms-empty">暂无热门歌曲</div>
      </div>

      <!-- 专辑 -->
      <div class="ms-section">
        <div class="ms-section-head">
          <div class="ms-section-title"><span class="ms-accent-bar"></span>专辑</div>
        </div>

        <div v-if="music.artistAlbums.length > 0" class="ms-card-grid">
          <div
            v-for="album in music.artistAlbums"
            :key="album.id"
            class="ms-card"
            @click="music.openAlbum(album.id)"
          >
            <div class="ms-card-cover">
              <img
                v-if="album.picUrl"
                :src="album.picUrl + '?param=300y300'"
                :alt="album.name"
              />
              <div v-else class="ms-cover-ph">💿</div>
            </div>
            <div class="ms-card-name">{{ album.name }}</div>
            <div v-if="album.publishTime" class="ms-card-sub">{{ albumYear(album) }} 年</div>
          </div>
        </div>
        <div v-else class="ms-empty">暂无专辑</div>
      </div>
    </template>

    <!-- 加载失败 / 无数据 -->
    <div v-else class="ms-empty">未找到歌手信息</div>
  </div>
</template>

<style scoped>
.artist-detail {
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
  animation: artist-fade-in 0.28s ease;
}

@keyframes artist-fade-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 顶部返回栏 */
.artist-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  margin: 0 -20px 18px;
  padding: 0 20px;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
}

.artist-back {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s,
    transform 0.2s;
}

.artist-back:hover {
  background: var(--bg-card-hover);
  border-color: rgba(108, 92, 231, 0.4);
  transform: scale(1.05);
}

.artist-bar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* 歌手头图区 */
.artist-header {
  display: flex;
  align-items: center;
  gap: 28px;
  margin-bottom: 30px;
}

.artist-avatar {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--accent-gradient-vivid);
  box-shadow: 0 8px 30px rgba(108, 92, 231, 0.28);
  border: 2px solid rgba(255, 255, 255, 0.12);
}

.artist-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.artist-meta {
  flex: 1;
  min-width: 0;
}

.artist-name {
  font-size: 30px;
  font-weight: 800;
  color: var(--text);
  margin: 0 0 10px;
  line-height: 1.2;
}

.artist-stats {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.artist-desc {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.artist-desc.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.desc-toggle {
  margin-top: 6px;
  padding: 2px 0;
  background: none;
  border: none;
  color: var(--accent-light);
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.desc-toggle:hover {
  opacity: 0.8;
}

@media (max-width: 600px) {
  .artist-header {
    flex-direction: column;
    text-align: center;
    gap: 16px;
  }
}
</style>
