<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface Donor {
  name: string
  message?: string
  date: string
}

const donors = ref<Donor[]>([])
const status = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')

const sorted = computed(() =>
  [...donors.value].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
)

async function load() {
  status.value = 'loading'
  try {
    const url = `${import.meta.env.BASE_URL}donors.json`
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as Donor[]
    donors.value = Array.isArray(data) ? data : []
    status.value = donors.value.length ? 'ok' : 'empty'
  } catch {
    status.value = 'error'
  }
}

onMounted(load)
</script>

<template>
  <section class="donors-wall">
    <h3 class="donors-title">
      <span class="donors-heart">🙏</span> 鸣谢墙
      <span class="donors-sub">每一位支持者，我们都记在心里</span>
    </h3>

    <div v-if="status === 'loading'" class="donors-state">正在加载鸣谢名单…</div>

    <div v-else-if="status === 'error'" class="donors-state donors-error">
      鸣谢墙数据加载失败，请稍后重试。
    </div>

    <div v-else-if="status === 'empty'" class="donors-state">
      还没有伙伴登上鸣谢墙，期待你的名字～
    </div>

    <ul v-else class="donors-list">
      <li v-for="(d, i) in sorted" :key="i" class="donor-card">
        <div class="donor-head">
          <span class="donor-name">{{ d.name }}</span>
          <span class="donor-date">{{ d.date }}</span>
        </div>
        <p v-if="d.message" class="donor-msg">{{ d.message }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.donors-wall {
  margin-top: var(--space-2);
}
.donors-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--font-size-title-lg);
  color: var(--text-primary);
  margin: 0 0 var(--space-4);
}
.donors-heart {
  font-size: var(--font-size-title-lg);
}
.donors-sub {
  font-size: var(--font-size-small);
  font-weight: 400;
  color: var(--text-muted);
}
.donors-state {
  padding: var(--space-6);
  text-align: center;
  color: var(--text-muted);
  background: var(--bg-subtle);
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-md);
}
.donors-error {
  color: var(--danger, #e5484d);
  border-color: var(--danger, #e5484d);
}
.donors-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
}
.donor-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: var(--transition-fast);
}
.donor-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}
.donor-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.donor-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: var(--font-size-body);
}
.donor-date {
  font-size: var(--font-size-small);
  color: var(--text-muted);
  white-space: nowrap;
}
.donor-msg {
  margin: 0;
  font-size: var(--font-size-control);
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
