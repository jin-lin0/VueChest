<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMarketStore, type InstalledApp } from '@/stores/market'
import { clearSandboxStorage, inspectSandboxStorage } from '@/lib/sandbox-bridge'
import { useConfirm } from '@/composables/useConfirm'
import { EmptyState, Modal } from '@/components'
import { formatFileSize } from '@/utils'

const route = useRoute()
const router = useRouter()
const market = useMarketStore()
const { confirm } = useConfirm()

const usage = ref<Record<number, { entries: number; bytes: number }>>({})
const uninstallTarget = ref<InstalledApp | null>(null)
const removeDataOnUninstall = ref(true)
const actionMessage = ref('')

async function refreshUsage() {
  const values = await Promise.all(
    market.installedApps.map(async (app) => {
      const info = await inspectSandboxStorage(app.id)
      return [app.id, { entries: info.entries, bytes: info.bytes }] as const
    }),
  )
  usage.value = Object.fromEntries(values)
}

async function exportData(app: InstalledApp) {
  const info = await inspectSandboxStorage(app.id)
  const payload = {
    version: 1,
    appId: app.id,
    appName: app.name,
    exportedAt: new Date().toISOString(),
    data: info.data,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${app.name}-data-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function clearData(app: InstalledApp) {
  const ok = await confirm(`确定清除“${app.name}”的全部本地数据吗？应用本身不会卸载。`)
  if (!ok) return
  const count = await clearSandboxStorage(app.id)
  actionMessage.value = `已清除 ${count} 条“${app.name}”数据`
  await refreshUsage()
}

function openUninstall(app: InstalledApp) {
  uninstallTarget.value = app
  removeDataOnUninstall.value = true
}

async function confirmUninstall() {
  const app = uninstallTarget.value
  if (!app) return
  try {
    await market.uninstallApp(app.id)
    if (removeDataOnUninstall.value) await clearSandboxStorage(app.id)
    uninstallTarget.value = null
    actionMessage.value = `已卸载“${app.name}”`
    await refreshUsage()
  } catch (error) {
    actionMessage.value = error instanceof Error ? error.message : '卸载失败'
  }
}

async function checkUpdates() {
  await market.checkForUpdates({ force: true })
  actionMessage.value = market.availableUpdates.length
    ? `发现 ${market.availableUpdates.length} 个可用更新`
    : '所有应用均为最新版本'
}

async function checkOne(app: InstalledApp) {
  try {
    const hasUpdate = await market.checkAppUpdate(app.id)
    actionMessage.value = hasUpdate ? `“${app.name}”有新版本可用` : `“${app.name}”已是最新版本`
  } catch (error) {
    actionMessage.value = error instanceof Error ? error.message : '检查更新失败'
  }
}

onMounted(async () => {
  await refreshUsage()
  const appId = Number(route.query.app)
  if (route.query.action === 'clear' && appId) {
    const app = market.installedApps.find((item) => item.id === appId)
    if (app) void clearData(app)
  }
})
</script>

<template>
  <div class="installed-page">
    <header class="page-header">
      <div class="header-left">
        <button class="back-btn" @click="router.push('/market')">← 返回市场</button>
        <div>
          <h1>已安装应用</h1>
          <p>管理版本、权限和本地数据</p>
        </div>
      </div>
      <button class="check-btn" :disabled="market.isCheckingUpdates" @click="checkUpdates">
        {{ market.isCheckingUpdates ? '检查中...' : '检查更新' }}
      </button>
    </header>

    <p v-if="actionMessage" class="action-message">{{ actionMessage }}</p>

    <EmptyState
      v-if="market.installedApps.length === 0"
      icon="📦"
      title="还没有安装市场应用"
    />

    <main v-else class="installed-list">
      <article v-for="app in market.installedApps" :key="app.id" class="installed-card">
        <div class="app-head">
          <span class="app-icon">{{ app.icon }}</span>
          <div class="app-copy">
            <strong>{{ app.name }}</strong>
            <small>
              v{{ app.version }} · 安装于 {{ new Date(app.installedAt).toLocaleDateString() }}
            </small>
          </div>
          <span v-if="market.hasUpdate(app.id)" class="update-tag">可更新</span>
        </div>

        <dl class="app-facts">
          <div>
            <dt>本地数据</dt>
            <dd>{{ formatFileSize(usage[app.id]?.bytes || 0) }} · {{ usage[app.id]?.entries || 0 }} 项</dd>
          </div>
          <div>
            <dt>联网权限</dt>
            <dd>{{ app.allowNetwork?.length ? app.allowNetwork.join('、') : '不允许联网' }}</dd>
          </div>
          <div v-if="app.updatedAt">
            <dt>最近更新</dt>
            <dd>{{ new Date(app.updatedAt).toLocaleString() }}</dd>
          </div>
        </dl>

        <div class="card-actions">
          <button @click="router.push(app.route)">打开</button>
          <button @click="router.push(`/market/${app.id}`)">版本与详情</button>
          <button @click="checkOne(app)">检查此应用</button>
          <button @click="exportData(app)">导出数据</button>
          <button :disabled="!(usage[app.id]?.entries)" @click="clearData(app)">清除数据</button>
          <button class="danger" @click="openUninstall(app)">卸载</button>
        </div>
      </article>
    </main>

    <Modal
      :open="!!uninstallTarget"
      title="卸载应用"
      width="min(440px, 94vw)"
      @close="uninstallTarget = null"
    >
      <div v-if="uninstallTarget" class="uninstall-dialog">
        <p>确定卸载“{{ uninstallTarget.name }}”吗？</p>
        <label>
          <input v-model="removeDataOnUninstall" type="checkbox" />
          同时删除该应用的本地数据
        </label>
        <div class="dialog-actions">
          <button @click="uninstallTarget = null">取消</button>
          <button class="confirm-danger" @click="confirmUninstall">确认卸载</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.installed-page {
  width: min(900px, calc(100% - 40px));
  min-height: 100%;
  margin: 0 auto;
  padding: 1.5rem 0 2rem;
}

.page-header,
.header-left,
.app-head,
.card-actions,
.dialog-actions {
  display: flex;
  align-items: center;
}

.page-header {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.header-left {
  gap: 1rem;
}

.page-header h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.6rem;
}

.page-header p,
.app-copy small,
.app-facts dt {
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.back-btn,
.check-btn,
.card-actions button,
.dialog-actions button {
  padding: 0.48rem 0.78rem;
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  border-radius: 8px;
  background: var(--bg-glass);
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

.action-message {
  margin-bottom: 0.8rem;
  color: var(--accent);
  font-size: 0.85rem;
}

.installed-list {
  display: grid;
  gap: 0.8rem;
}

.installed-card {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
}

.app-head {
  gap: 0.8rem;
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

.app-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.update-tag {
  padding: 0.18rem 0.48rem;
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 0.7rem;
}

.app-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem 1rem;
  margin: 0.9rem 0;
}

.app-facts div {
  min-width: 0;
}

.app-facts dd {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 0.84rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-light);
}

.card-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.card-actions .danger,
.dialog-actions .confirm-danger {
  border-color: var(--danger);
  color: var(--danger);
}

.uninstall-dialog p {
  color: var(--text-primary);
}

.uninstall-dialog label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0;
  color: var(--text-secondary);
}

.dialog-actions {
  justify-content: flex-end;
  gap: 0.6rem;
}

@media (max-width: 600px) {
  .installed-page {
    width: calc(100% - 24px);
    padding-top: 1rem;
  }

  .page-header {
    align-items: flex-start;
  }

  .app-facts {
    grid-template-columns: 1fr;
  }
}
</style>
