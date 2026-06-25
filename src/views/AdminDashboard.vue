<template>
  <div class="dashboard">
    <div class="dashboard-header">
      <div class="header-content">
        <h2>欢迎回来，{{ authStore.user?.username }}!</h2>
        <p>{{ greetingText }}，这是您的管理后台仪表盘</p>
      </div>
      <div class="header-time">
        <div class="current-time">{{ currentTime }}</div>
        <div class="current-date">{{ currentDate }}</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" v-for="stat in stats" :key="stat.label">
        <div class="stat-icon" :style="{ background: stat.bg }">{{ stat.icon }}</div>
        <div class="stat-content">
          <div class="stat-value">
            <span v-if="stat.loading" class="stat-skeleton"></span>
            <span v-else>{{ stat.value }}</span>
          </div>
          <div class="stat-label">{{ stat.label }}</div>
          <div v-if="stat.sub" class="stat-sub">{{ stat.sub }}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="dashboard-card quick-actions">
        <div class="card-header">
          <h3>⚡ 快捷操作</h3>
        </div>
        <div class="action-grid">
          <router-link to="/admin/questions" class="action-card">
            <span class="action-icon">📚</span>
            <span class="action-title">管理题目</span>
            <span class="action-desc">新增、编辑、删除面试题目</span>
          </router-link>
          <router-link to="/admin/categories" class="action-card">
            <span class="action-icon">📂</span>
            <span class="action-title">管理分类</span>
            <span class="action-desc">管理题目分类标签</span>
          </router-link>
          <router-link to="/admin/apps" class="action-card">
            <span class="action-icon">📱</span>
            <span class="action-title">应用管理</span>
            <span class="action-desc">管理市场应用的上架与下架</span>
          </router-link>
        </div>
      </div>

      <div class="dashboard-card system-info">
        <div class="card-header">
          <h3>ℹ️ 系统信息</h3>
        </div>
        <div class="info-list">
          <div class="info-item">
            <span class="info-label">管理员角色</span>
            <span class="info-value">{{ getRoleLabel(authStore.user?.role || '') }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">登录时间</span>
            <span class="info-value">{{ formatDateTime(authStore.user?.lastLoginAt) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">系统版本</span>
            <span class="info-value">VueChest v1.0</span>
          </div>
          <div class="info-item">
            <span class="info-label">前端框架</span>
            <span class="info-value">Vue 3 + TypeScript</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/utils/request'

const authStore = useAuthStore()

const currentTime = ref('')
const currentDate = ref('')
let timer: ReturnType<typeof setInterval>

const stats = ref([
  {
    icon: '📱',
    label: '应用总数',
    value: '-',
    sub: '',
    loading: true,
    bg: 'linear-gradient(135deg, #667eea, #764ba2)',
  },
  {
    icon: '📂',
    label: '分类数量',
    value: '-',
    sub: '',
    loading: true,
    bg: 'linear-gradient(135deg, #f59e0b, #ef4444)',
  },
  {
    icon: '✨',
    label: '今日新增应用',
    value: '-',
    sub: '',
    loading: true,
    bg: 'linear-gradient(135deg, #10b981, #059669)',
  },
  {
    icon: '📝',
    label: '今日新增题目',
    value: '-',
    sub: '',
    loading: true,
    bg: 'linear-gradient(135deg, #f97316, #ea580c)',
  },
  {
    icon: '👥',
    label: '今日访问',
    value: '-',
    sub: '累计访问',
    loading: true,
    bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  },
])

const greetingText = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

function getRoleLabel(role: string) {
  const roles: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
  }
  return roles[role] || role
}

function formatDateTime(dateStr?: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  currentDate.value = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

async function fetchStats() {
  try {
    const [sData, cData] = await Promise.all([
      api.get<{ data: { totalApps: number; todayNewApps: number; todayNewQuestions: number; todayVisits: number; totalVisits: number } }>('/api/stats/dashboard', { auth: false }),
      api.get<{ length: number }[]>('/api/questions/categories'),
    ])

    if (sData) {
      stats.value[0].value = String(sData.data.totalApps ?? '-')
      stats.value[2].value = String(sData.data.todayNewApps ?? '-')
      stats.value[3].value = String(sData.data.todayNewQuestions ?? '-')
      stats.value[4].value = String(sData.data.todayVisits ?? '-')
      stats.value[4].sub = `累计 ${sData.data.totalVisits ?? 0} 次`
    }

    if (cData) {
      stats.value[1].value = Array.isArray(cData) ? String(cData.length) : '-'
    }
  } catch {
    stats.value[0].value = '?'
    stats.value[1].value = '?'
  } finally {
    stats.value.forEach((s) => (s.loading = false))
  }
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
  fetchStats()
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dashboard-header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  padding: 28px 32px;
  border-radius: 16px;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-content h2 {
  margin: 0 0 6px 0;
  font-size: 26px;
  font-weight: 700;
}

.header-content p {
  margin: 0;
  opacity: 0.7;
  font-size: 15px;
}

.header-time { text-align: right; }
.current-time { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.current-date { font-size: 13px; opacity: 0.6; margin-top: 2px; }

.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }

.stat-card {
  background: var(--bg-card);
  padding: 24px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 18px;
  box-shadow: var(--shadow-sm);
  transition: all 0.25s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  flex-shrink: 0;
}

.stat-content { flex: 1; min-width: 0; }

.stat-value {
  font-size: 30px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.stat-skeleton {
  display: inline-block;
  width: 60px;
  height: 30px;
  background: linear-gradient(90deg, var(--border-light) 25%, var(--bg-hover) 50%, var(--border-light) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.stat-label { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.stat-sub { font-size: 11px; color: var(--text-muted); margin-top: 1px; }

.dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 768px) { .dashboard-grid { grid-template-columns: 1fr; } }

.dashboard-card {
  background: var(--bg-card);
  border-radius: 14px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.card-header h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: var(--text-primary);
}

.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  text-decoration: none;
  color: var(--text-primary);
  transition: all 0.2s;
}

.action-card:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.action-icon { font-size: 32px; }
.action-title { font-size: 15px; font-weight: 600; }
.action-desc { font-size: 12px; color: var(--text-muted); }

.info-list { display: flex; flex-direction: column; gap: 0; }

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
}

.info-item:last-child { border-bottom: none; }

.info-label { color: var(--text-secondary); font-size: 14px; }
.info-value { color: var(--text-primary); font-weight: 500; font-size: 14px; }
</style>
