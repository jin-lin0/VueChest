<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMarketStore } from '@/stores/market'
import type { MarketAppItem, MarketAppVersion } from '@/stores/market'
import { useAuthStore } from '@/stores/auth'
import { formatFileSize } from '@/utils/common'
import AppComments from '@/components/AppComments.vue'
import { Modal } from '@/components'
import type { MarketReportReason } from '@/stores/market'

const route = useRoute()
const router = useRouter()
const market = useMarketStore()
const auth = useAuthStore()

const app = ref<MarketAppItem | null>(null)
const loading = ref(true)
const installing = ref(false)
const uninstalling = ref(false)
const updating = ref(false)
const error = ref('')
const actionError = ref('')
const versions = ref<MarketAppVersion[]>([])
const permissionModalOpen = ref(false)
const pendingAction = ref<'install' | 'update' | 'version' | null>(null)
const pendingVersion = ref<MarketAppVersion | null>(null)
const reportModalOpen = ref(false)
const reportReason = ref<MarketReportReason>('privacy')
const reportDetails = ref('')
const reportSubmitting = ref(false)
const reportMessage = ref('')

const screenshots = computed(() => app.value?.screenshots || [])
const activeShot = ref(0)

function prevShot() {
  if (screenshots.value.length === 0) return
  activeShot.value = (activeShot.value - 1 + screenshots.value.length) % screenshots.value.length
}
function nextShot() {
  if (screenshots.value.length === 0) return
  activeShot.value = (activeShot.value + 1) % screenshots.value.length
}
function setShot(i: number) {
  activeShot.value = i
}

onMounted(async () => {
  const id = Number(route.params.id)
  if (!id) {
    router.push(returnContext.value.path)
    return
  }
  app.value = await market.fetchAppDetail(id)
  loading.value = false
  if (!app.value) {
    error.value = '应用不存在'
  } else {
    void market.checkForUpdates()
    versions.value = await market.fetchAppVersions(id).catch(() => [])
  }
})

async function handleInstall() {
  if (!app.value) return
  installing.value = true
  actionError.value = ''
  try {
    await market.installApp(app.value.id)
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '安装失败'
  } finally {
    installing.value = false
  }
}

async function handleUninstall() {
  if (!app.value) return
  uninstalling.value = true
  actionError.value = ''
  try {
    await market.uninstallApp(app.value.id)
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '卸载失败'
  } finally {
    uninstalling.value = false
  }
}

async function handleUpdate() {
  if (!app.value) return
  updating.value = true
  actionError.value = ''
  try {
    await market.updateApp(app.value.id, { approvePermissions: true })
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '更新失败'
  } finally {
    updating.value = false
  }
}

const isInstalled = computed(() => (app.value ? market.isInstalled(app.value.id) : false))
const hasUpdate = computed(() => (app.value ? market.hasUpdate(app.value.id) : false))
const installedVersion = computed(() =>
  app.value ? market.installedApps.find((item) => item.id === app.value?.id)?.version : undefined,
)
const requestedPermissions = computed(() =>
  pendingAction.value === 'version'
    ? pendingVersion.value?.allowNetwork || []
    : app.value?.allowNetwork || [],
)
const addedPermissions = computed(() =>
  app.value ? market.permissionExpansion(app.value.id, requestedPermissions.value) : [],
)
const returnContext = computed(() => {
  const source = route.query.from
  if (source === 'developer') return { path: '/developer', label: '返回开发者中心' }
  if (source === 'updates') return { path: '/market/updates', label: '返回应用更新' }
  if (source === 'installed') return { path: '/market/installed', label: '返回已安装应用' }
  return { path: '/market', label: '返回市场' }
})

async function handleInstallVersion(version: MarketAppVersion) {
  if (!app.value) return
  actionError.value = ''
  try {
    await market.installVersion(app.value.id, version.id, { approvePermissions: true })
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '版本安装失败'
  }
}

function requestAction(action: 'install' | 'update' | 'version', version?: MarketAppVersion) {
  pendingAction.value = action
  pendingVersion.value = version || null
  permissionModalOpen.value = true
}

async function confirmPermissionAction() {
  const action = pendingAction.value
  const version = pendingVersion.value
  permissionModalOpen.value = false
  if (action === 'install') await handleInstall()
  else if (action === 'update') await handleUpdate()
  else if (action === 'version' && version) await handleInstallVersion(version)
}

function openReport() {
  reportMessage.value = ''
  if (!auth.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  reportModalOpen.value = true
}

async function submitReport() {
  if (!app.value || reportDetails.value.trim().length < 5) return
  reportSubmitting.value = true
  reportMessage.value = ''
  try {
    await market.reportApp(app.value.id, {
      reason: reportReason.value,
      details: reportDetails.value.trim(),
    })
    reportModalOpen.value = false
    reportDetails.value = ''
    reportMessage.value = '举报已提交，管理员会在后台处理。'
  } catch (reason) {
    reportMessage.value = reason instanceof Error ? reason.message : '举报提交失败'
  } finally {
    reportSubmitting.value = false
  }
}

async function handleVersionStatus(version: MarketAppVersion) {
  if (!app.value) return
  actionError.value = ''
  try {
    await market.setVersionStatus(
      app.value.id,
      version.id,
      version.status === 'active' ? 'yanked' : 'active',
    )
    app.value = await market.fetchAppDetail(app.value.id)
    versions.value = await market.fetchAppVersions(Number(route.params.id))
    await market.checkForUpdates({ force: true })
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '版本状态更新失败'
  }
}
</script>

<template>
  <div class="detail-container">
    <header class="detail-header">
      <button class="back-btn" @click="router.push(returnContext.path)">
        ← {{ returnContext.label }}
      </button>
    </header>

    <div v-if="loading" class="loading-state">加载中...</div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button class="back-btn" @click="router.push(returnContext.path)">
        {{ returnContext.label }}
      </button>
    </div>

    <template v-else-if="app">
      <div class="detail-hero">
        <div class="hero-icon">{{ app.icon }}</div>
        <div class="hero-info">
          <h1>
            {{ app.name }}
            <span v-if="app.isOfficial" class="official-badge">官方</span>
          </h1>
          <div class="hero-meta">
            <span class="meta-item">v{{ app.version }}</span>
            <span class="meta-item">{{ app.author }}</span>
            <span class="meta-item">{{ app.category }}</span>
            <span class="meta-item">{{ formatFileSize(app.size) }}</span>
            <span class="meta-item">{{ app.downloads }} 次下载</span>
          </div>
          <p class="hero-desc">{{ app.description }}</p>
          <div class="hero-actions">
            <button
              v-if="!isInstalled"
              class="install-btn"
              :disabled="installing"
              @click="requestAction('install')"
            >
              {{ installing ? '安装中...' : '安装' }}
            </button>
            <button
              v-if="isInstalled && hasUpdate"
              class="install-btn"
              :disabled="updating"
              @click="requestAction('update')"
            >
              {{ updating ? '更新中...' : '更新到最新版' }}
            </button>
            <button
              v-if="isInstalled"
              class="uninstall-btn"
              :disabled="uninstalling || updating"
              @click="handleUninstall"
            >
              {{ uninstalling ? '卸载中...' : '卸载' }}
            </button>
          </div>
          <p v-if="actionError" class="action-error">{{ actionError }}</p>
          <p v-if="reportMessage" class="action-message">{{ reportMessage }}</p>
        </div>
      </div>

      <div class="detail-section security-section">
        <div class="section-heading">
          <div>
            <h2>安装权限与安全</h2>
            <p>应用仅在隔离沙箱中运行，安装前会再次核对应用包。</p>
          </div>
          <button class="report-btn" @click="openReport">举报应用</button>
        </div>
        <div class="security-grid">
          <div>
            <strong>联网权限</strong>
            <span>{{ app.allowNetwork?.length ? app.allowNetwork.join('、') : '不允许联网' }}</span>
          </div>
          <div>
            <strong>本地数据</strong>
            <span>仅能访问自己的隔离存储</span>
          </div>
          <div>
            <strong>完整性</strong>
            <span>{{
              app.sha256 ? `SHA-256 ${app.sha256.slice(0, 12)}…` : '旧版本未记录校验值'
            }}</span>
          </div>
        </div>
      </div>

      <div v-if="app.readme" class="detail-section">
        <h2>说明</h2>
        <div class="readme-content">{{ app.readme }}</div>
      </div>

      <div v-if="app.releaseNotes" class="detail-section">
        <h2>本次更新</h2>
        <div class="readme-content">{{ app.releaseNotes }}</div>
      </div>

      <div v-if="versions.length" class="detail-section">
        <h2>版本历史</h2>
        <div class="version-list">
          <div v-for="version in versions" :key="version.id" class="version-item">
            <div class="version-main">
              <strong>v{{ version.version }}</strong>
              <span v-if="version.version === app.version" class="version-tag">市场最新版</span>
              <span v-if="version.version === installedVersion" class="version-tag installed"
                >当前安装</span
              >
              <span v-if="version.status === 'yanked'" class="version-tag yanked">已下架</span>
              <time>{{ new Date(version.createdAt).toLocaleDateString() }}</time>
            </div>
            <p>{{ version.releaseNotes || '未提供更新说明。' }}</p>
            <div class="version-actions">
              <button
                v-if="
                  version.status === 'active' &&
                  version.version !== installedVersion &&
                  (isInstalled || version.version !== app.version)
                "
                :disabled="market.isUpdating(app.id)"
                @click="requestAction('version', version)"
              >
                {{ installedVersion ? '安装此版本' : '安装' }}
              </button>
              <button
                v-if="auth.isAdmin"
                class="version-admin-btn"
                @click="handleVersionStatus(version)"
              >
                {{ version.status === 'active' ? '下架版本' : '恢复版本' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="screenshots.length" class="detail-section">
        <h2>截图</h2>
        <div class="shot-viewer">
          <button class="shot-nav prev" :disabled="screenshots.length <= 1" @click="prevShot">
            ‹
          </button>
          <img
            :src="screenshots[activeShot]"
            :alt="`${app.name} 截图 ${activeShot + 1}`"
            class="shot-main"
          />
          <button class="shot-nav next" :disabled="screenshots.length <= 1" @click="nextShot">
            ›
          </button>
        </div>
        <div v-if="screenshots.length > 1" class="shot-thumbs">
          <img
            v-for="(s, i) in screenshots"
            :key="i"
            :src="s"
            class="shot-thumb"
            :class="{ active: i === activeShot }"
            @click="setShot(i)"
          />
        </div>
      </div>

      <AppComments v-if="app" :app-id="app.id" />

      <Modal
        :open="permissionModalOpen"
        title="确认安装权限"
        width="min(520px, 94vw)"
        @close="permissionModalOpen = false"
      >
        <div class="permission-dialog">
          <p>
            将{{ pendingAction === 'update' ? '更新' : '安装' }}
            <strong>{{ app.name }}</strong>
            <template v-if="pendingVersion"> v{{ pendingVersion.version }}</template>
          </p>
          <ul>
            <li>在隔离的 iframe 沙箱内运行，不能注册宿主路由或读取宿主存储。</li>
            <li>本地数据只写入该应用自己的命名空间。</li>
            <li v-if="requestedPermissions.length">
              允许访问：{{ requestedPermissions.join('、') }}
            </li>
            <li v-else>不允许访问网络。</li>
            <li>下载完成后核对 SHA-256；不一致会立即终止安装。</li>
          </ul>
          <p v-if="addedPermissions.length" class="permission-warning">
            本次新增联网权限：{{ addedPermissions.join('、') }}
          </p>
          <div class="dialog-actions">
            <button @click="permissionModalOpen = false">取消</button>
            <button class="install-btn" @click="confirmPermissionAction">确认并继续</button>
          </div>
        </div>
      </Modal>

      <Modal
        :open="reportModalOpen"
        title="举报应用"
        width="min(500px, 94vw)"
        @close="reportModalOpen = false"
      >
        <div class="report-dialog">
          <label>
            <span>问题类型</span>
            <select v-model="reportReason">
              <option value="malware">恶意行为或病毒</option>
              <option value="privacy">隐私或越权访问</option>
              <option value="fraud">欺诈或误导</option>
              <option value="offensive">不当内容</option>
              <option value="copyright">版权问题</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label>
            <span>问题说明</span>
            <textarea
              v-model="reportDetails"
              rows="5"
              maxlength="1000"
              placeholder="请说明复现方式、风险或受影响范围（至少 5 个字）"
            ></textarea>
            <small>{{ reportDetails.length }}/1000</small>
          </label>
          <p v-if="reportMessage" class="action-error">{{ reportMessage }}</p>
          <div class="dialog-actions">
            <button @click="reportModalOpen = false">取消</button>
            <button
              class="install-btn"
              :disabled="reportSubmitting || reportDetails.trim().length < 5"
              @click="submitReport"
            >
              {{ reportSubmitting ? '提交中...' : '提交举报' }}
            </button>
          </div>
        </div>
      </Modal>
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
  background: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.8);
  padding: 0.5rem 1rem;
  border-radius: 10px;
  cursor: pointer;
  font-size: var(--font-size-body);
  color: var(--accent);
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
  color: var(--text-secondary);
}

.detail-hero {
  display: flex;
  gap: 2rem;
  background: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.hero-icon {
  font-size: var(--font-size-display-md);
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-page), var(--bg-subtle));
  border-radius: 24px;
  flex-shrink: 0;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.hero-info h1 {
  font-size: var(--font-size-5xl);
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 0.6rem;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.meta-item {
  font-size: var(--font-size-control);
  color: var(--text-secondary);
  background: var(--tag-bg);
  padding: 0.25rem 0.7rem;
  border-radius: 6px;
}

.hero-desc {
  font-size: var(--font-size-title);
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 1.2rem;
}

.hero-actions {
  display: flex;
  gap: 0.8rem;
}

.install-btn {
  padding: 0.7rem 2rem;
  background: var(--gradient-primary);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: var(--font-size-title);
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
  background: var(--bg-card);
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: 10px;
  font-size: var(--font-size-title);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.uninstall-btn:hover:not(:disabled) {
  background: var(--danger-bg);
}

.uninstall-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-error {
  margin-top: 0.7rem;
  color: var(--danger);
  font-size: var(--font-size-body);
}

.action-message {
  margin-top: 0.7rem;
  color: var(--success);
  font-size: var(--font-size-body);
}

.section-heading,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.section-heading h2 {
  margin-bottom: 0.25rem;
}

.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-control);
}

.report-btn,
.dialog-actions > button:not(.install-btn) {
  padding: 0.48rem 0.75rem;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.security-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
  margin-top: 1rem;
}

.security-grid > div {
  min-width: 0;
  padding: 0.8rem;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-card);
}

.security-grid strong,
.security-grid span {
  display: block;
}

.security-grid strong {
  margin-bottom: 0.35rem;
  color: var(--text-primary);
  font-size: var(--font-size-control);
}

.security-grid span {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  line-height: 1.45;
  text-overflow: ellipsis;
}

.permission-dialog > p:first-child {
  color: var(--text-primary);
}

.permission-dialog ul {
  padding-left: 1.2rem;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
  line-height: 1.8;
}

.permission-warning {
  padding: 0.7rem 0.8rem;
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  color: #b45309;
  font-size: var(--font-size-control);
}

.dialog-actions {
  justify-content: flex-end;
  margin-top: 1rem;
}

.dialog-actions .install-btn {
  padding: 0.55rem 1rem;
  font-size: var(--font-size-body);
}

.report-dialog label,
.report-dialog label > span {
  display: block;
}

.report-dialog label {
  margin-bottom: 0.9rem;
  color: var(--text-primary);
  font-size: var(--font-size-control);
}

.report-dialog select,
.report-dialog textarea {
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  box-sizing: border-box;
}

.report-dialog small {
  display: block;
  margin-top: 0.25rem;
  color: var(--text-secondary);
  text-align: right;
}

.version-list {
  display: grid;
  gap: 0.7rem;
}

.version-item {
  padding: 0.85rem 1rem;
  border: 1px solid var(--border-light);
  border-radius: 11px;
  background: var(--bg-card);
}

.version-main,
.version-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.version-main time {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}

.version-tag {
  padding: 0.12rem 0.42rem;
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: var(--font-size-meta);
}

.version-tag.installed {
  background: var(--success-bg);
  color: var(--success);
}

.version-tag.yanked {
  background: var(--danger-bg);
  color: var(--danger);
}

.version-item p {
  margin: 0.55rem 0;
  color: var(--text-secondary);
  font-size: var(--font-size-control);
  white-space: pre-wrap;
}

.version-actions {
  justify-content: flex-end;
}

.version-actions button {
  padding: 0.35rem 0.65rem;
  border: 1px solid rgba(var(--accent-rgb), 0.25);
  border-radius: 7px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}

.version-actions .version-admin-btn {
  border-color: var(--danger);
  color: var(--danger);
}

.detail-section {
  background: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.detail-section h2 {
  font-size: var(--font-size-title-lg);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 1rem;
}

.readme-content {
  font-size: var(--font-size-body-lg);
  color: var(--text-secondary);
  line-height: 1.8;
  white-space: pre-wrap;
}

.official-badge {
  display: inline-block;
  vertical-align: middle;
  margin-left: 0.6rem;
  padding: 0.15rem 0.6rem;
  font-size: var(--font-size-small);
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  border-radius: 6px;
  letter-spacing: 0.02em;
}

/* Screenshot carousel */
.shot-viewer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.shot-main {
  max-width: 100%;
  max-height: 420px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  object-fit: contain;
  background: var(--bg-subtle);
}

.shot-nav {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: var(--font-size-4xl);
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.shot-nav:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.shot-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.shot-thumbs {
  display: flex;
  gap: 0.6rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.shot-thumb {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
  cursor: pointer;
  border: 2px solid transparent;
  opacity: 0.6;
  transition: all 0.2s ease;
}

.shot-thumb:hover {
  opacity: 1;
}

.shot-thumb.active {
  opacity: 1;
  border-color: var(--accent);
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

  .security-grid {
    grid-template-columns: 1fr;
  }

  .section-heading {
    align-items: flex-start;
  }
}
</style>
