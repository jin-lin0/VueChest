<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/request'
import { CustomSelect, EmptyState, TrendChart } from '@/components'
import { formatFileSize } from '@/utils/common'

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

interface AnalyticsApp {
  id: number
  name: string
  icon: string
  category: string | null
  status: DeveloperApp['status']
  isListed: boolean
  downloads: number
  windowDownloads: number
  comments: number
  averageRating: number | null
  pendingVersions: number
  downloadTrend: number[]
  commentTrend: number[]
}

interface DeveloperAnalytics {
  range: { days: number; from: string; to: string; dates: string[] }
  totals: {
    apps: number
    listed: number
    pendingVersions: number
    downloads: number
    windowDownloads: number
    comments: number
    averageRating: number | null
  }
  series: { downloads: number[]; comments: number[] }
  apps: AnalyticsApp[]
  ratings: { rating: number; count: number }[]
  review: { averageHours: number | null; approvedCount: number; pendingCount: number }
}

const router = useRouter()
const apps = ref<DeveloperApp[]>([])
const loading = ref(true)
const error = ref('')
const expandedId = ref<number | null>(null)
const actionId = ref<number | null>(null)

const analytics = ref<DeveloperAnalytics | null>(null)
const analyticsLoading = ref(false)
const analyticsError = ref('')
const rangeDays = ref(90)
const rangeOptions = [
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
  { label: '近 180 天', value: 180 },
  { label: '近 365 天', value: 365 },
]

const stats = computed(() => ({
  apps: apps.value.length,
  downloads: apps.value.reduce((sum, app) => sum + app.downloads, 0),
  pending: apps.value.reduce(
    (sum, app) => sum + app.versions.filter((version) => version.reviewStatus === 'pending').length,
    0,
  ),
  comments: apps.value.reduce((sum, app) => sum + app.rating.commentCount, 0),
  listed: apps.value.filter((app) => app.status === 'approved' && app.isListed).length,
  averageRating: (() => {
    const rated = apps.value.filter(
      (app) => app.rating.averageRating != null && app.rating.commentCount > 0,
    )
    const count = rated.reduce((sum, app) => sum + app.rating.commentCount, 0)
    if (!count) return null
    const score = rated.reduce(
      (sum, app) => sum + Number(app.rating.averageRating) * app.rating.commentCount,
      0,
    )
    return score / count
  })(),
}))

const ratingTotal = computed(() =>
  (analytics.value?.ratings ?? []).reduce((sum, item) => sum + item.count, 0),
)

const ratingMax = computed(() =>
  Math.max(1, ...(analytics.value?.ratings ?? []).map((item) => item.count)),
)

const reviewDurationLabel = computed(() => {
  const hours = analytics.value?.review.averageHours
  if (hours == null) return '—'
  if (hours < 1) return '不到 1 小时'
  if (hours < 24) return `${hours} 小时`
  return `${(hours / 24).toFixed(1)} 天`
})

// 表格按「区间内实际下载」排序，比累计数更能反映最近的表现
const rankedApps = computed(() =>
  [...(analytics.value?.apps ?? [])].sort((left, right) => right.windowDownloads - left.windowDownloads),
)

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

async function loadAnalytics() {
  analyticsLoading.value = true
  analyticsError.value = ''
  try {
    const { data } = await api.get<{ data: DeveloperAnalytics }>(
      `/api/developer/analytics?days=${rangeDays.value}`,
    )
    analytics.value = data
  } catch (reason) {
    analyticsError.value = reason instanceof Error ? reason.message : '数据看板加载失败'
  } finally {
    analyticsLoading.value = false
  }
}

watch(rangeDays, () => void loadAnalytics())

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

onMounted(() => {
  void loadApps()
  void loadAnalytics()
})
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
      <div>
        <strong>{{ stats.apps }}</strong
        ><span>我的应用</span>
      </div>
      <div>
        <strong>{{ stats.downloads }}</strong
        ><span>累计下载</span>
      </div>
      <div>
        <strong>{{ stats.pending }}</strong
        ><span>待审版本</span>
      </div>
      <div>
        <strong>{{ stats.comments }}</strong
        ><span>评论数量</span>
      </div>
      <div>
        <strong>{{ stats.listed }}</strong
        ><span>正在上架</span>
      </div>
      <div>
        <strong>{{ stats.averageRating == null ? '—' : stats.averageRating.toFixed(1) }}</strong>
        <span>综合评分</span>
      </div>
    </div>

    <p v-if="error" class="error-message">{{ error }}</p>

    <section class="analytics">
      <header class="analytics-head">
        <div>
          <h2>数据看板</h2>
          <p v-if="analytics">
            {{ analytics.range.from }} ~ {{ analytics.range.to }} · 共
            {{ analytics.range.days }} 天
          </p>
          <p v-else>按时间维度查看下载与评论变化。</p>
        </div>
        <CustomSelect v-model="rangeDays" :options="rangeOptions" size="sm" width="136px" />
      </header>

      <p v-if="analyticsError" class="error-message">{{ analyticsError }}</p>
      <p v-else-if="!analytics" class="loading-state">看板加载中...</p>

      <template v-else>
        <div class="analytics-metrics">
          <div>
            <strong>{{ analytics.totals.windowDownloads }}</strong>
            <span>区间下载</span>
          </div>
          <div>
            <strong>{{ analytics.totals.comments }}</strong>
            <span>区间新增评论</span>
          </div>
          <div>
            <strong>{{ reviewDurationLabel }}</strong>
            <span>平均审核时长</span>
          </div>
          <div>
            <strong>{{ analytics.totals.pendingVersions }}</strong>
            <span>待审版本</span>
          </div>
        </div>

        <div class="analytics-charts">
          <div class="chart-card">
            <div class="chart-head">
              <h3>下载趋势</h3>
              <small>累计 {{ analytics.totals.downloads }} 次</small>
            </div>
            <TrendChart
              :values="analytics.series.downloads"
              :labels="analytics.range.dates"
              unit="次"
              aria-label="下载趋势"
            />
          </div>
          <div class="chart-card">
            <div class="chart-head">
              <h3>评论趋势</h3>
              <small>累计 {{ stats.comments }} 条</small>
            </div>
            <TrendChart
              :values="analytics.series.comments"
              :labels="analytics.range.dates"
              variant="bars"
              unit="条"
              aria-label="评论趋势"
            />
          </div>
        </div>

        <div class="analytics-grid">
          <div class="chart-card">
            <div class="chart-head">
              <h3>应用表现</h3>
              <small>按区间下载排序</small>
            </div>
            <table class="app-table">
              <thead>
                <tr>
                  <th>应用</th>
                  <th>区间下载</th>
                  <th>累计</th>
                  <th>趋势</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in rankedApps" :key="item.id">
                  <td>
                    <span class="table-icon">{{ item.icon }}</span>
                    <span class="table-name">{{ item.name }}</span>
                  </td>
                  <td>{{ item.windowDownloads }}</td>
                  <td class="muted">{{ item.downloads }}</td>
                  <td class="spark-cell">
                    <TrendChart
                      :values="item.downloadTrend"
                      :height="32"
                      :aria-label="`${item.name} 下载趋势`"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="chart-card">
            <div class="chart-head">
              <h3>评分分布</h3>
              <small>{{ ratingTotal ? `${ratingTotal} 条评分` : '暂无评分' }}</small>
            </div>
            <ul class="rating-bars">
              <li v-for="item in [...analytics.ratings].reverse()" :key="item.rating">
                <span class="rating-label">{{ item.rating }} 星</span>
                <span class="rating-track">
                  <span
                    class="rating-fill"
                    :style="{ width: `${(item.count / ratingMax) * 100}%` }"
                  />
                </span>
                <span class="rating-count">{{ item.count }}</span>
              </li>
            </ul>
            <p class="rating-summary">
              平均评分
              <strong>{{
                analytics.totals.averageRating == null
                  ? '—'
                  : analytics.totals.averageRating.toFixed(1)
              }}</strong>
              · 已通过 {{ analytics.review.approvedCount }} 个版本
            </p>
          </div>
        </div>
      </template>
    </section>

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
              <span v-if="app.status === 'approved' && !app.isListed" class="status-unlisted"
                >已下架</span
              >
            </div>
            <small>线上版本 v{{ app.version }} · {{ app.category || '未分类' }}</small>
          </div>
        </div>

        <div class="app-metrics">
          <span>{{ app.downloads }} 次下载</span>
          <span>{{ app.rating.commentCount }} 条评论</span>
          <span>{{
            app.rating.averageRating ? `${app.rating.averageRating.toFixed(1)} 分` : '暂无评分'
          }}</span>
          <span>{{ app.versions.length }} 个版本</span>
        </div>

        <div class="app-actions">
          <button @click="router.push({ path: `/market/${app.id}`, query: { from: 'developer' } })">
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
  font-size: var(--font-size-5xl);
}

.page-header p,
.app-copy small,
.version-row small {
  color: var(--text-secondary);
  font-size: var(--font-size-control);
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  font-size: var(--font-size-heading);
}

.stats-grid span,
.app-metrics {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
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
  font-size: var(--font-size-5xl);
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
  font-size: var(--font-size-meta);
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
  font-size: var(--font-size-control);
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
  font-size: var(--font-size-small);
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
  font-size: var(--font-size-small);
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
  font-size: var(--font-size-control);
}

.withdraw-btn {
  border-color: var(--danger);
  color: var(--danger);
}

.analytics {
  margin-bottom: 1.2rem;
}

.analytics-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.analytics-head h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-heading);
}

.analytics-head p {
  margin: 0.2rem 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}

.analytics-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
  margin-bottom: 0.8rem;
}

.analytics-metrics > div {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  background: var(--bg-glass);
}

.analytics-metrics strong {
  color: var(--text-primary);
  font-size: var(--font-size-4xl);
}

.analytics-metrics span {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}

.analytics-charts,
.analytics-grid {
  display: grid;
  gap: 0.8rem;
  margin-bottom: 0.8rem;
}

.analytics-charts {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.analytics-grid {
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
}

.chart-card {
  padding: 0.9rem 1rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
}

.chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.chart-head h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-title);
}

.chart-head small {
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
}

.app-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-control);
}

.app-table th {
  padding: 0.3rem 0.4rem;
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  font-weight: 500;
  text-align: right;
}

.app-table th:first-child {
  text-align: left;
}

.app-table td {
  padding: 0.4rem;
  border-top: 1px solid var(--border-light);
  color: var(--text-primary);
  text-align: right;
  vertical-align: middle;
}

.app-table td:first-child {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  text-align: left;
}

.table-icon {
  flex: none;
  font-size: var(--font-size-title);
}

.table-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--text-secondary);
}

.spark-cell {
  width: 92px;
}

.rating-bars {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rating-bars li {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
}

.rating-track {
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: var(--bg-subtle);
}

.rating-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--gradient-primary);
  transition: width var(--transition);
}

.rating-count {
  text-align: right;
}

.rating-summary {
  margin: 0.8rem 0 0;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}

.rating-summary strong {
  color: var(--text-primary);
  font-size: var(--font-size-title);
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

  .analytics-metrics,
  .analytics-charts,
  .analytics-grid {
    grid-template-columns: minmax(0, 1fr);
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
