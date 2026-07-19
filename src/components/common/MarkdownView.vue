<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'

const props = withDefaults(
  defineProps<{
    content: string
    /** 若 > 0，则为该级标题注入连续锚点 id（供 TOC 跳转），默认 0 不注入 */
    tocLevel?: number
  }>(),
  { tocLevel: 0 },
)

const rendered = computed(() => renderMarkdown(props.content, { tocLevel: props.tocLevel }))
</script>

<template>
  <div class="markdown-body" v-html="rendered"></div>
</template>
