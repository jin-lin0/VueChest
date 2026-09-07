<script setup lang="ts">
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { RequestBodyMode, RequestFiles, RequestFormField } from '../request-body'
const mode = defineModel<RequestBodyMode>('mode', { required: true })
const body = defineModel<string>('body', { required: true })
const fields = defineModel<RequestFormField[]>('fields', { required: true })
const files = defineModel<RequestFiles>('files', { required: true })
const modes = [
  { value: 'raw', label: 'Raw · JSON / 文本' },
  { value: 'form-data', label: 'multipart/form-data' },
]
const types = [
  { value: 'text', label: '文本' },
  { value: 'file', label: '文件' },
]
function addField() {
  fields.value = [
    ...fields.value,
    { id: crypto.randomUUID(), name: '', value: '', type: 'text', enabled: true },
  ]
}
function selectFile(field: RequestFormField, event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  files.value = { ...files.value, [field.id]: file }
  field.value = file.name
}
function removeField(id: string) {
  fields.value = fields.value.filter((field) => field.id !== id)
  const next = { ...files.value }
  delete next[id]
  files.value = next
}
</script>

<template>
  <div class="request-body-editor">
    <CustomSelect v-model="mode" :options="modes" block />
    <template v-if="mode === 'raw'">
      <small>未填写 Content-Type 时默认 application/json</small>
      <textarea v-model="body" aria-label="请求 Body" spellcheck="false" />
    </template>
    <template v-else>
      <p>
        文本支持环境变量；文件内容仅在本次页面会话中保留，刷新或导入后需重新选择。Content-Type
        由浏览器自动生成。
      </p>
      <div v-for="(field, index) in fields" :key="field.id" class="form-field">
        <div class="field-heading">
          <input
            v-model="field.enabled"
            type="checkbox"
            :aria-label="`启用表单字段 ${index + 1}`"
          />
          <input
            v-model="field.name"
            placeholder="字段名"
            :aria-label="`表单字段名 ${index + 1}`"
          />
          <CustomSelect v-model="field.type" :options="types" size="sm" width="80px" />
          <button
            type="button"
            :aria-label="`删除表单字段 ${index + 1}`"
            @click="removeField(field.id)"
          >
            ×
          </button>
        </div>
        <input
          v-if="field.type === 'text'"
          v-model="field.value"
          placeholder="字段值或 {{variable}}"
          :aria-label="`表单字段值 ${index + 1}`"
        />
        <template v-else>
          <input
            type="file"
            :aria-label="`选择文件 ${field.name || index + 1}`"
            @change="selectFile(field, $event)"
          />
          <small :class="{ missing: !files[field.id] }">{{
            files[field.id]
              ? `已选择 ${files[field.id].name}`
              : `待重新选择：${field.value || '未配置文件'}`
          }}</small>
          <input
            v-model="field.filename"
            placeholder="上传文件名（默认原文件名）"
            aria-label="上传文件名"
          />
          <input
            v-model="field.contentType"
            placeholder="文件 MIME 类型（可选）"
            aria-label="文件 MIME 类型"
          />
        </template>
      </div>
      <button type="button" class="add-field" @click="addField">＋ 添加表单字段</button>
    </template>
  </div>
</template>

<style scoped>
.request-body-editor {
  display: grid;
  gap: 12px;
  padding: 16px;
  min-width: 0;
}
p,
small {
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  line-height: 1.6;
  margin: 0;
}
textarea,
input {
  min-width: 0;
  box-sizing: border-box;
  color: var(--text-primary);
  border: 1px solid var(--border-light);
  background: var(--bg-input);
  border-radius: 6px;
  padding: 8px;
  font: inherit;
}
textarea {
  width: 100%;
  min-height: 220px;
  font-family: monospace;
  resize: vertical;
}
.form-field {
  display: grid;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-light);
}
.field-heading {
  display: grid;
  gap: 8px;
  grid-template-columns: 20px minmax(0, 1fr) 80px 28px;
  align-items: center;
}
button {
  color: var(--accent);
  background: var(--accent-bg);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  min-height: 32px;
  cursor: pointer;
  font: inherit;
}
.missing {
  color: var(--text-secondary);
}
input[type='file'] {
  width: 100%;
}
.add-field {
  min-height: 40px;
}
</style>
