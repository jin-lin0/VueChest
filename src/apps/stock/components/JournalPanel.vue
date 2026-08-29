<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStockStore, type PriceAlert } from '@/stores/stock'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'StockJournalPanel' })

const stock = useStockStore()
const { addToast } = useToast()
const noteDraft = ref('')
const direction = ref<PriceAlert['direction']>('above')
const target = ref<number | null>(null)
const alerts = computed(() => stock.alerts.filter((item) => item.code === stock.stockCode))

watch(
  () => stock.stockCode,
  (code) => {
    noteDraft.value = code ? stock.getResearchNote(code) : ''
    target.value = Number(stock.result?.close || 0) || null
  },
  { immediate: true },
)

function formatPrice(value: number | string | null | undefined, digits = 2) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '--'
}

function saveNote() {
  if (!stock.stockCode) return
  stock.setResearchNote(stock.stockCode, noteDraft.value)
  addToast('success', '研究笔记已保存')
}

function createAlert() {
  if (!stock.result || !target.value || target.value <= 0) return
  stock.addAlert({
    code: stock.stockCode,
    name: stock.result.name,
    direction: direction.value,
    target: target.value,
  })
  addToast('success', '价格提醒已创建，将在刷新行情时检查')
}
</script>

<template>
  <section class="journal-grid">
    <article class="workspace-card note-card">
      <header class="card-header">
        <div><h2>研究笔记</h2></div>
        <button @click="saveNote">保存笔记</button>
      </header>
      <textarea
        v-model="noteDraft"
        rows="16"
        placeholder="记录投资逻辑、关键假设、证伪条件、计划观察的指标……"
      ></textarea>
      <p>建议写下“为什么关注”和“什么情况说明判断错了”，方便日后复盘。</p>
    </article>
    <article class="workspace-card alert-card">
      <header class="card-header">
        <div><h2>价格提醒</h2></div>
      </header>
      <div class="alert-form">
        <select v-model="direction">
          <option value="above">价格高于</option>
          <option value="below">价格低于</option>
        </select>
        <input v-model.number="target" type="number" min="0.01" step="0.01" />
        <button @click="createAlert">创建提醒</button>
      </div>
      <div v-if="alerts.length" class="alert-list">
        <div
          v-for="alert in alerts"
          :key="alert.id"
          :class="{ triggered: alert.triggeredAt, disabled: !alert.enabled }"
        >
          <button class="alert-toggle" @click="stock.toggleAlert(alert.id)"><i></i></button>
          <span>
            <strong
              >{{ alert.direction === 'above' ? '突破' : '跌破' }} ¥{{
                formatPrice(alert.target)
              }}</strong
            >
            <small>{{
              alert.triggeredAt
                ? `已于 ${new Date(alert.triggeredAt).toLocaleString()} 触发`
                : alert.enabled
                  ? '等待刷新行情时检查'
                  : '已暂停'
            }}</small>
          </span>
          <button class="alert-remove" @click="stock.removeAlert(alert.id)">×</button>
        </div>
      </div>
      <div v-else class="panel-empty">还没有价格提醒</div>
    </article>
  </section>
</template>

<style scoped>
.journal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
  gap: 14px;
}
.workspace-card {
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 20px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  box-shadow: 0 10px 36px rgba(15, 23, 42, 0.055);
}
.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.card-header h2 {
  margin-top: 3px;
  font-size: var(--font-size-title-lg);
}
.card-header button {
  border: 0;
  background: transparent;
  color: #0f766e;
  cursor: pointer;
  font-weight: 800;
}
.note-card textarea {
  width: 100%;
  margin-top: 16px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  outline: 0;
  resize: vertical;
  padding: 16px;
  background: var(--bg-page);
  color: var(--text-primary);
  line-height: 1.8;
}
.note-card textarea:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}
.note-card > p {
  margin-top: 9px;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.alert-form {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  gap: 7px;
  margin-top: 18px;
}
.alert-form select,
.alert-form input {
  min-width: 0;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  padding: 9px;
  background: var(--bg-page);
  color: var(--text-primary);
}
.alert-form > button {
  border: 0;
  border-radius: 9px;
  background: #0f766e;
  color: white;
  cursor: pointer;
  font-weight: 800;
}
.alert-list {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}
.alert-list > div {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--border-light);
  border-radius: 11px;
  padding: 11px;
}
.alert-list > div span {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.alert-list small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.alert-toggle {
  width: 28px;
  height: 17px;
  border: 0;
  border-radius: 99px;
  padding: 2px;
  background: #0f766e;
  cursor: pointer;
}
.alert-toggle i {
  display: block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  transform: translateX(11px);
}
.alert-list .disabled .alert-toggle {
  background: var(--border);
}
.alert-list .disabled .alert-toggle i {
  transform: none;
}
.alert-list .triggered {
  border-color: rgba(232, 163, 23, 0.35);
  background: rgba(232, 163, 23, 0.07);
}
.alert-remove {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.panel-empty {
  display: grid;
  min-height: 120px;
  place-items: center;
  color: var(--text-muted);
}
@media (max-width: 980px) {
  .journal-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 520px) {
  .workspace-card {
    padding: 15px;
  }
  .alert-form {
    grid-template-columns: 1fr 1fr;
  }
  .alert-form button {
    grid-column: 1/-1;
    padding: 10px;
  }
}
</style>
