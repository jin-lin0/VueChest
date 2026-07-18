<template>
  <div class="custom-select" :class="{ open: isOpen, disabled }" ref="selectRef">
    <div class="select-trigger" @click="toggleDropdown" :class="{ active: isOpen }">
      <span class="trigger-content">
        <span class="trigger-icon" v-if="selectedOption?.icon">{{ selectedOption.icon }}</span>
        <span class="trigger-text">{{ selectedOption?.label || placeholder }}</span>
      </span>
      <span class="trigger-arrow">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </div>
    
    <Transition name="dropdown">
      <div class="select-dropdown" v-if="isOpen">
        <div class="dropdown-search" v-if="searchable">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索..."
            class="search-input"
            ref="searchInput"
            @click.stop
          />
        </div>
        <div class="dropdown-options" :class="{ 'has-search': searchable }">
          <div
            v-for="option in filteredOptions"
            :key="option.value"
            class="option-item"
            :class="{
              selected: model === option.value,
              disabled: option.disabled
            }"
            @click="selectOption(option)"
          >
            <span class="option-icon" v-if="option.icon">{{ option.icon }}</span>
            <span class="option-label">{{ option.label }}</span>
            <span class="option-check" v-if="model === option.value">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 8L7 11L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </div>
          <div class="no-options" v-if="filteredOptions.length === 0">
            暂无选项
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch, watchEffect } from 'vue'

export interface SelectOption {
  value: string | number
  label: string
  icon?: string
  disabled?: boolean
}

const model = defineModel<string | number | null>({ default: null })

const props = withDefaults(defineProps<{
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
  defaultFirst?: boolean
}>(), {
  placeholder: '请选择',
  disabled: false,
  searchable: false,
  defaultFirst: false,
})

const emit = defineEmits<{
  change: [value: string | number]
}>()

const selectRef = ref<HTMLElement>()
const searchInput = ref<HTMLInputElement>()
const isOpen = ref(false)
const searchQuery = ref('')

const selectedOption = computed(() => {
  if (model.value === null || model.value === undefined) return undefined
  return props.options.find(opt => opt.value === model.value)
})

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options
  const query = searchQuery.value.toLowerCase()
  return props.options.filter(opt => 
    opt.label.toLowerCase().includes(query) || 
    opt.value.toString().toLowerCase().includes(query)
  )
})

const toggleDropdown = () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value && props.searchable) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
}

const selectOption = (option: SelectOption) => {
  if (option.disabled) return
  model.value = option.value
  emit('change', option.value)
  isOpen.value = false
  searchQuery.value = ''
}

const handleClickOutside = (event: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    isOpen.value = false
    searchQuery.value = ''
  }
}

watch(isOpen, (val) => {
  if (val) {
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
    searchQuery.value = ''
  }
})

watchEffect(() => {
  if (props.defaultFirst && model.value == null && props.options.length > 0) {
    model.value = (props.options.find(o => !o.disabled) ?? props.options[0]).value
  }
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.custom-select {
  position: relative;
  min-width: 150px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 2px solid var(--border-light);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  min-height: 44px;
}

.select-trigger:hover {
  border-color: var(--accent-light);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.12);
}

.select-trigger.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.custom-select.disabled .select-trigger {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--bg-subtle);
}

.trigger-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.trigger-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.trigger-text {
  color: var(--text-body);
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trigger-arrow {
  color: var(--text-muted);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.select-trigger.active .trigger-arrow {
  transform: rotate(180deg);
  color: var(--accent);
}

/* 下拉面板 */
.select-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12), 0 2px 10px rgba(0, 0, 0, 0.08);
  z-index: 1000;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

/* 搜索框 */
.dropdown-search {
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid var(--border-light);
  border-radius: 10px;
  font-size: 0.9rem;
  outline: none;
  transition: all 0.3s ease;
  background: var(--bg-subtle);
}

.search-input:focus {
  border-color: var(--accent);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-input::placeholder {
  color: var(--text-muted);
}

/* 选项列表 */
.dropdown-options {
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
}

.dropdown-options.has-search {
  max-height: 220px;
}

.dropdown-options::-webkit-scrollbar {
  width: 6px;
}

.dropdown-options::-webkit-scrollbar-track {
  background: transparent;
}

.dropdown-options::-webkit-scrollbar-thumb {
  background: var(--border-light);
  border-radius: 3px;
}

.dropdown-options::-webkit-scrollbar-thumb:hover {
  background: var(--border);
}

.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.option-item:hover {
  background: linear-gradient(135deg, var(--accent-bg) 0%, var(--accent-light) 100%);
}

.option-item.selected {
  background: var(--gradient-primary);
  color: white;
}

.option-item.selected:hover {
  background: var(--gradient-primary);
}

.option-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.option-item.disabled:hover {
  background: transparent;
}

.option-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.option-label {
  flex: 1;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-check {
  color: white;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.no-options {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}

/* 下拉动画 */
.dropdown-enter-active {
  animation: dropdown-in 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.dropdown-leave-active {
  animation: dropdown-out 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes dropdown-in {
  0% {
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes dropdown-out {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
  }
}

/* 响应式 */
@media (max-width: 768px) {
  .custom-select {
    min-width: 100%;
  }
  
  .select-trigger {
    padding: 12px 14px;
  }
}
</style>
