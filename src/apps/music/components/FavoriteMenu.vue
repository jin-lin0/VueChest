<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMusicStore, type Song } from '@/stores/music'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ song: Song }>()

const music = useMusicStore()
const auth = useAuthStore()

const open = ref(false)
const newGroupName = ref('')

const liked = computed(() => music.isFavoriteSong(props.song.id))

function onHeart(e: Event) {
  e.stopPropagation()
  music.toggleFavoriteSong(props.song)
}

function toggleOpen(e: Event) {
  e.stopPropagation()
  open.value = !open.value
}

function close() {
  open.value = false
}

async function toggleGroup(groupId: number, inGroup: boolean) {
  if (inGroup) {
    await music.removeFromGroup(props.song.id, groupId)
  } else {
    await music.addToGroup(props.song, groupId)
  }
}

async function createAndAdd() {
  const name = newGroupName.value.trim()
  if (!name) return
  const group = await music.createFavoriteGroup(name)
  newGroupName.value = ''
  if (group) {
    await music.addToGroup(props.song, group.id)
  }
}

async function removeGroup(groupId: number, e: Event) {
  e.stopPropagation()
  await music.deleteFavoriteGroup(groupId)
}
</script>

<template>
  <span class="fav-menu" @click.stop>
    <!-- 我的喜欢：点击爱心快速切换 -->
    <button
      class="fm-heart"
      :class="{ favorited: liked }"
      :aria-label="liked ? '取消收藏' : '收藏到我的喜欢'"
      :title="liked ? '取消收藏' : '收藏到我的喜欢'"
      @click="onHeart"
    >
      {{ liked ? '❤️' : '🤍' }}
    </button>

    <!-- 分组：登录后可加入自建收藏夹 -->
    <button
      class="fm-folder"
      :class="{ active: open }"
      aria-label="收藏到分组"
      title="收藏到分组"
      @click="toggleOpen"
    >
      📁
    </button>

    <template v-if="open">
      <div class="fm-overlay" @click="close"></div>
      <div class="fm-popover">
        <div v-if="!auth.isAuthenticated" class="fm-hint">
          登录后可将歌曲收藏到分组并云端保存，刷新/更新都不会丢失。
        </div>
        <template v-else>
          <div class="fm-title">收藏到分组</div>
          <div
            v-for="g in music.favoriteGroups"
            :key="g.id"
            class="fm-group"
            @click="toggleGroup(g.id, music.isInGroup(song.id, g.id))"
          >
            <span class="fm-check">{{ music.isInGroup(song.id, g.id) ? '✓' : '' }}</span>
            <span class="fm-name">{{ g.name }}</span>
            <span
              v-if="!g.isDefault"
              class="fm-del"
              title="删除该分组"
              @click="removeGroup(g.id, $event)"
              >🗑</span
            >
          </div>
          <div class="fm-new">
            <input
              v-model="newGroupName"
              class="fm-input"
              type="text"
              placeholder="新建分组"
              maxlength="20"
              @keyup.enter="createAndAdd"
            />
            <button class="fm-add" @click="createAndAdd">+</button>
          </div>
        </template>
      </div>
    </template>
  </span>
</template>

<style scoped>
.fav-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fm-heart,
.fm-folder {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 2px 3px;
  border-radius: 6px;
  transition: background 0.15s;
}
.fm-heart:hover,
.fm-folder:hover {
  background: rgba(128, 128, 128, 0.15);
}
.fm-heart.favorited {
  filter: drop-shadow(0 0 2px rgba(255, 80, 110, 0.6));
}
.fm-folder.active {
  background: rgba(128, 128, 128, 0.2);
}
.fm-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
}
.fm-popover {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 201;
  margin-top: 6px;
  min-width: 180px;
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 10px;
  background: var(--bg-elevated, #fff);
  border: 1px solid rgba(128, 128, 128, 0.2);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  color: var(--text-primary, #222);
}
.fm-hint {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.7;
  max-width: 200px;
}
.fm-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
  margin-bottom: 6px;
}
.fm-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
}
.fm-group:hover {
  background: rgba(128, 128, 128, 0.12);
}
.fm-check {
  width: 16px;
  text-align: center;
  color: var(--accent, #e85d75);
  font-weight: 700;
}
.fm-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fm-del {
  opacity: 0.5;
  font-size: 12px;
}
.fm-del:hover {
  opacity: 1;
}
.fm-new {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(128, 128, 128, 0.15);
}
.fm-input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  background: transparent;
  color: inherit;
  outline: none;
}
.fm-add {
  border: none;
  background: var(--accent, #e85d75);
  color: #fff;
  border-radius: 6px;
  width: 26px;
  cursor: pointer;
  font-size: 14px;
}
</style>
