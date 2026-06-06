<template>
  <div class="dashboard">
    <div class="dashboard-header">
      <h2>欢迎回来，{{ authStore.admin?.username }}!</h2>
      <p>这是您的管理后台仪表盘</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📚</div>
        <div class="stat-content">
          <div class="stat-value">-</div>
          <div class="stat-label">题目数量</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📂</div>
        <div class="stat-content">
          <div class="stat-value">-</div>
          <div class="stat-label">分类数量</div>
        </div>
      </div>
    </div>

    <div class="dashboard-content">
      <div class="quick-actions">
        <h3>快捷操作</h3>
        <div class="action-grid">
          <router-link to="/admin/questions" class="action-card">
            <span class="action-icon">📚</span>
            <span>管理题目</span>
          </router-link>
          <router-link to="/admin/categories" class="action-card">
            <span class="action-icon">📂</span>
            <span>管理分类</span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dashboard-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 32px;
  border-radius: 16px;
  color: white;
}

.dashboard-header h2 {
  margin: 0 0 8px 0;
  font-size: 28px;
}

.dashboard-header p {
  margin: 0;
  opacity: 0.9;
  font-size: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.stat-card {
  background: white;
  padding: 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  font-size: 48px;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #111827;
  line-height: 1;
}

.stat-label {
  font-size: 14px;
  color: #6b7280;
  margin-top: 6px;
}

.dashboard-content {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.quick-actions h3 {
  margin: 0 0 20px 0;
  font-size: 20px;
  color: #111827;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  text-decoration: none;
  color: #374151;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s;
}

.action-card:hover {
  border-color: #667eea;
  background: #f0f4ff;
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.action-icon {
  font-size: 40px;
}
</style>
