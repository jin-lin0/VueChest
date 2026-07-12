<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMarketStore } from '@/stores/market'
import type { MarketAppItem } from '@/stores/market'

const route = useRoute()
const router = useRouter()
const market = useMarketStore()

const app = ref<MarketAppItem | null>(null)
const loading = ref(true)
const installing = ref(false)
const uninstalling = ref(false)
const error = ref('')

onMounted(async () => {
  const id = Number(route.params.id)
  if (!id) {
    router.push('/market')
    return
  }
  app.value = await market.fetchAppDetail(id)
  loading.value = false
  if (!app.value) {
    error.value = '应用不存在'
  }
})

async function handleInstall() {
  if (!app.value) return
  installing.value = true
  try {
    await market.installApp(app.value.id)
  } catch (e: any) {
    error.value = e.message || '安装失败'
  } finally {
    installing.value = false
  }
}

async function handleUninstall() {
  if (!app.value) return
  uninstalling.value = true
  try {
    await market.uninstallApp(app.value.id)
  } finally {
    uninstalling.value = false
  }
}

const isInstalled = () => (app.value ? market.isInstalled(app.value.id) : false)
</script>

<template>
  <div class="detail-container">
    <header class="detail-header">
      <button class="back-btn" @click="router.push('/market')">← 返回市场</button>
    </header>

    <div v-if="loading" class="loading-state">加载中...</div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button class="back-btn" @click="router.push('/market')">返回市场</button>
    </div>

    <template v-else-if="app">
      <div class="detail-hero">
        <div class="hero-icon">{{ app.icon }}</div>
        <div class="hero-info">
          <h1>{{ app.name }}</h1>
          <div class="hero-meta">
            <span class="meta-item">v{{ app.version }}</span>
            <span class="meta-item">{{ app.author }}</span>
            <span class="meta-item">{{ app.category }}</span>
            <span class="meta-item">{{ app.downloads }} 次下载</span>
          </div>
          <p class="hero-desc">{{ app.description }}</p>
          <div class="hero-actions">
            <button
              v-if="!isInstalled()"
              class="install-btn"
              :disabled="installing"
              @click="handleInstall"
            >
              {{ installing ? '安装中...' : '安装' }}
            </button>
            <button
              v-else
              class="uninstall-btn"
              :disabled="uninstalling"
              @click="handleUninstall"
            >
              {{ uninstalling ? '卸载中...' : '卸载' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="app.readme" class="detail-section">
        <h2>说明</h2>
        <div class="readme-content">{{ app.readme }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-container {
  min-height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem 2rem 1rem;
}

.detail-header {
  margin-bottom: 2rem;
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

.loading-state,
.error-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #8e99a4;
}

.detail-hero {
  display: flex;
  gap: 2rem;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.hero-icon {
  font-size: 4rem;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa, #e8ecf1);
  border-radius: 24px;
  flex-shrink: 0;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.hero-info h1 {
  font-size: 1.8rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0 0 0.6rem;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.meta-item {
  font-size: 0.8rem;
  color: #8e99a4;
  background: rgba(245, 247, 250, 0.8);
  padding: 0.25rem 0.7rem;
  border-radius: 6px;
}

.hero-desc {
  font-size: 1rem;
  color: #666;
  line-height: 1.6;
  margin-bottom: 1.2rem;
}

.hero-actions {
  display: flex;
  gap: 0.8rem;
}

.install-btn {
  padding: 0.7rem 2rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.install-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.install-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.uninstall-btn {
  padding: 0.7rem 2rem;
  background: white;
  color: #e74c3c;
  border: 1px solid #e74c3c;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.uninstall-btn:hover:not(:disabled) {
  background: #fff5f5;
}

.uninstall-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.detail-section {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.detail-section h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 1rem;
}

.readme-content {
  font-size: 0.95rem;
  color: #666;
  line-height: 1.8;
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .detail-container {
    padding: 1rem;
  }

  .detail-hero {
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 1.5rem;
  }

  .hero-meta {
    justify-content: center;
  }

  .hero-actions {
    justify-content: center;
  }
}
</style>
