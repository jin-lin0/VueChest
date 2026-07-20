<script setup lang="ts">
import { onMounted } from 'vue'
import { useMusicStore, type Song, type Playlist } from '@/stores'
import FavoriteMenu from './FavoriteMenu.vue'

defineOptions({ name: 'DiscoverPanel' })

const music = useMusicStore()

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
  music.fetchRecommendPlaylists()
  music.fetchPlaylistCats().then(() => music.fetchCatPlaylists(music.activeCat || '全部'))
})
</script>

<template>
  <div class="discover-panel">
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

    <!-- 2. 官方榜单 -->
    <section class="ms-section">
      <div class="ms-section-head">
        <div class="ms-section-title"><span class="ms-accent-bar"></span>官方榜单</div>
      </div>
      <div v-if="music.isLoadingRecommend && music.recommendPlaylists.length === 0" class="ms-loading">
        加载中...
      </div>
      <div v-else-if="music.recommendPlaylists.length === 0" class="ms-empty">暂无榜单</div>
      <div v-else class="ms-card-grid">
        <div
          v-for="pl in music.recommendPlaylists"
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

    <!-- 3. 新歌速递 -->
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
  </div>
</template>

<style scoped>
.discover-panel {
  display: flex;
  flex-direction: column;
}
</style>
