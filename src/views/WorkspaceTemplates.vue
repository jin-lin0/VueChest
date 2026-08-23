<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { APP_MODULES } from '@/config'
import { useAuthStore, useMarketStore, useWorkspaceStore } from '@/stores'
import type { WorkspaceTemplateData } from '@/stores/workspace'
import { api } from '@/lib/request'

interface SharedTemplate {
  shareCode?: string
  name: string
  icon: string
  description: string
  template: WorkspaceTemplateData
  isOfficial?: boolean
  downloads?: number
}

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const market = useMarketStore()
const workspace = useWorkspaceStore()

const selected = ref<SharedTemplate | null>(null)
const message = ref('')
const applying = ref(false)
const shareUrl = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const builtinKey = (id: number) => `builtin:${id}`
const officialTemplates: SharedTemplate[] = [
  {
    name: '开发工作区',
    icon: '🛠️',
    description: '开发工具箱、API 管理和字幕工具。',
    template: {
      version: 1,
      name: '开发',
      icon: '🛠️',
      appKeys: [builtinKey(15), builtinKey(1), builtinKey(14)],
    },
    isOfficial: true,
  },
  {
    name: '学习工作区',
    icon: '📚',
    description: '面试题库与股票知识学习。',
    template: {
      version: 1,
      name: '学习',
      icon: '📚',
      appKeys: [builtinKey(12), builtinKey(9)],
    },
    isOfficial: true,
  },
  {
    name: '娱乐工作区',
    icon: '🎮',
    description: '音乐播放器和游戏中心。',
    template: {
      version: 1,
      name: '娱乐',
      icon: '🎮',
      appKeys: [builtinKey(10), builtinKey(18)],
    },
    isOfficial: true,
  },
]

const missingMarketIds = computed(() => {
  if (!selected.value) return []
  return (selected.value.template.appKeys || [])
    .filter((key) => key.startsWith('market:'))
    .map((key) => Number(key.split(':')[1]))
    .filter((id) => !market.isInstalled(id))
})

function exportWorkspace() {
  const template = workspace.exportActiveWorkspace()
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${template.name}-workspace.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const template = JSON.parse(String(reader.result || '')) as WorkspaceTemplateData
      if (
        !template ||
        template.version !== 1 ||
        typeof template.name !== 'string' ||
        !Array.isArray(template.appKeys)
      ) {
        throw new Error('invalid template')
      }
      selected.value = {
        name: template.name,
        icon: template.icon,
        description: '从本地文件导入',
        template,
      }
    } catch {
      message.value = '模板文件格式错误'
    }
  }
  reader.readAsText(file)
  ;(event.target as HTMLInputElement).value = ''
}

async function shareWorkspace() {
  if (!auth.isAuthenticated) {
    message.value = '登录后才能生成分享链接'
    return
  }
  try {
    const template = workspace.exportActiveWorkspace()
    const { data } = await api.post<{ data: SharedTemplate }>('/api/workspace-templates', {
      template,
    })
    shareUrl.value = `${window.location.origin}/workspace/templates?share=${data.shareCode}`
    await navigator.clipboard?.writeText(shareUrl.value).catch(() => {})
    message.value = '分享链接已生成并复制'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '分享链接生成失败'
  }
}

async function applyTemplate() {
  if (!selected.value) return
  applying.value = true
  message.value = ''
  try {
    for (const appId of missingMarketIds.value) await market.installApp(appId)
    workspace.importWorkspace(selected.value.template)
    if (selected.value.shareCode) {
      await api.post(`/api/workspace-templates/${selected.value.shareCode}/use`, undefined, {
        auth: false,
      })
    }
    router.push('/')
  } catch (error) {
    message.value = error instanceof Error ? error.message : '模板应用失败'
  } finally {
    applying.value = false
  }
}

async function loadShared(code: string) {
  try {
    const { data } = await api.get<{ data: SharedTemplate }>(`/api/workspace-templates/${code}`, {
      auth: false,
    })
    selected.value = data
  } catch {
    message.value = '分享模板不存在或已被删除'
  }
}

onMounted(() => {
  const shareCode = String(route.query.share || '')
  if (shareCode) void loadShared(shareCode)
})
</script>

<template>
  <div class="templates-page">
    <header class="page-header">
      <div>
        <button class="back-btn" @click="router.push('/')">← 返回首页</button>
        <h1>工作区模板</h1>
        <p>模板只包含应用和顺序，不包含任何应用数据。</p>
      </div>
      <div class="header-actions">
        <button @click="exportWorkspace">导出当前工作区</button>
        <button @click="fileInput?.click()">导入文件</button>
        <button class="primary" @click="shareWorkspace">生成分享链接</button>
        <input ref="fileInput" type="file" accept=".json" hidden @change="importFile" />
      </div>
    </header>

    <p v-if="message" class="message">{{ message }}</p>
    <input v-if="shareUrl" class="share-url" :value="shareUrl" readonly />

    <section>
      <h2>官方预设</h2>
      <div class="template-grid">
        <button
          v-for="item in officialTemplates"
          :key="item.name"
          class="template-card"
          :class="{ selected: selected?.name === item.name }"
          @click="selected = item"
        >
          <span>{{ item.icon }}</span>
          <strong>{{ item.name }}</strong>
          <small>{{ item.description }}</small>
        </button>
      </div>
    </section>

    <section v-if="selected" class="preview-card">
      <div class="preview-head">
        <span>{{ selected.icon }}</span>
        <div>
          <h2>{{ selected.name }}</h2>
          <p>{{ selected.description }}</p>
        </div>
      </div>
      <div class="app-tags">
        <span v-for="key in selected.template.appKeys" :key="key">
          {{ APP_MODULES.find((app) => key === `builtin:${app.id}`)?.name || key }}
        </span>
      </div>
      <p v-if="missingMarketIds.length" class="missing-note">
        应用模板前会先安装 {{ missingMarketIds.length }} 个缺失的市场应用。
      </p>
      <button class="apply-btn" :disabled="applying" @click="applyTemplate">
        {{ applying ? '正在应用...' : '创建此工作区' }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.templates-page {
  width: min(960px, calc(100% - 40px));
  min-height: 100%;
  margin: 0 auto;
  padding: 1.5rem 0 2rem;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.2rem;
}

.page-header h1 {
  margin: 0.7rem 0 0;
  color: var(--text-primary);
  font-size: 1.7rem;
}

.page-header p,
.preview-card p {
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.back-btn,
.header-actions button,
.apply-btn {
  padding: 0.48rem 0.78rem;
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  border-radius: 8px;
  background: var(--bg-glass);
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.header-actions .primary,
.apply-btn {
  border: 0;
  background: var(--gradient-primary);
  color: white;
}

.message {
  margin-bottom: 0.7rem;
  color: var(--accent);
}

.share-url {
  width: 100%;
  margin-bottom: 1rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
}

.templates-page section > h2 {
  margin-bottom: 0.7rem;
  color: var(--text-primary);
  font-size: 1rem;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
}

.template-card {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
  color: var(--text-primary);
  cursor: pointer;
  text-align: center;
}

.template-card > span {
  font-size: 2rem;
}

.template-card small {
  color: var(--text-secondary);
}

.template-card.selected {
  border-color: rgba(var(--accent-rgb), 0.45);
  box-shadow: 0 6px 20px rgba(var(--accent-rgb), 0.12);
}

.preview-card {
  margin-top: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
}

.preview-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.preview-head > span {
  font-size: 2rem;
}

.preview-head h2 {
  margin: 0;
  color: var(--text-primary);
}

.app-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.9rem 0;
}

.app-tags span {
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: var(--tag-bg);
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.missing-note {
  color: var(--warning) !important;
}

@media (max-width: 680px) {
  .templates-page {
    width: calc(100% - 24px);
    padding-top: 1rem;
  }

  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions {
    justify-content: flex-start;
  }

  .template-grid {
    grid-template-columns: 1fr;
  }
}
</style>
