<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { CustomSelect, type SelectOption } from '@/components'

interface Rule {
  name: string
  code: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    rules: Rule[]
  }>(),
  { modelValue: '', rules: () => [] },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  delete: [name: string]
  rename: [oldName: string, newName: string]
}>()

const options = computed<SelectOption[]>(() => [
  { value: '', label: '— 选择规则 —' },
  ...props.rules.map((r) => ({ value: r.name, label: r.name })),
])

/* ---------- 行内改名（业务行为，封装在本组件内） ---------- */
const editingValue = ref<string | number | null>(null)
const editText = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

function bindEditRef(el: unknown) {
  if (el) editInputRef.value = el as HTMLInputElement
}

function startRename(opt: SelectOption) {
  editingValue.value = opt.value
  editText.value = opt.label
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}
function confirmRename(opt: SelectOption) {
  const newName = editText.value.trim()
  if (!newName) return // 空名不允许（禁用态已拦截，这里兜底）
  editingValue.value = null
  emit('rename', String(opt.value), newName)
}
function cancelRename() {
  editingValue.value = null
}

function onSelect(value: string | number | null) {
  emit('update:modelValue', String(value ?? ''))
}
function onChange(value: string | number) {
  emit('change', String(value))
}
function onDelete(opt: SelectOption) {
  emit('delete', String(opt.value))
}
</script>

<template>
  <CustomSelect
    :model-value="modelValue"
    :options="options"
    size="sm"
    width="190px"
    @update:model-value="onSelect"
    @change="onChange"
  >
    <template #option="{ option }">
      <!-- 改名编辑态：整行 @click.stop 阻止触发选择 -->
      <div v-if="editingValue === option.value" class="rl-editing" @click.stop>
        <input
          :ref="bindEditRef"
          v-model="editText"
          class="rl-edit-input"
          @keydown.enter.prevent="confirmRename(option)"
          @keydown.esc.prevent="cancelRename"
        />
        <span class="rl-actions">
          <button
            class="rl-ico rl-confirm"
            type="button"
            title="确认改名"
            :disabled="!editText.trim()"
            @click.stop="confirmRename(option)"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 8L7 11L12 5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button class="rl-ico rl-cancel" type="button" title="取消" @click.stop="cancelRename">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 5L19 19" />
              <path d="M19 5L5 19" />
            </svg>
          </button>
        </span>
      </div>

      <!-- 普通态：标签 + 右侧改名/删除图标 -->
      <template v-else>
        <span class="rl-label">{{ option.label }}</span>
        <span class="rl-actions" v-if="option.value !== ''">
          <button
            class="rl-ico rl-rename"
            type="button"
            title="改名"
            @click.stop="startRename(option)"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            class="rl-ico rl-delete"
            type="button"
            :title="`删除「${option.label}」`"
            @click.stop="onDelete(option)"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 5L19 19" />
              <path d="M19 5L5 19" />
            </svg>
          </button>
        </span>
      </template>
    </template>
  </CustomSelect>
</template>

<style scoped>
/* 行内内容布局：label 占满、操作按钮组靠右 */
.rl-label {
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rl-editing {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

/* 编辑态输入框 */
.rl-edit-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  font-size: 0.85rem;
  outline: none;
  background: var(--bg-card);
  color: var(--text-body);
}
/* 当前选中项（蓝紫渐变底）下编辑框保持白底可读 */
:deep(.option-item.selected) .rl-edit-input {
  background: var(--bg-card);
  color: var(--text-body);
}

/* 操作按钮组 */
.rl-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
}

/* 操作图标按钮（与通用下拉里其他图标同一套线性风格） */
.rl-ico {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.rl-ico svg {
  width: 15px;
  height: 15px;
}
.rl-rename:hover {
  color: var(--accent);
}
.rl-delete:hover {
  color: var(--danger, #ef4444);
}
.rl-confirm {
  color: var(--success, #22c55e);
}
.rl-confirm:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.14);
}
.rl-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.rl-cancel:hover {
  color: var(--danger, #ef4444);
}

/* 选中项（蓝紫渐变底、白字）下图标默认白色，hover 仍按语义色 */
:deep(.option-item.selected) .rl-ico {
  color: rgba(255, 255, 255, 0.85);
}
:deep(.option-item.selected) .rl-rename:hover {
  color: var(--accent);
}
:deep(.option-item.selected) .rl-delete:hover,
:deep(.option-item.selected) .rl-cancel:hover {
  color: var(--danger, #ef4444);
}
:deep(.option-item.selected) .rl-confirm {
  color: var(--success, #22c55e);
}
</style>
