<script setup lang="ts">
import { onMounted } from 'vue'
import { useExpenseStore } from './store'

defineOptions({ name: 'ExpenseView' })

const expenseStore = useExpenseStore()

onMounted(() => {
  expenseStore.init()
})

const formatMoney = (amount: number) => {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const formatDateHeader = (dateStr: string) => {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (dateStr === today.toISOString().slice(0, 10)) return '今天'
  if (dateStr === yesterday.toISOString().slice(0, 10)) return '昨天'

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(d)
}

const getDayTotal = (items: { type: string; amount: number }[]) => {
  const income = items.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const expense = items.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  return { income, expense }
}

const goBack = () => {
  history.back()
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-btn" @click="goBack">← 返回</button>

      <h1>记账本</h1>
    </header>

    <main class="expense-content">
      <div class="summary-cards">
        <div class="summary-card balance">
          <div class="summary-label">结余</div>
          <div class="summary-value" :class="{ negative: expenseStore.balance < 0 }">
            ¥{{ formatMoney(expenseStore.balance) }}
          </div>
        </div>
        <div class="summary-card income">
          <div class="summary-label">本月收入</div>
          <div class="summary-value">¥{{ formatMoney(expenseStore.monthlyIncome) }}</div>
        </div>
        <div class="summary-card expense">
          <div class="summary-label">本月支出</div>
          <div class="summary-value">¥{{ formatMoney(expenseStore.monthlyExpense) }}</div>
        </div>
      </div>

      <div class="toolbar">
        <button class="add-btn" @click="expenseStore.openForm()">+ 记一笔</button>
      </div>

      <div class="records-section">
        <template v-for="(items, dateKey) in expenseStore.groupedRecords" :key="dateKey">
          <div class="date-group">
            <div class="date-header">
              <span class="date-text">{{ formatDateHeader(dateKey as string) }}</span>
              <span class="date-summary">
                <template v-if="getDayTotal(items).income > 0">
                  收 ¥{{ formatMoney(getDayTotal(items).income) }}
                </template>
                <template v-if="getDayTotal(items).expense > 0">
                  支 ¥{{ formatMoney(getDayTotal(items).expense) }}
                </template>
              </span>
            </div>

            <div v-for="record in items" :key="record.id" class="record-item">
              <div class="record-icon" :class="record.type">
                {{ record.type === 'income' ? '↑' : '↓' }}
              </div>
              <div class="record-info">
                <div class="record-main">
                  <span class="record-category">{{ record.category }}</span>
                  <span class="record-amount" :class="record.type">
                    {{ record.type === 'income' ? '+' : '-' }}¥{{ formatMoney(record.amount) }}
                  </span>
                </div>
                <div class="record-sub" v-if="record.note">{{ record.note }}</div>
              </div>
              <div class="record-actions">
                <button class="action-btn edit" @click="expenseStore.openForm(record)">编辑</button>
                <button class="action-btn delete" @click="expenseStore.deleteRecord(record.id)">
                  删除
                </button>
              </div>
            </div>
          </div>
        </template>

        <div v-if="expenseStore.records.length === 0" class="empty-state">
          还没有账单记录，点击"记一笔"开始吧！
        </div>
      </div>

      <div v-if="expenseStore.showForm" class="modal-overlay" @click.self="expenseStore.closeForm">
        <div class="modal-content">
          <div class="modal-header">
            <h2>{{ expenseStore.editingId !== null ? '编辑记录' : '记一笔' }}</h2>
            <button class="close-btn" @click="expenseStore.closeForm">&times;</button>
          </div>

          <div class="type-tabs">
            <button
              class="type-tab"
              :class="{ active: expenseStore.formType === 'expense' }"
              @click="expenseStore.switchType('expense')"
            >
              支出
            </button>
            <button
              class="type-tab"
              :class="{ active: expenseStore.formType === 'income' }"
              @click="expenseStore.switchType('income')"
            >
              收入
            </button>
          </div>

          <div class="form-group">
            <label>金额</label>
            <input
              v-model="expenseStore.formAmount"
              type="number"
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>

          <div class="form-group">
            <label>分类</label>
            <div class="category-grid">
              <button
                v-for="cat in expenseStore.currentCategories"
                :key="cat"
                class="category-btn"
                :class="{ active: expenseStore.formCategory === cat }"
                @click="expenseStore.formCategory = cat"
              >
                {{ cat }}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>日期</label>
            <input v-model="expenseStore.formDate" type="date" />
          </div>

          <div class="form-group">
            <label>备注</label>
            <input v-model="expenseStore.formNote" type="text" placeholder="添加备注（可选）" />
          </div>

          <button class="submit-btn" @click="expenseStore.submitForm">
            {{ expenseStore.editingId !== null ? '更新' : '保存' }}
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.back-button {
  background-color: var(--info);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}

.back-button:hover {
  background-color: #2980b9;
}

.app-header h1 {
  margin: 0;
  font-size: 2rem;
  color: var(--text-primary);
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.summary-card {
  background-color: var(--bg-card);
  border-radius: 8px;
  padding: 1.2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.summary-label {
  font-size: 0.85rem;
  color: var(--text-dim);
  margin-bottom: 0.4rem;
}

.summary-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
}

.summary-card.income .summary-value {
  color: #2ecc71;
}

.summary-card.expense .summary-value {
  color: #e74c3c;
}

.summary-value.negative {
  color: #e74c3c;
}

.toolbar {
  margin-bottom: 1.5rem;
}

.add-btn {
  background-color: var(--info);
  color: white;
  border: none;
  padding: 0.7rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.add-btn:hover {
  background-color: #2980b9;
}

.records-section {
  background-color: var(--bg-card);
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.date-group {
  border-bottom: 1px solid var(--border-light);
}

.date-group:last-child {
  border-bottom: none;
}

.date-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 1rem;
  background-color: var(--bg-hover);
  font-size: 0.85rem;
}

.date-text {
  color: var(--text-primary);
  font-weight: 600;
}

.date-summary {
  color: var(--text-muted);
}

.record-item {
  display: flex;
  align-items: center;
  padding: 0.8rem 1rem;
  border-top: 1px solid var(--bg-hover);
  transition: background-color 0.2s;
}

.record-item:hover {
  background-color: var(--bg-hover);
}

.record-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 700;
  margin-right: 0.8rem;
  flex-shrink: 0;
}

.record-icon.income {
  background-color: #d5f5e3;
  color: #2ecc71;
}

.record-icon.expense {
  background-color: #fadbd8;
  color: #e74c3c;
}

.record-info {
  flex: 1;
  min-width: 0;
}

.record-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.record-category {
  font-size: 0.95rem;
  color: var(--text-primary);
  font-weight: 500;
}

.record-amount {
  font-size: 1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.record-amount.income {
  color: #2ecc71;
}

.record-amount.expense {
  color: #e74c3c;
}

.record-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}

.record-actions {
  display: flex;
  gap: 0.3rem;
  margin-left: 0.8rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.record-item:hover .record-actions {
  opacity: 1;
}

.action-btn {
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.75rem;
  color: white;
}

.action-btn.edit {
  background-color: var(--info);
}

.action-btn.edit:hover {
  background-color: #2980b9;
}

.action-btn.delete {
  background-color: #e74c3c;
}

.action-btn.delete:hover {
  background-color: #c0392b;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  color: var(--text-dim);
  font-style: italic;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: var(--bg-card);
  border-radius: 12px;
  padding: 2rem;
  width: 90%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-dim);
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary);
}

.type-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  overflow: hidden;
}

.type-tab {
  flex: 1;
  padding: 0.6rem;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
  background-color: var(--bg-hover);
  color: var(--text-primary);
  transition: all 0.2s;
}

.type-tab.active {
  background-color: var(--info);
  color: white;
}

.form-group {
  margin-bottom: 1.2rem;
}

.form-group label {
  display: block;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.4rem;
  font-size: 0.9rem;
}

.form-group input {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.category-btn {
  padding: 0.5rem;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  background-color: var(--bg-card);
  color: var(--text-primary);
  transition: all 0.2s;
}

.category-btn:hover {
  border-color: var(--info);
  color: var(--info);
}

.category-btn.active {
  background-color: var(--info);
  color: white;
  border-color: var(--info);
}

.submit-btn {
  width: 100%;
  padding: 0.8rem;
  background-color: #2ecc71;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  margin-top: 0.5rem;
}

.submit-btn:hover {
  background-color: #27ae60;
}

.back-btn {
  background: var(--info);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}
.back-btn:hover {
  background: #2980b9;
}

@media (max-width: 768px) {
  .app-container {
    padding: 1rem;
  }

  .app-header h1 {
    font-size: 1.4rem;
  }

  .back-button {
    padding: 0.4rem 0.8rem;
    font-size: 0.9rem;
  }

  .summary-cards {
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .summary-card {
    padding: 0.8rem;
  }

  .summary-label {
    font-size: 0.78rem;
  }

  .summary-value {
    font-size: 1.1rem;
  }

  .add-btn {
    width: 100%;
    padding: 0.7rem;
  }

  .record-item {
    padding: 0.6rem 0.8rem;
  }

  .record-icon {
    width: 30px;
    height: 30px;
    font-size: 0.85rem;
    margin-right: 0.6rem;
  }

  .record-main {
    flex-wrap: wrap;
  }

  .record-category {
    font-size: 0.9rem;
  }

  .record-amount {
    font-size: 0.9rem;
  }

  .record-actions {
    opacity: 1;
    margin-left: 0.5rem;
  }

  .date-header {
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .date-summary {
    font-size: 0.78rem;
  }

  .category-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .modal-content {
    padding: 1.2rem;
  }
}

</style>
