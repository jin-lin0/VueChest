<script setup lang="ts">
import { MdEditor, type ToolbarNames } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

defineOptions({ name: 'QuestionMarkdownEditor' })

defineProps<{
  modelValue: string
  toolbars: ToolbarNames[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <MdEditor
    :model-value="modelValue"
    :toolbars="toolbars"
    language="zh-CN"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
