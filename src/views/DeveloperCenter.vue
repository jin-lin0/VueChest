<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/request'
import { EmptyState } from '@/components'
import { formatFileSize } from '@/utils'

interface VersionReview {
  id: number
  action: 'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'resubmitted'
  category?: string | null
  message?: string | null
  createdAt: string
}

interface DeveloperVersion {
  id: number
  version: string
  size?: number
  releaseNotes?: string
  status: 'active' | 'yanked'
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  reviewCategory?: string | null
  reviewNote?: string | null
  reviewedAt?: string | null
  submissionCount: number
  reviews: VersionReview[]
  createdAt: string
}

interface DeveloperApp {
  id: number
  name: string
  icon: string
  description: string
  version: string
  category: string
  downloads: number
  status: 'pending' | 'approved' | 'rejected'
  isListed: boolean
  createdAt: string
  updatedAt: string
  versions: DeveloperVersion[]
  rating: { commentCount: number; averageRating: number | null }
}

const router = useRouter()
const apps = ref<DeveloperApp[]>([])
const loading = ref(true)
const error = ref('')
const expandedId = ref<number | null>(null)
const actionId = ref<number | null>(null)

const stats = computed(() => ({
  apps: apps.value.length,
  downloads: apps.value.reduce((sum, app) => sum + app.downloads, 0),
  pending: apps.value.reduce(
    (sum, app) => sum + app.versions.filter((version) => version.reviewStatus === 'pending').length,
    0,
  ),
  comments: apps.value.reduce((sum, app) => sum + app.rating.commentCount, 0),
}))

const reviewLabel: Record<DeveloperVersion['reviewStatus'], string> = {
  pending: '审核中',
  approved: '已通过',
  rejected: '已拒绝',
  withdrawn: '已撤回',
}

const appStatusLabel: Record<DeveloperApp['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
}

const categoryLabel: Record<string, string> = {
  functionality: '功能问题',
  security: '安全或权限问题',
  metadata: '描述或素材问题',
  compatibility: '兼容性问题',
  other: '其他问题',
}

const actionLabel: Record<VersionReview['action'], string> = {
  submitted: '首次提交',
  approved: '审核通过',
  rejected: '审核拒绝',
  withdrawn: '开发者撤回',
  resubmitted: '重新提交',
}

async function loadApps() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get<{ data: DeveloperApp[] }>('/api/developer/apps')
    apps.value = data
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '开发者数据加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleListing(app: DeveloperApp) {
  actionId.value = app.id
  try {
    await api.put(`/api/developer/apps/${app.id}/listing`, { isListed: !app.isListed })
    await loadApps()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '操作失败'
  } finally {
    actionId.value = null
  }
}

async function withdraw(app: DeveloperApp, version: DeveloperVersion) {
  actionId.value = version.id
  try {
    await api.post(`/api/developer/apps/${app.id}/versions/${version.id}/withdraw`)
    await loadApps()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '撤回失败'
  } finally {
    actionId.value = null
  }
}

async function resubmit(app: DeveloperApp, version: DeveloperVersion) {
  actionId.value = version.id
  try {
    await api.post(`/api/developer/apps/${app.id}/versions/${version.id}/resubmit`)
    await loadApps()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '重新提交失败'
  } finally {
    actionId.value = null
  }
}

onMounted(() => void loadApps())
</script>

<template>
  <div class="developer-page">
    <header class="page-header">
      <div>
        <button class="back-btn" @click="router.push('/')">← 返回首页</button>
        <h1>开发者中心</h1>
        <p>发布和管理你的市场应用。</p>
      </div>
      <button
        class="publish-btn"
        @click="router.push({ path: '/market/upload', query: { from: 'developer' } })"
      >
        发布新应用
      </button>
    </header>

    <div class="stats-grid">
      <div><strong>{{ stats.apps }}</strong><span>我的应用</span></div>
      <div><strong>{{ stats.downloads }}</strong><span>累计下载</span></div>
      <div><strong>{{ stats.pending }}</strong><span>待审版本</span></div>
      <div><strong>{{ stats.comments }}</strong><span>评论数量</span></div>
    </div>

    <p v-if="error" class="error-message">{{ error }}</p>
    <p v-if="loading" class="loading-state">加载中...</p>
    <EmptyState v-else-if="apps.length === 0" icon="📦" title="还没有发布应用">
      <button
        class="publish-btn"
        @click="router.push({ path: '/market/upload', query: { from: 'developer' } })"
      >
        发布第一个应用
      </button>
    </EmptyState>

    <main v-else class="app-list">
      <article v-for="app in apps" :key="app.id" class="app-card">
        <div class="app-head">
          <span class="app-icon">{{ app.icon }}</span>
          <div class="app-copy">
            <div class="app-title">
              <strong>{{ app.name }}</strong>
              <span :class="`status-${app.status}`">{{ appStatusLabel[app.status] }}</span>
              <span v-if="app.status === 'approved' && !app.isListed" class="status-unlisted">已下架</span>
            </div>
            <small>线上版本 v{{ app.version }} · {{ app.category || '未分类' }}</small>
          </div>
        </div>

        <div class="app-metrics">
          <span>{{ app.downloads }} 次下载</span>
          <span>{{ app.rating.commentCount }} 条评论</span>
          <span>{{ app.rating.averageRating ? `${app.rating.averageRating.toFixed(1)} 分` : '暂无评分' }}</span>
          <span>{{ app.versions.length }} 个版本</span>
        </div>

        <div class="app-actions">
          <button
            @click="router.push({ path: `/market/${app.id}`, query: { from: 'developer' } })"
          >
            查看详情
          </button>
          <button
            @click="
              router.push({ path: '/market/upload', query: { appId: app.id, from: 'developer' } })
            "
          >
            发布新版本
          </button>
          <button @click="expandedId = expandedId === app.id ? null : app.id">
            {{ expandedId === app.id ? '收起版本' : '版本历史' }}
          </button>
          <button
            v-if="app.status === 'approved'"
            :disabled="actionId === app.id"
            @click="toggleListing(app)"
          >
            {{ app.isListed ? '下架应用' : '重新上架' }}
          </button>
        </div>

        <div v-if="expandedId === app.id" class="version-list">
          <div v-for="version in app.versions" :key="version.id" class="version-row">
            <div>
              <strong>v{{ version.version }}</strong>
              <span :class="`review-${version.reviewStatus}`">
                {{ reviewLabel[version.reviewStatus] }}
              </span>
              <small>{{ new Date(version.createdAt).toLocaleString() }}</small>
            </div>
            <p>{{ version.releaseNotes || '未填写更新说明' }}</p>
            <div
              v-if="version.reviewStatus === 'rejected' && version.reviewNote"
              class="review-feedback"
            >
              <strong>{{ categoryLabel[version.reviewCategory || 'other'] || '审核意见' }}</strong>
              <p>{{ version.reviewNote }}</p>
              <small v-if="version.reviewedAt">
                {{ new Date(version.reviewedAt).toLocaleString() }}
              </small>
            </div>
            <span>{{ formatFileSize(version.size || 0) }}</span>
            <button
              v-if="version.reviewStatus === 'pending'"
              :disabled="actionId === version.id"
              class="withdraw-btn"
              @click="withdraw(app, version)"
            >
              撤回审核
            </button>
            <div
              v-if="version.reviewStatus === 'rejected' || version.reviewStatus === 'withdrawn'"
              class="resubmit-actions"
            >
              <button :disabled="actionId === version.id" @click="resubmit(app, version)">
                直接重新提交
              </button>
              <button
                @click="
                  router.push({
                    path: '/market/upload',
                    query: { appId: app.id, from: 'developer' },
                  })
                "
              >
                修改后重新提交
              </button>
            </div>
            <details v-if="version.reviews.length" class="review-history">
              <summary>
                审核记录 {{ version.reviews.length }} 条 · 已提交 {{ version.submissionCount }} 次
              </summary>
              <ol>
                <li v-for="review in version.reviews" :key="review.id">
                  <div>
                    <strong>{{ actionLabel[review.action] }}</strong>
                    <time>{{ new Date(review.createdAt).toLocaleString() }}</time>
                  </div>
                  <span v-if="review.category">{{ categoryLabel[review.category] }}</span>
                  <p v-if="review.message">{{ review.message }}</p>
                </li>
              </ol>
            </details>
          </div>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped>
.developer-page {
  width: min(980px, calc(100% - 40px));
  min-height: 100%;
  margin: 0 auto;
  padding: 1.5rem 0 2rem;
}

.page-header,
.app-head,
.app-title,
.app-actions,
.version-row > div {
  display: flex;
  align-items: center;
}

.page-header {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.page-header h1 {
  margin: 0.7rem 0 0;
  color: var(--text-primary);
  font-size: 1.7rem;
}

.page-header p,
.app-copy small,
.version-row small {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.back-btn,
.publish-btn,
.app-actions button,
.withdraw-btn {
  padding: 0.48rem 0.76rem;
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  border-radius: 8px;
  background: var(--bg-glass);
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

.publish-btn {
  border: 0;
  background: var(--gradient-primary);
  color: white;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
  margin-bottom: 1rem;
}

.stats-grid > div {
  display: flex;
  flex-direction: column;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  background: var(--bg-glass);
}

.stats-grid strong {
  color: var(--text-primary);
  font-size: 1.35rem;
}

.stats-grid span,
.app-metrics {
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.error-message {
  margin-bottom: 0.7rem;
  color: var(--danger);
}

.loading-state {
  padding: 3rem;
  color: var(--text-secondary);
  text-align: center;
}

.app-list {
  display: grid;
  gap: 0.8rem;
}

.app-card {
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
}

.app-title {
  flex-wrap: wrap;
  gap: 0.4rem;
}

.app-title span,
.version-row div > span {
  padding: 0.12rem 0.42rem;
  border-radius: 999px;
  font-size: 0.68rem;
}

.status-approved,
.review-approved {
  background: var(--success-bg);
  color: var(--success);
}

.status-pending,
.review-pending {
  background: var(--warning-bg);
  color: var(--warning);
}

.status-rejected,
.status-unlisted,
.review-rejected,
.review-withdrawn {
  background: var(--danger-bg);
  color: var(--danger);
}

.app-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0.8rem 0;
}

.app-actions {
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-light);
}

.version-list {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.8rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--border-light);
}

.version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.65rem;
  align-items: center;
  padding: 0.7rem;
  border-radius: 9px;
  background: var(--bg-card);
}

.review-feedback,
.review-history {
  grid-column: 1 / -1;
}

.review-feedback {
  padding: 0.65rem 0.75rem;
  border-left: 3px solid var(--danger);
  border-radius: 6px;
  background: var(--danger-bg);
}

.review-feedback strong {
  color: var(--danger);
  font-size: 0.8rem;
}

.review-feedback p {
  margin: 0.25rem 0;
  color: var(--text-primary);
}

.review-feedback small {
  color: var(--text-secondary);
}

.resubmit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.resubmit-actions button {
  padding: 0.38rem 0.62rem;
  border: 1px solid rgba(var(--accent-rgb), 0.25);
  border-radius: 7px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

.review-history summary {
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.78rem;
}

.review-history ol {
  display: grid;
  gap: 0.45rem;
  margin: 0.55rem 0 0;
  padding: 0;
  list-style: none;
}

.review-history li {
  padding: 0.55rem 0.65rem;
  border-radius: 7px;
  background: var(--bg-page);
}

.review-history li > div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.review-history time,
.review-history li > span {
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.review-history li p {
  margin: 0.25rem 0 0;
}

.version-row > div {
  flex-wrap: wrap;
  gap: 0.4rem;
}

.version-row p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.withdraw-btn {
  border-color: var(--danger);
  color: var(--danger);
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 680px) {
  .developer-page {
    width: calc(100% - 24px);
    padding-top: 1rem;
  }

  .page-header {
    align-items: flex-start;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .version-row {
    grid-template-columns: 1fr;
  }

  .version-row p {
    grid-column: auto;
  }

  .review-feedback,
  .review-history {
    grid-column: auto;
  }
}
</style>
