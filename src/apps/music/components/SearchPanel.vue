<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMusicStore } from '@/stores'
import { Skeleton } from '@/components'
import { debounce } from '@/utils/common'
import FavoriteMenu from './FavoriteMenu.vue'

defineOptions({ name: 'SearchPanel' })

const music = useMusicStore()

const searchInput = ref('')
const suggestVisible = ref(false)

const onInput = debounce(() => {
  const q = searchInput.value.trim()
  if (q) {
    music.fetchSearchSuggest(q)
    suggestVisible.value = true
  } else {
    music.clearSuggestions()
    suggestVisible.value = false
  }
}, 300)

const doSearch = () => {
  const q = searchInput.value.trim()
  if (q) {
    music.searchSongs(q)
    suggestVisible.value = false
  }
}

const hasSuggestions = computed(
  () =>
    music.searchSuggestions.songs.length > 0 ||
    music.searchSuggestions.artists.length > 0 ||
    music.searchSuggestions.albums.length > 0,
)

const showSuggest = computed(
  () => suggestVisible.value && searchInput.value.trim().length > 0 && hasSuggestions.value,
)

const onSuggestSong = (item: { id: string; name: string }) => {
  searchInput.value = item.name
  music.searchSongs(item.name)
  suggestVisible.value = false
}

const onSuggestArtist = (item: { id: string; name: string }) => {
  music.openArtist(item.id)
  suggestVisible.value = false
}

const onSuggestAlbum = (item: { id: string; name: string }) => {
  music.openAlbum(item.id)
  suggestVisible.value = false
}

const onHotClick = (h: { searchWord: string }) => {
  searchInput.value = h.searchWord
  music.searchSongs(h.searchWord)
}

const onBlur = () => {
  // 延迟收起联想，避免点击联想项前下拉先消失
  setTimeout(() => (suggestVisible.value = false), 150)
}

const onHistoryClick = (item: string) => {
  searchInput.value = item
  music.searchSongs(item)
}

onMounted(() => {
  music.fetchHotSearches()
})
</script>

<template>
  <div class="search-panel">
    <!-- 搜索框 -->
    <div class="search-bar">
      <input
        v-model="searchInput"
        class="search-input"
        type="text"
        placeholder="搜索歌曲、歌手、专辑..."
        @input="onInput"
        @keydown.enter="doSearch"
        @focus="suggestVisible = true"
        @blur="onBlur"
      />

      <!-- 联想下拉 -->
      <div v-if="showSuggest" class="suggest-dropdown">
        <template v-if="music.searchSuggestions.songs.length > 0">
          <div class="suggest-group-title">单曲</div>
          <div
            v-for="item in music.searchSuggestions.songs"
            :key="'s-' + item.id"
            class="suggest-item"
            @mousedown.prevent="onSuggestSong(item)"
          >
            <span class="suggest-name">{{ item.name }}</span>
            <span v-if="item.extra" class="suggest-extra">{{ item.extra }}</span>
          </div>
        </template>

        <template v-if="music.searchSuggestions.artists.length > 0">
          <div class="suggest-group-title">歌手</div>
          <div
            v-for="item in music.searchSuggestions.artists"
            :key="'a-' + item.id"
            class="suggest-item"
            @mousedown.prevent="onSuggestArtist(item)"
          >
            <img v-if="item.picUrl" :src="item.picUrl" class="suggest-avatar" alt="" />
            <span class="suggest-name">{{ item.name }}</span>
          </div>
        </template>

        <template v-if="music.searchSuggestions.albums.length > 0">
          <div class="suggest-group-title">专辑</div>
          <div
            v-for="item in music.searchSuggestions.albums"
            :key="'al-' + item.id"
            class="suggest-item"
            @mousedown.prevent="onSuggestAlbum(item)"
          >
            <span class="suggest-name">{{ item.name }}</span>
            <span v-if="item.extra" class="suggest-extra">{{ item.extra }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- 主体区 -->
    <div v-if="music.isSearching" class="ms-loading ms-skel">
      <Skeleton :width="160" :height="14" text />
      <Skeleton :width="120" :height="14" text />
    </div>

    <template v-else-if="music.searchResults.length > 0">
      <div class="result-head">共 {{ music.searchResults.length }} 首</div>
      <div class="ms-song-list">
        <div
          v-for="(song, index) in music.searchResults"
          :key="song.id"
          class="ms-song-item"
          :class="{ playing: music.activeSong?.id === song.id }"
          @click="music.playSong(song, music.searchResults)"
        >
          <span class="ms-song-index">{{ index + 1 }}</span>
          <img
            v-if="song.coverUrl"
            :src="song.coverUrl + '?param=100y100'"
            class="ms-song-cover"
            alt=""
          />
          <div v-else class="ms-song-cover ms-cover-ph">♪</div>
          <div class="ms-song-info">
            <div class="ms-song-name">
              {{ song.name }}
              <span v-if="song.sq" class="ms-tag ms-tag-sq">SQ</span>
              <span v-if="song.fee === 1" class="ms-tag ms-tag-vip">VIP</span>
              <span v-if="song.mvId" class="ms-tag ms-tag-mv">MV</span>
            </div>
            <div class="ms-song-artist">
              <span
                v-if="song.artistId"
                class="ms-link"
                @click.stop="music.openArtist(song.artistId)"
                >{{ song.artists }}</span
              >
              <span v-else>{{ song.artists }}</span>
              <template v-if="song.albumId">
                -
                <span class="ms-link" @click.stop="music.openAlbum(song.albumId)">{{
                  song.album
                }}</span>
              </template>
              <template v-else> - {{ song.album }}</template>
            </div>
          </div>
          <span v-if="song.duration" class="ms-song-duration">{{
            music.formatDuration(song.duration)
          }}</span>
          <FavoriteMenu :song="song" />
        </div>
      </div>
    </template>

    <div v-else-if="music.searchQuery" class="ms-empty">未找到相关歌曲</div>

    <template v-else>
      <!-- 热搜榜 -->
      <div class="ms-section">
        <div class="ms-section-head">
          <div class="ms-section-title"><span class="ms-accent-bar"></span>热门搜索</div>
        </div>
        <div class="ms-chips">
          <div
            v-for="h in music.hotSearches"
            :key="h.searchWord"
            class="ms-chip"
            @click="onHotClick(h)"
          >
            <img v-if="h.iconUrl" :src="h.iconUrl" class="hot-icon" alt="" />
            <span>{{ h.searchWord }}</span>
          </div>
        </div>
      </div>

      <!-- 搜索历史 -->
      <div v-if="music.searchHistory.length > 0" class="ms-section">
        <div class="ms-section-head">
          <div class="ms-section-title"><span class="ms-accent-bar"></span>搜索历史</div>
          <button class="ms-section-more" @click="music.clearSearchHistory()">清空</button>
        </div>
        <div class="ms-chips">
          <div
            v-for="item in music.searchHistory"
            :key="item"
            class="ms-chip history-chip"
            @click="onHistoryClick(item)"
          >
            <span class="history-word">{{ item }}</span>
            <span class="history-remove" @click.stop="music.removeSearchHistory(item)">×</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 搜索框 */
.search-bar {
  position: relative;
}

.search-input {
  width: 100%;
  border-radius: 28px;
  padding: 12px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 15px;
  outline: none;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.search-input::placeholder {
  color: var(--text-dim);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.15);
}

/* 联想下拉 */
.suggest-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 20;
  background: var(--bg-popover, #181826);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  padding: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.suggest-group-title {
  font-size: 12px;
  color: var(--text-dim);
  padding: 6px 12px 4px;
  font-weight: 600;
}

.suggest-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
  transition: background 0.18s;
}

.suggest-item:hover {
  background: var(--bg-card-hover);
}

.suggest-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggest-extra {
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
}

.suggest-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-card);
}

/* 结果头部 */
.result-head {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

/* 热搜图标 / 历史 */
.hot-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}

.history-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.history-word {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-remove {
  font-size: 15px;
  line-height: 1;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.2s;
}

.history-remove:hover {
  color: var(--accent-light);
}
</style>
