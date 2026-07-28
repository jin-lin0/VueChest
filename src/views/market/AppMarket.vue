<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '@/stores/market'
import { Skeleton } from '@/components'

const router = useRouter()
const market = useMarketStore()

const categories = ['全部', '工具', '娱乐', '开发', '游戏', '生活', '教育']
const activeCategory = ref('全部')
const searchQuery = ref('')
const installingId = ref<number | null>(null)

const filteredApps = computed(() => {
  let items = market.availableApps
  if (activeCategory.value !== '全部') {
    items = items.filter((a) => a.category === activeCategory.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    items = items.filter(
      (a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q),
    )
  }
  return items
})

const currentPage = ref(1)

function loadApps() {
  market.fetchApps({
    category: activeCategory.value !== '全部' ? activeCategory.value : undefined,
    keyword: searchQuery.value.trim() || undefined,
    page: currentPage.value,
    limit: 20,
  })
}

function onCategoryClick(cat: string) {
  activeCategory.value = cat
  currentPage.value = 1
  loadApps()
}

function onSearch() {
  currentPage.value = 1
  loadApps()
}

function clearSearch() {
  searchQuery.value = ''
  onSearch()
}

function goDetail(id: number) {
  router.push(`/market/${id}`)
}

async function handleInstall(appId: number) {
  if (installingId.value === appId || market.isInstalled(appId)) return
  installingId.value = appId
  try {
    await market.installApp(appId)
  } catch (e) {
    console.error('安装失败', e)
  } finally {
    installingId.value = null
  }
}

onMounted(() => {
  loadApps()
})
</script>

<template>
  <div class="market-container">
    <header class="market-header">
      <div class="header-left">
        <button class="back-btn" @click="router.push('/')">← 返回</button>
        <div class="header-text">
          <h1>应用市场</h1>
          <p class="subtitle">发现更多实用应用</p>
        </div>
      </div>
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索应用..."
          class="search-input"
          @input="onSearch"
        />
        <button v-if="searchQuery" class="search-clear" @click="clearSearch">✕</button>
      </div>
    </header>

    <div class="category-tabs">
      <button
        v-for="cat in categories"
        :key="cat"
        class="category-tab"
        :class="{ active: activeCategory === cat }"
        @click="onCategoryClick(cat)"
      >
        {{ cat }}
      </button>
    </div>

    <div v-if="market.isLoading" class="loading-state market-skel">
      <div class="skel-grid">
        <div v-for="n in 8" :key="n" class="skel-card">
          <Skeleton :width="72" :height="72" :radius="16" />
          <Skeleton :width="120" :height="16" text />
          <Skeleton :width="80" :height="12" text />
        </div>
      </div>
    </div>

    <div v-else-if="filteredApps.length === 0" class="empty-state">
      <span class="empty-icon">📦</span>
      <p class="empty-text">暂无应用</p>
    </div>

    <main v-else class="app-grid">
      <div v-for="app in filteredApps" :key="app.id" class="app-card" @click="goDetail(app.id)">
        <div class="card-glow"></div>
        <div class="card-content">
          <div class="app-icon">{{ app.icon }}</div>
          <h2 class="app-name">{{ app.name }}</h2>
          <p class="app-description">{{ app.description }}</p>
          <div class="app-meta">
            <span class="app-version">v{{ app.version }}</span>
            <span class="app-downloads">{{ app.downloads }} 次下载</span>
          </div>
          <button
            class="install-btn"
            :class="{
              installed: market.isInstalled(app.id),
              installing: installingId === app.id,
            }"
            :disabled="market.isInstalled(app.id) || installingId === app.id"
            @click.stop="handleInstall(app.id)"
          >
            <span v-if="installingId === app.id" class="btn-spinner" />
            {{
              installingId === app.id ? '安装中' : market.isInstalled(app.id) ? '已安装' : '安装'
            }}
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.market-container {
  min-height: 100vh;
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem 2rem 1rem;
  position: relative;
}

.market-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.2rem;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  background: var(--bg-glass-soft);
  border: 1px solid var(--bg-glass-soft);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--accent);
  font-weight: 600;
  transition: all var(--transition);
  box-shadow: var(--shadow-sm);
}

.back-btn:hover {
  background: rgba(var(--accent-rgb), 0.08);
  border-color: rgba(var(--accent-rgb), 0.3);
}

.header-text h1 {
  font-size: 1.6rem;
  font-weight: 800;
  background: linear-gradient(135deg, var(--text-primary), var(--accent), var(--accent-strong));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.subtitle {
  font-size: 0.78rem;
  color: var(--accent);
  font-weight: 600;
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.search-bar {
  display: flex;
  align-items: center;
  flex: 0 1 320px;
  background: var(--bg-glass);
  border: 1px solid var(--bg-glass-soft);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.9rem;
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
  box-shadow: var(--shadow-sm);
}

.search-bar:focus-within {
  border-color: rgba(var(--accent-rgb), 0.4);
  box-shadow: 0 4px 20px rgba(var(--accent-rgb), 0.12);
}

.search-icon {
  font-size: 0.95rem;
  margin-right: 0.6rem;
  opacity: 0.5;
}

.search-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 0.95rem;
  color: var(--text-primary);
  padding: 0;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-clear {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  transition: all var(--transition-fast);
  line-height: 1;
}

.search-clear:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--accent);
}

.category-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.category-tab {
  padding: 0.4rem 1rem;
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  background: var(--bg-glass-soft);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 500;
  transition: all var(--transition);
}

.category-tab:hover {
  border-color: rgba(var(--accent-rgb), 0.4);
  color: var(--accent);
}

.category-tab.active {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border-color: transparent;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-muted);
}

.market-skel .skel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.5rem;
  margin: 0 auto;
  max-width: 1200px;
}

.market-skel .skel-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: var(--bg-glass);
  border: 1px solid var(--bg-glass-soft);
  border-radius: var(--radius-lg);
  padding: 2rem 1.5rem;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.4;
  margin-bottom: 1rem;
  display: block;
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.app-card {
  position: relative;
  background: var(--bg-glass);
  border: 1px solid var(--bg-glass-soft);
  border-radius: var(--radius-lg);
  padding: 2rem 1.5rem;
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease;
}

.app-card:hover {
  transform: translateY(-6px) scale(1.02);
  border-color: rgba(var(--accent-rgb), 0.3);
}

.card-glow {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  border-radius: calc(var(--radius-lg) + 2px);
  background: var(--gradient-primary);
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: -1;
}

.app-card:hover .card-glow {
  opacity: 0.12;
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.app-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-subtle);
  border-radius: var(--radius-lg);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-card:hover .app-icon {
  transform: scale(1.1) rotate(-3deg);
}

.app-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.app-description {
  color: var(--text-muted);
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 0.8rem;
}

.app-meta {
  display: flex;
  gap: 0.8rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 0.8rem;
}

.install-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0.4rem 1.2rem;
  border-radius: var(--radius-pill);
  font-size: 0.8rem;
  font-weight: 600;
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border: none;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}

.install-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.35);
}

.install-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.install-btn.installed {
  background: var(--bg-subtle);
  color: var(--success);
  cursor: default;
}

.install-btn.installing {
  opacity: 0.7;
}

.install-btn:disabled {
  cursor: default;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .market-container {
    padding: 1rem;
  }

  .market-header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }

  .search-bar {
    flex: 1 1 100%;
  }

  .app-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.8rem;
  }

  .app-card {
    padding: 1.2rem 1rem;
  }

  .app-icon {
    font-size: 2rem;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    margin-bottom: 0.6rem;
  }

  .app-name {
    font-size: 1rem;
  }

  .app-description {
    font-size: 0.78rem;
  }
}
</style>
