<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { Modal } from '@/components'
import type { CloudSyncDownloadPreview } from '@/stores/cloudSync'
import { useRouter } from 'vue-router'
import {
  CLOUD_SYNC_CATEGORIES,
  useAuthStore,
  useCloudSyncStore,
  useWorkspaceStore,
  type CloudSyncCategoryId,
} from '@/stores'
import type { WorkspaceCloudConfig } from '@/stores/workspace'
import { useConfirm } from '@/composables/useConfirm'

const router = useRouter()
const auth = useAuthStore()
const workspace = useWorkspaceStore()
const cloudSync = useCloudSyncStore()
const { confirm } = useConfirm()

const cloudWorkspace = ref<WorkspaceCloudConfig | null>(null)
const message = ref('')
const loading = ref(true)
const reloadNeeded = ref(false)
const downloadButton = ref<HTMLButtonElement | null>(null)
const downloadPreview = shallowRef<CloudSyncDownloadPreview | null>(null)
const categoryTitle = (id: CloudSyncCategoryId) =>
  CLOUD_SYNC_CATEGORIES.find((category) => category.id === id)?.title || id
const backupTitles = computed(
  () => cloudSync.localBackup?.selection.map(categoryTitle).join('、') || '',
)
const selectedTitles = computed(() =>
  CLOUD_SYNC_CATEGORIES.filter((category) => cloudSync.selectedSet.has(category.id)).map(
    (category) => category.title,
  ),
)

function hasRemoteData(id: CloudSyncCategoryId) {
  return id === 'workspace' ? Boolean(cloudWorkspace.value) : cloudSync.hasRemoteData(id)
}

function toggleCategory(id: CloudSyncCategoryId, event: Event) {
  cloudSync.setCategoryEnabled(id, (event.target as HTMLInputElement).checked)
}

async function refresh() {
  loading.value = true
  try {
    const [, remoteWorkspace] = await Promise.all([
      auth.fetchSessions(),
      workspace.fetchCloudWorkspace(),
      cloudSync.fetchRemote(),
    ])
    cloudWorkspace.value = remoteWorkspace
  } catch (error) {
    message.value = error instanceof Error ? error.message : '加载账户设置失败'
  } finally {
    loading.value = false
  }
}

async function revoke(id: string, isCurrent: boolean) {
  const ok = await confirm(
    isCurrent ? '撤销当前设备后需要重新登录，确定继续吗？' : '确定退出这个设备吗？',
  )
  if (!ok) return
  try {
    await auth.revokeSession(id)
    if (!auth.isAuthenticated) {
      router.push({ path: '/login', query: { redirect: '/settings/account' } })
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : '设备退出失败'
  }
}

async function revokeOthers() {
  const ok = await confirm('确定退出除当前设备外的所有登录设备吗？')
  if (!ok) return
  try {
    await auth.revokeOtherSessions()
    message.value = '其他设备已退出登录'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '其他设备退出失败'
  }
}

async function uploadCloud() {
  try {
    const count = await cloudSync.uploadSelected()
    cloudWorkspace.value = await workspace.fetchCloudWorkspace()
    message.value = `已上传 ${count} 类数据：${selectedTitles.value.join('、')}`
  } catch (error) {
    message.value = error instanceof Error ? error.message : '上传失败'
  }
}

async function downloadCloud() {
  try {
    downloadPreview.value = await cloudSync.prepareDownload()
  } catch (error) {
    message.value = error instanceof Error ? error.message : '读取云端数据失败'
  }
}

async function applyDownload() {
  if (!downloadPreview.value) return
  const preview = downloadPreview.value
  downloadPreview.value = null
  try {
    const { applied, missing, failed } = await cloudSync.downloadSelected(preview)
    reloadNeeded.value ||= applied.some((id) => id !== 'workspace')
    message.value = [
      applied.length ? `已下载：${applied.map(categoryTitle).join('、')}` : '本次没有数据下载成功',
      missing.length ? `云端暂无副本：${missing.map(categoryTitle).join('、')}` : '',
      ...failed.map((item) => `${categoryTitle(item.id)}失败：${item.message}，可从本机备份恢复`),
    ]
      .filter(Boolean)
      .join('；')
  } catch (error) {
    message.value = error instanceof Error ? error.message : '下载失败'
  }
}

async function restoreLocalBackup() {
  if (
    !(await confirm(
      `将用备份恢复本机的“${backupTitles.value}”。当前数据会先保存为新的备份，云端数据不受影响。确定恢复吗？`,
    ))
  )
    return
  try {
    const { applied, failed } = await cloudSync.restoreBackup()
    reloadNeeded.value ||= applied.some((id) => id !== 'workspace')
    message.value = [
      applied.length ? `已恢复：${applied.map(categoryTitle).join('、')}` : '本次没有数据恢复成功',
      ...failed.map((item) => `${categoryTitle(item.id)}恢复失败：${item.message}，原备份仍保留`),
    ].join('；')
  } catch (error) {
    message.value = error instanceof Error ? error.message : '恢复失败'
  }
}

async function deleteCloud() {
  const ok = await confirm(
    `确定删除云端的“${selectedTitles.value.join('、')}”吗？本机数据不会删除。`,
  )
  if (!ok) return
  try {
    await cloudSync.deleteSelectedCloudData()
    if (cloudSync.selectedSet.has('workspace')) cloudWorkspace.value = null
    message.value = '所选云端数据已删除，本机数据未改变'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除失败'
  }
}

function reloadApp() {
  window.location.reload()
}

onMounted(() => void refresh())
</script>

<template>
  <div class="account-page">
    <header>
      <button class="back-btn" @click="router.push('/')">← 返回首页</button>
      <h1>设备与云端</h1>
      <p>管理登录设备，并选择需要在账号间同步的数据。</p>
    </header>

    <div v-if="message" class="message" role="status">
      <span>{{ message }}</span>
      <button v-if="reloadNeeded" @click="reloadApp">重新加载以应用</button>
    </div>
    <p v-if="loading" class="loading">加载中...</p>

    <template v-else>
      <section class="settings-card">
        <div class="section-head">
          <div>
            <h2>登录设备</h2>
            <p>撤销后对应设备的令牌会立即失效。</p>
          </div>
          <button v-if="auth.sessions.length > 1" @click="revokeOthers">退出其他设备</button>
        </div>
        <div class="session-list">
          <div v-for="session in auth.sessions" :key="session.id" class="session-item">
            <div>
              <strong>{{ session.deviceName }}</strong>
              <span v-if="session.isCurrent" class="current-tag">当前设备</span>
              <small>
                {{ session.ip || '未知 IP' }} · 最近活跃
                {{ new Date(session.lastActiveAt).toLocaleString() }}
              </small>
            </div>
            <button class="danger" @click="revoke(session.id, session.isCurrent)">退出</button>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="section-head">
          <div>
            <h2>选择性云同步</h2>
            <p>只处理勾选的数据类型；上传和下载都不会影响未勾选的数据。</p>
          </div>
        </div>
        <div class="sync-summary">
          <span
            ><strong>{{ cloudSync.selection.length }}</strong> 类已选择</span
          >
          <small v-if="cloudSync.remoteUpdatedAt">
            云端更新于 {{ new Date(cloudSync.remoteUpdatedAt).toLocaleString() }}
          </small>
          <small v-else>云端还没有选择性同步数据</small>
        </div>

        <div class="sync-category-list">
          <label
            v-for="category in CLOUD_SYNC_CATEGORIES"
            :key="category.id"
            class="sync-category"
            :class="{ selected: cloudSync.selectedSet.has(category.id) }"
          >
            <input
              type="checkbox"
              :checked="cloudSync.selectedSet.has(category.id)"
              :disabled="cloudSync.isSyncing"
              @change="toggleCategory(category.id, $event)"
            />
            <span class="sync-check" aria-hidden="true">✓</span>
            <span class="sync-icon" aria-hidden="true">{{ category.icon }}</span>
            <span class="sync-copy">
              <strong>
                {{ category.title }}
                <small v-if="category.sensitive" class="sensitive-tag">可能含敏感数据</small>
              </strong>
              <small>{{ category.description }}</small>
            </span>
            <small v-if="hasRemoteData(category.id)" class="cloud-tag">云端已有</small>
          </label>
        </div>

        <p class="sync-note">
          API 环境变量和股票持仓会以账号数据保存到服务器；如果其中包含密钥或真实持仓，请谨慎选择。
        </p>
        <div class="cloud-actions">
          <button
            class="primary"
            :disabled="!cloudSync.selection.length || cloudSync.isSyncing"
            @click="uploadCloud"
          >
            {{ cloudSync.isSyncing ? '同步中…' : '上传所选数据' }}
          </button>
          <button
            :disabled="!cloudSync.selection.length || cloudSync.isSyncing"
            ref="downloadButton"
            @click="downloadCloud"
          >
            下载所选数据
          </button>
          <button
            class="danger"
            :disabled="!cloudSync.selection.length || cloudSync.isSyncing"
            @click="deleteCloud"
          >
            删除所选云端数据
          </button>
        </div>
        <div v-if="cloudSync.localBackup" class="backup-summary">
          <div>
            <strong>本机恢复点</strong>
            <p>{{ backupTitles }}</p>
            <small
              >{{ new Date(cloudSync.localBackup.createdAt).toLocaleString() }} ·
              只保存在当前浏览器</small
            >
          </div>
          <button :disabled="cloudSync.isSyncing" @click="restoreLocalBackup">恢复备份</button>
        </div>
      </section>
    </template>
    <Modal
      :open="!!downloadPreview"
      title="下载前确认"
      :return-focus="downloadButton"
      :width="600"
      @close="downloadPreview = null"
    >
      <template v-if="downloadPreview">
        <p>下面是本次将下载的云端副本。覆盖前会先保存本机备份，完成后可在此页面恢复。</p>
        <div class="download-preview-list">
          <div
            v-for="entry in downloadPreview.entries"
            :key="entry.id"
            class="download-preview-row"
          >
            <strong>{{ entry.title }}</strong>
            <span v-if="entry.available"
              >本机 {{ entry.localCount }} → 云端 {{ entry.remoteCount }}
              {{ entry.id === 'workspace' ? '个工作区' : '项设置' }}</span
            >
            <span v-else>云端暂无副本，本机保持原样</span>
          </div>
        </div>
        <p class="sync-note">备份仅保留最近一次覆盖前的数据；备份保存失败时将停止下载。</p>
      </template>
      <template #footer>
        <button class="preview-action" @click="downloadPreview = null">取消</button>
        <button
          class="preview-action primary"
          :disabled="
            !downloadPreview?.entries.some((entry) => entry.available) || cloudSync.isSyncing
          "
          @click="applyDownload"
        >
          备份并下载
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.backup-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  justify-content: space-between;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-light);
}
.backup-summary p {
  margin: 0.4rem 0;
}
.backup-summary small,
.download-preview-row span {
  color: var(--text-secondary);
}
.download-preview-list {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0;
}
.download-preview-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--bg-hover);
  border-radius: 8px;
}

.account-page {
  width: min(820px, calc(100% - 40px));
  min-height: 100%;
  margin: 0 auto;
  padding: 1.5rem 0 2rem;
}

header h1 {
  margin: 0.8rem 0 0;
  color: var(--text-primary);
  font-size: var(--font-size-5xl);
}

header p,
.section-head p,
.session-item small,
.sync-summary,
.sync-copy > small {
  color: var(--text-secondary);
  font-size: var(--font-size-control);
}

.back-btn,
.section-head button,
.session-item button,
.message button,
.cloud-actions button,
.backup-summary button,
.preview-action {
  padding: 0.48rem 0.78rem;
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  border-radius: 8px;
  background: var(--bg-glass);
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

.message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 1rem 0;
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
  background: var(--accent-bg);
  color: var(--accent);
}

.message button {
  flex: none;
  padding: 0.35rem 0.6rem;
}

.loading {
  padding: 3rem;
  color: var(--text-secondary);
  text-align: center;
}

.settings-card {
  margin-top: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
}

.section-head,
.session-item,
.cloud-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.section-head h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-title);
}

.session-list {
  margin-top: 0.8rem;
}

.session-item {
  padding: 0.75rem 0;
  border-top: 1px solid var(--border-light);
}

.session-item > div {
  display: flex;
  flex-direction: column;
}

.current-tag {
  width: fit-content;
  margin-top: 0.2rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--success-bg);
  color: var(--success);
  font-size: var(--font-size-meta);
}

.sync-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin: 0.9rem 0;
  padding: 0.8rem;
  border-radius: 10px;
  background: var(--bg-card);
}

.sync-summary strong {
  color: var(--accent);
  font-size: var(--font-size-title);
}

.sync-category-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.sync-category {
  position: relative;
  display: grid;
  min-width: 0;
  grid-template-columns: 24px 34px minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 0.75rem;
  background: var(--bg-card);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}

.sync-category:hover,
.sync-category.selected {
  border-color: rgba(var(--accent-rgb), 0.45);
  background: color-mix(in srgb, var(--accent-bg) 55%, var(--bg-card));
}

.sync-category input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.sync-check {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid var(--border-light);
  border-radius: 7px;
  color: transparent;
  font-size: var(--font-size-small);
  font-weight: 800;
}

.sync-category input:focus-visible + .sync-check {
  outline: 2px solid rgba(var(--accent-rgb), 0.45);
  outline-offset: 2px;
}

.sync-category input:checked + .sync-check {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.sync-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  background: var(--bg-subtle);
}

.sync-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.15rem;
}

.sync-copy > strong {
  color: var(--text-primary);
  font-size: var(--font-size-body);
}

.sync-copy > small {
  line-height: 1.35;
}

.sensitive-tag,
.cloud-tag {
  display: inline-flex;
  border-radius: 999px;
  padding: 0.08rem 0.35rem;
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.sensitive-tag {
  margin-left: 0.25rem;
  background: var(--warning-bg);
  color: var(--warning);
}

.cloud-tag {
  background: var(--success-bg);
  color: var(--success);
  white-space: nowrap;
}

.sync-note {
  margin: 0.8rem 0;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  line-height: 1.5;
}

.cloud-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.cloud-actions .primary,
.preview-action.primary {
  border: 0;
  background: var(--gradient-primary);
  color: white;
}

.danger {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .account-page {
    width: calc(100% - 24px);
    padding-top: 1rem;
  }

  .session-item {
    align-items: flex-start;
  }

  .sync-category-list {
    grid-template-columns: 1fr;
  }

  .sync-summary,
  .message {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
