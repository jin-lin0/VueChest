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
              selected: modelValue === option.value,
              disabled: option.disabled
            }"
            @click="selectOption(option)"
          >
            <span class="option-icon" v-if="option.icon">{{ option.icon }}</span>
            <span class="option-label">{{ option.label }}</span>
            <span class="option-check" v-if="modelValue === option.value">
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

export interface SelectOption {
  value: string | number
  label: string
  icon?: string
  disabled?: boolean
}

interface Props {
  modelValue: string | number
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  disabled: false,
  searchable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  change: [value: string | number]
}>()

const selectRef = ref<HTMLElement>()
const searchInput = ref<HTMLInputElement>()
const isOpen = ref(false)
const searchQuery = ref('')

const selectedOption = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue)
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
  emit('update:modelValue', option.value)
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
  background: white;
  border: 2px solid #e8e8e8;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  min-height: 44px;
}

.select-trigger:hover {
  border-color: #a8b4ff;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.12);
}

.select-trigger.active {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.custom-select.disabled .select-trigger {
  opacity: 0.6;
  cursor: not-allowed;
  background: #f5f5f5;
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
  color: #333;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trigger-arrow {
  color: #999;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.select-trigger.active .trigger-arrow {
  transform: rotate(180deg);
  color: #667eea;
}

/* 下拉面板 */
.select-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12), 0 2px 10px rgba(0, 0, 0, 0.08);
  z-index: 1000;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

/* 搜索框 */
.dropdown-search {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid #e8e8e8;
  border-radius: 10px;
  font-size: 0.9rem;
  outline: none;
  transition: all 0.3s ease;
  background: #fafafa;
}

.search-input:focus {
  border-color: #667eea;
  background: white;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-input::placeholder {
  color: #bbb;
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
  background: #ddd;
  border-radius: 3px;
}

.dropdown-options::-webkit-scrollbar-thumb:hover {
  background: #ccc;
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
  background: linear-gradient(135deg, #f5f7ff 0%, #eef1ff 100%);
}

.option-item.selected {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.option-item.selected:hover {
  background: linear-gradient(135deg, #5a6fd6 0%, #6a4296 100%);
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
  color: #999;
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
