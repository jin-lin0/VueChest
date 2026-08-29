<template>
  <div class="not-found">
    <div class="nf-code">404</div>
    <h1 class="nf-title">页面走丢了</h1>
    <p class="nf-desc">你访问的页面不存在，或该应用尚未安装。</p>
    <div class="nf-actions">
      <RouterLink to="/" class="nf-btn">返回首页</RouterLink>
      <button class="nf-btn nf-btn-ghost" @click="goBack">返回上一页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<style scoped>
.not-found {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
}

.nf-code {
  font-size: var(--font-size-display-lg);
  font-weight: 800;
  line-height: 1;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.nf-title {
  color: var(--text-primary);
  margin: 12px 0 8px;
  font-size: var(--font-size-4xl);
}

.nf-desc {
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.nf-actions {
  display: flex;
  gap: 12px;
}

.nf-btn {
  padding: 10px 20px;
  border-radius: var(--radius-pill);
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  text-decoration: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-body);
  transition: opacity var(--transition);
}

.nf-btn:hover {
  opacity: 0.9;
}

.nf-btn-ghost {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
</style>
