<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '@/stores/market'
import { EmptyState } from '@/components'

const router = useRouter()
const market = useMarketStore()

const updateCountText = computed(() => {
  if (market.isCheckingUpdates) return '正在检查更新...'
  if (market.updateCheckError) return market.updateCheckError
  if (market.availableUpdates.length === 0) return '所有应用均为最新版本'
  return `发现 ${market.availableUpdates.length} 个可用更新`
})

onMounted(() => void market.checkForUpdates({ force: true }))

async function handleUpdate(appId: number) {
  try {
    await market.updateApp(appId)
  } catch {
    // Store 已记录错误并恢复旧版本，页面直接展示对应错误信息。
  }
}
</script>

<template>
  <div class="updates-page">
    <header class="updates-header">
      <div class="header-left">
        <button class="back-btn" @click="router.push('/market')">← 返回市场</button>
        <div>
          <h1>应用更新</h1>
          <p>{{ updateCountText }}</p>
        </div>
      </div>
      <button class="check-btn" :disabled="market.isCheckingUpdates" @click="market.checkForUpdates({ force: true })">
        {{ market.isCheckingUpdates ? '检查中...' : '检查更新' }}
      </button>
    </header>

    <section class="update-settings">
      <div>
        <strong>自动更新</strong>
        <small>发现新版本后自动下载并替换，失败时保留当前版本。</small>
      </div>
      <button
        class="setting-switch"
        :class="{ active: market.autoUpdateEnabled }"
        role="switch"
        :aria-checked="market.autoUpdateEnabled"
        @click="market.setAutoUpdate(!market.autoUpdateEnabled)"
      >
        <span></span>
      </button>
    </section>

    <div v-if="market.availableUpdates.length" class="batch-row">
      <span>更新包会完整下载成功后再替换本地版本。</span>
      <button :disabled="market.isUpdatingAll" @click="market.updateAll">
        {{ market.isUpdatingAll ? '正在更新...' : `全部更新 (${market.availableUpdates.length})` }}
      </button>
    </div>

    <EmptyState
      v-if="!market.isCheckingUpdates && !!market.updateCheckError && market.availableUpdates.length === 0"
      icon="!"
      title="暂时无法检查更新"
    />

    <EmptyState
      v-else-if="!market.isCheckingUpdates && market.availableUpdates.length === 0"
      icon="✓"
      title="已经是最新版本"
    />

    <main v-else-if="market.availableUpdates.length" class="update-list">
      <article v-for="item in market.availableUpdates" :key="item.installed.id" class="update-card">
        <button class="app-summary" @click="router.push(`/market/${item.installed.id}`)">
          <span class="app-icon">{{ item.latest.icon }}</span>
          <span class="app-info">
            <strong>{{ item.latest.name }}</strong>
            <small>v{{ item.installed.version }} → v{{ item.latest.version }}</small>
          </span>
        </button>
        <p class="release-notes">
          {{ item.latest.releaseNotes || '开发者未提供本次更新说明。' }}
        </p>
        <p v-if="market.updateErrors[item.installed.id]" class="update-error">
          {{ market.updateErrors[item.installed.id] }}，已保留原版本
        </p>
        <div class="card-actions">
          <time>{{ new Date(item.latest.updatedAt).toLocaleDateString() }}</time>
          <button
            :disabled="market.isUpdating(item.installed.id)"
            @click="handleUpdate(item.installed.id)"
          >
            {{ market.isUpdating(item.installed.id) ? '更新中...' : '立即更新' }}
          </button>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped>
.updates-page {
  width: min(900px, calc(100% - 40px));
  min-height: 100%;
  margin: 0 auto;
  padding: 1.5rem 0 2rem;
}

.updates-header,
.header-left,
.update-settings,
.batch-row,
.card-actions,
.app-summary {
  display: flex;
  align-items: center;
}

.updates-header {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.header-left {
  gap: 1rem;
}

.updates-header h1 {
  margin: 0;
  background: var(--gradient-primary);
  background-clip: text;
  color: transparent;
  font-size: 1.6rem;
  font-weight: 800;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.updates-header p,
.update-settings small,
.batch-row,
.app-info small,
.card-actions time {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.back-btn,
.check-btn,
.batch-row button,
.card-actions button {
  padding: 0.5rem 0.9rem;
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  border-radius: 9px;
  background: var(--bg-glass);
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

.check-btn:disabled,
.batch-row button:disabled,
.card-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.update-settings {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem 1.15rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
}

.update-settings > div {
  display: flex;
  flex-direction: column;
}

.setting-switch {
  position: relative;
  width: 42px;
  height: 24px;
  flex: 0 0 42px;
  border: 0;
  border-radius: 999px;
  background: #d8dce8;
  cursor: pointer;
}

.setting-switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  transition: transform 0.2s ease;
}

.setting-switch.active {
  background: var(--accent);
}

.setting-switch.active span {
  transform: translateX(18px);
}

.batch-row {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.batch-row button,
.card-actions button {
  border: 0;
  background: var(--gradient-primary);
  color: white;
}

.update-list {
  display: grid;
  gap: 0.8rem;
}

.update-card {
  padding: 1rem 1.15rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
  box-shadow: var(--shadow-sm);
}

.app-summary {
  gap: 0.8rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.app-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 13px;
  background: linear-gradient(135deg, #f5f7fa, #e8ecf1);
  font-size: 1.8rem;
}

.app-info {
  display: flex;
  flex-direction: column;
}

.release-notes {
  margin: 0.8rem 0;
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.7;
  white-space: pre-wrap;
}

.update-error {
  margin-bottom: 0.7rem;
  color: var(--danger);
  font-size: 0.82rem;
}

.card-actions {
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-light);
}

@media (max-width: 600px) {
  .updates-page {
    width: calc(100% - 24px);
    padding-top: 1rem;
  }

  .updates-header {
    align-items: flex-start;
  }

  .header-left {
    align-items: flex-start;
  }

  .batch-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
