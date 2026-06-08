<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '@/stores/market'

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
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''; onSearch()">✕</button>
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

    <div v-if="market.isLoading" class="loading-state">
      <p>加载中...</p>
    </div>

    <div v-else-if="filteredApps.length === 0" class="empty-state">
      <span class="empty-icon">📦</span>
      <p class="empty-text">暂无应用</p>
    </div>

    <main v-else class="app-grid">
      <div
        v-for="app in filteredApps"
        :key="app.id"
        class="app-card"
        @click="goDetail(app.id)"
      >
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
            {{ installingId === app.id ? '安装中' : market.isInstalled(app.id) ? '已安装' : '安装' }}
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
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.8);
  padding: 0.5rem 1rem;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #667eea;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.back-btn:hover {
  background: rgba(102, 126, 234, 0.08);
  border-color: rgba(102, 126, 234, 0.3);
}

.header-text h1 {
  font-size: 1.6rem;
  font-weight: 800;
  background: linear-gradient(135deg, #2c3e50, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.subtitle {
  font-size: 0.78rem;
  color: #667eea;
  font-weight: 600;
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.search-bar {
  display: flex;
  align-items: center;
  flex: 0 1 320px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 0.5rem 0.9rem;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.search-bar:focus-within {
  border-color: rgba(102, 126, 234, 0.4);
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.12);
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
  color: #2c3e50;
  padding: 0;
}

.search-input::placeholder {
  color: #b0b8c1;
}

.search-clear {
  background: none;
  border: none;
  color: #b0b8c1;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  transition: all 0.15s ease;
  line-height: 1;
}

.search-clear:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #667eea;
}

.category-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.category-tab {
  padding: 0.4rem 1rem;
  border: 1px solid rgba(102, 126, 234, 0.2);
  background: rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #8e99a4;
  font-weight: 500;
  transition: all 0.2s ease;
}

.category-tab:hover {
  border-color: rgba(102, 126, 234, 0.4);
  color: #667eea;
}

.category-tab.active {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border-color: transparent;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #8e99a4;
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
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  padding: 2rem 1.5rem;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.3s ease;
}

.app-card:hover {
  transform: translateY(-6px) scale(1.02);
  border-color: rgba(102, 126, 234, 0.3);
}

.card-glow {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  border-radius: 18px;
  background: linear-gradient(135deg, #667eea, #764ba2);
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
  background: linear-gradient(135deg, #f5f7fa, #e8ecf1);
  border-radius: 18px;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-card:hover .app-icon {
  transform: scale(1.1) rotate(-3deg);
}

.app-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.app-description {
  color: #8e99a4;
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 0.8rem;
}

.app-meta {
  display: flex;
  gap: 0.8rem;
  font-size: 0.78rem;
  color: #b0b8c1;
  margin-bottom: 0.8rem;
}

.install-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0.4rem 1.2rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.install-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.35);
}

.install-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.install-btn.installed {
  background: #e8ecf1;
  color: #27ae60;
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
  to { transform: rotate(360deg); }
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
