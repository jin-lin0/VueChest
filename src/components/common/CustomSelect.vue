<template>
  <div
    class="custom-select"
    :class="{ open: isOpen, disabled, block: props.block, [`size-${props.size}`]: true }"
    :style="props.width ? { width: props.width } : undefined"
    ref="selectRef"
  >
    <div
      :id="`${selectId}-trigger`"
      ref="triggerRef"
      class="select-trigger"
      :class="{ active: isOpen }"
      role="combobox"
      :tabindex="disabled ? -1 : 0"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="`${selectId}-listbox`"
      :aria-activedescendant="isOpen ? activeOptionId : undefined"
      :aria-disabled="disabled"
      :title="selectedOption?.label || placeholder"
      @click="toggleDropdown"
      @keydown="handleTriggerKeydown"
    >
      <span class="trigger-content">
        <span class="trigger-icon" v-if="selectedOption?.icon">{{ selectedOption.icon }}</span>
        <span class="trigger-text">{{ selectedOption?.label || placeholder }}</span>
      </span>
      <span class="trigger-arrow">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </div>

    <Teleport to="body">
      <Transition name="dropdown">
        <div
          class="select-dropdown"
          v-if="isOpen"
          ref="dropdownRef"
          :style="dropdownStyle"
          @click.stop
        >
          <div class="dropdown-search" v-if="searchable">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索..."
              class="search-input"
              ref="searchInput"
              aria-label="搜索选项"
              @click.stop
              @keydown="handleSearchKeydown"
            />
          </div>
          <div
            :id="`${selectId}-listbox`"
            class="dropdown-options vc-scrollbar vc-scrollbar--thin"
            :class="{ 'has-search': searchable }"
            role="listbox"
            :aria-labelledby="`${selectId}-trigger`"
          >
            <div
              v-for="(option, index) in filteredOptions"
              :id="`${selectId}-option-${index}`"
              :key="option.value"
              class="option-item"
              :class="{
                selected: model === option.value,
                disabled: option.disabled,
                'keyboard-active': activeIndex === index,
              }"
              role="option"
              :aria-selected="model === option.value"
              :aria-disabled="option.disabled || undefined"
              @click="selectOption(option)"
              @mouseenter="activeIndex = index"
            >
              <span class="option-icon" v-if="option.icon">{{ option.icon }}</span>
              <slot name="option" :option="option" :selected="model === option.value">
                <span class="option-label">{{ option.label }}</span>
                <span class="option-check" v-if="model === option.value">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 8L7 11L12 5"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
              </slot>
            </div>
            <div class="no-options" v-if="filteredOptions.length === 0" role="status">暂无选项</div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, nextTick, useId, watch, watchEffect } from 'vue'
import { getHorizontalDropdownLayout } from './custom-select-layout'

export interface SelectOption {
  value: string | number
  label: string
  icon?: string
  disabled?: boolean
}

const model = defineModel<string | number | null>({ default: null })

const props = withDefaults(
  defineProps<{
    options: SelectOption[]
    placeholder?: string
    disabled?: boolean
    searchable?: boolean
    defaultFirst?: boolean
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    width?: string
  }>(),
  {
    placeholder: '请选择',
    disabled: false,
    searchable: false,
    defaultFirst: false,
    size: 'md',
    block: false,
    width: '',
  },
)

const emit = defineEmits<{
  change: [value: string | number]
}>()

const selectId = useId()
const selectRef = ref<HTMLElement>()
const triggerRef = ref<HTMLElement>()
const searchInput = ref<HTMLInputElement>()
const dropdownRef = ref<HTMLElement>()
const isOpen = ref(false)
const searchQuery = ref('')
const activeIndex = ref(-1)
// 下拉面板用 Teleport 送到 body，按触发器坐标 fixed 定位，避免被 overflow:auto 的弹窗裁切
const dropdownStyle = ref<Record<string, string>>({})

const selectedOption = computed(() => {
  if (model.value === null || model.value === undefined) return undefined
  return props.options.find((opt) => opt.value === model.value)
})

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options
  const query = searchQuery.value.toLowerCase()
  return props.options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(query) || opt.value.toString().toLowerCase().includes(query),
  )
})

const activeOptionId = computed(() =>
  activeIndex.value >= 0 ? `${selectId}-option-${activeIndex.value}` : undefined,
)

function findEnabledIndex(start: number, direction: 1 | -1) {
  const options = filteredOptions.value
  if (!options.length) return -1

  for (let step = 0; step < options.length; step += 1) {
    const index = (start + step * direction + options.length) % options.length
    if (!options[index].disabled) return index
  }
  return -1
}

function resetActiveIndex(preferLast = false) {
  const selectedIndex = filteredOptions.value.findIndex(
    (option) => option.value === model.value && !option.disabled,
  )
  if (selectedIndex >= 0) {
    activeIndex.value = selectedIndex
    return
  }
  const start = preferLast ? filteredOptions.value.length - 1 : 0
  activeIndex.value = findEnabledIndex(start, preferLast ? -1 : 1)
}

function openDropdown(preferLast = false) {
  if (props.disabled) return
  isOpen.value = true
  resetActiveIndex(preferLast)
  if (props.searchable) nextTick(() => searchInput.value?.focus())
}

function closeDropdown(restoreFocus = false) {
  isOpen.value = false
  searchQuery.value = ''
  activeIndex.value = -1
  if (restoreFocus) nextTick(() => triggerRef.value?.focus())
}

const toggleDropdown = () => {
  if (props.disabled) return
  if (isOpen.value) closeDropdown()
  else openDropdown()
}

function moveActiveOption(direction: 1 | -1) {
  if (!isOpen.value) {
    openDropdown(direction === -1)
    return
  }
  const start =
    activeIndex.value < 0
      ? direction === 1
        ? 0
        : filteredOptions.value.length - 1
      : activeIndex.value + direction
  activeIndex.value = findEnabledIndex(start, direction)
}

function selectActiveOption() {
  const option = filteredOptions.value[activeIndex.value]
  if (option) selectOption(option)
}

function handleKeyboard(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActiveOption(event.key === 'ArrowDown' ? 1 : -1)
    return true
  }
  if (event.key === 'Home' || event.key === 'End') {
    if (!isOpen.value) return false
    event.preventDefault()
    const preferLast = event.key === 'End'
    activeIndex.value = findEnabledIndex(
      preferLast ? filteredOptions.value.length - 1 : 0,
      preferLast ? -1 : 1,
    )
    return true
  }
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    closeDropdown(true)
    return true
  }
  if (event.key === 'Enter' && isOpen.value) {
    event.preventDefault()
    selectActiveOption()
    return true
  }
  return false
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (handleKeyboard(event)) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (isOpen.value) selectActiveOption()
    else openDropdown()
  } else if (event.key === 'Tab') {
    closeDropdown()
  }
}

function handleSearchKeydown(event: KeyboardEvent) {
  handleKeyboard(event)
}

// 根据触发器位置计算下拉面板 fixed 定位；底部空间不足时自动上翻
function positionDropdown() {
  const el = selectRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const viewportPadding = 8
  const { left, width } = getHorizontalDropdownLayout(
    r.left,
    r.width,
    window.innerWidth,
    viewportPadding,
  )
  let top = r.bottom + 8
  const dd = dropdownRef.value
  if (dd) {
    const ddHeight = dd.offsetHeight
    if (top + ddHeight > window.innerHeight && r.top - 8 - ddHeight > 0) {
      top = r.top - 8 - ddHeight
    }
  }
  dropdownStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
  }
}

function selectOption(option: SelectOption) {
  if (option.disabled) return
  model.value = option.value
  emit('change', option.value)
  closeDropdown(true)
}

const handleClickOutside = (event: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

watch(isOpen, (val) => {
  if (val) {
    document.addEventListener('click', handleClickOutside)
    // 弹窗/页面滚动或窗口尺寸变化时让下拉跟随触发器
    window.addEventListener('scroll', positionDropdown, true)
    window.addEventListener('resize', positionDropdown)
    nextTick(positionDropdown)
  } else {
    document.removeEventListener('click', handleClickOutside)
    window.removeEventListener('scroll', positionDropdown, true)
    window.removeEventListener('resize', positionDropdown)
    searchQuery.value = ''
  }
})

watch(filteredOptions, () => resetActiveIndex())

watchEffect(() => {
  if (props.defaultFirst && model.value == null && props.options.length > 0) {
    model.value = (props.options.find((o) => !o.disabled) ?? props.options[0]).value
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', positionDropdown, true)
  window.removeEventListener('resize', positionDropdown)
})
</script>

<style scoped>
.custom-select {
  position: relative;
  box-sizing: border-box;
  min-width: min(150px, 100%);
  max-width: 100%;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 42px;
  padding: 0 14px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  font-size: var(--font-size-body);
}

.select-trigger:hover {
  border-color: var(--accent-light);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.12);
}

.select-trigger.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.select-trigger:focus-visible {
  border-color: var(--accent);
  outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  outline-offset: 2px;
}

.custom-select.disabled .select-trigger {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--bg-subtle);
}

/* 紧凑尺寸：表格操作列、气泡内等空间有限处 */
.custom-select.size-sm .select-trigger {
  height: 34px;
  padding: 0 0.85rem;
  border-width: 1px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-body);
}
.custom-select.size-sm .trigger-text {
  font-size: var(--font-size-body);
}
.custom-select.size-sm .trigger-arrow svg {
  width: 10px;
  height: 10px;
}

/* 大尺寸：强调场景（如筛选栏主分类） */
.custom-select.size-lg .select-trigger {
  height: 48px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: var(--font-size-body-lg);
}

/* 撑满父容器宽度（等价于 width="100%"） */
.custom-select.block {
  display: block;
  width: 100%;
}

.trigger-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.trigger-icon {
  font-size: var(--font-size-title-lg);
  flex-shrink: 0;
}

.trigger-text {
  color: var(--text-body);
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

/* 下拉面板（已 Teleport 到 body，按触发器坐标 fixed 定位） */
.select-dropdown {
  position: fixed;
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.12),
    0 2px 10px rgba(0, 0, 0, 0.08);
  z-index: var(--z-custom-select, 2000);
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
  font-size: var(--font-size-body);
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
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropdown-options.has-search {
  max-height: 220px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.option-item:hover,
.option-item.keyboard-active {
  background: linear-gradient(135deg, var(--accent-bg) 0%, var(--accent-light) 100%);
}

.option-item.selected {
  background: var(--gradient-primary);
  color: white;
}

.option-item.selected:hover,
.option-item.selected.keyboard-active {
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
  font-size: var(--font-size-title-lg);
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.option-label {
  flex: 1;
  font-size: var(--font-size-body-lg);
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

/* 行内操作（删除/改名/编辑态）由调用方通过 #option 插槽自定义，样式亦由调用方提供 */

.no-options {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-body);
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

@media (max-width: 768px) {
  .custom-select {
    min-width: 0;
  }
}
</style>
