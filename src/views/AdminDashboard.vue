<template>
  <div class="admin-dashboard">
    <div class="admin-sidebar">
      <div class="admin-header">
        <h2>⚙️ 管理后台</h2>
      </div>
      <nav class="admin-nav">
        <router-link
          to="/admin/questions"
          class="nav-item"
          :class="{ active: $route.path === '/admin/questions' }"
        >
          <span class="icon">📚</span>
          <span>题目管理</span>
        </router-link>
        <router-link
          to="/admin/categories"
          class="nav-item"
          :class="{ active: $route.path === '/admin/categories' }"
        >
          <span class="icon">📂</span>
          <span>分类管理</span>
        </router-link>
        <router-link to="/" class="nav-item back-to-home">
          <span class="icon">←</span>
          <span>返回首页</span>
        </router-link>
      </nav>
    </div>
    <div class="admin-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.admin-dashboard {
  display: flex;
  min-height: calc(100vh - 60px);
}

.admin-sidebar {
  width: 240px;
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  flex-direction: column;
}

.admin-header {
  padding: 24px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.admin-header h2 {
  margin: 0;
  font-size: 18px;
}

.admin-nav {
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border-left-color: white;
}

.nav-item.back-to-home {
  margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.icon {
  font-size: 20px;
}

.admin-content {
  flex: 1;
  padding: 24px;
  background: #f5f7fa;
  overflow-y: auto;
}
</style>
