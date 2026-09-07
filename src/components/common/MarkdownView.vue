<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { renderMarkdown } from '@/lib/markdown'

const props = withDefaults(
  defineProps<{
    content: string
    /** 若 > 0，则为该级标题注入连续锚点 id（供 TOC 跳转），默认 0 不注入 */
    tocLevel?: number
    streaming?: boolean
  }>(),
  { tocLevel: 0 },
)

const displayContent = ref(props.content)
let frame: number | null = null
const flush = () => {
  frame = null
  displayContent.value = props.content
}
watch(
  () => [props.content, props.streaming] as const,
  () => {
    if (!props.streaming) {
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
    } else if (frame === null) frame = requestAnimationFrame(flush)
  },
)
onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame)
})
const rendered = computed(() => renderMarkdown(displayContent.value, { tocLevel: props.tocLevel }))
</script>

<template>
  <div class="markdown-body" v-html="rendered"></div>
</template>
