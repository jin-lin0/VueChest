<script setup lang="ts">
import { useStockStore } from '@/stores/stock'

defineOptions({ name: 'StockNoticesPanel' })
const stock = useStockStore()
</script>

<template>
  <section class="stock-panel">
    <header class="panel-heading">
      <div>
        <h2>公司公告</h2>
        <p>优先阅读财报、业绩预告、重大事项和治理变化。</p>
      </div>
      <span>{{ stock.notices.length }} 条</span>
    </header>
    <div v-if="stock.notices.length" class="notice-list">
      <a
        v-for="notice in stock.notices"
        :key="notice.id"
        :href="notice.url"
        target="_blank"
        rel="noreferrer"
      >
        <time>{{ notice.date }}</time
        ><b>{{ notice.category }}</b> <strong>{{ notice.title }}</strong
        ><span>打开原文 ↗</span>
      </a>
    </div>
    <div v-else class="panel-empty">暂无公告数据</div>
  </section>
</template>

<style scoped>
.stock-panel {
  min-height: 560px;
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 20px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  box-shadow: 0 10px 36px rgba(15, 23, 42, 0.055);
}
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-light);
}
.panel-heading h2 {
  font-size: 18px;
}
.panel-heading p {
  color: var(--text-secondary);
  font-size: 11px;
}
.panel-heading > span {
  color: var(--text-muted);
  font-size: 10px;
}
.notice-list {
  display: grid;
  margin-top: 10px;
}
.notice-list a {
  display: grid;
  grid-template-columns: 90px 110px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 15px 8px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
  text-decoration: none;
}
.notice-list time,
.notice-list span {
  color: var(--text-muted);
  font-size: 10px;
}
.notice-list b {
  color: #0f766e;
  font-size: 10px;
}
.notice-list strong {
  font-size: 12px;
}
.panel-empty {
  display: grid;
  min-height: 300px;
  place-items: center;
  color: var(--text-muted);
}
@media (max-width: 980px) {
  .notice-list a {
    grid-template-columns: 80px minmax(0, 1fr) auto;
  }
  .notice-list b {
    display: none;
  }
}
@media (max-width: 520px) {
  .stock-panel {
    padding: 15px;
  }
}
</style>
