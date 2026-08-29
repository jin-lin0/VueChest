<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { MessageCircle, Send, Sparkles } from '@lucide/vue'
import { MarkdownView } from '@/components'
import type { AnalysisQuestionThread } from '../types'

defineOptions({ name: 'AnalysisFollowUp' })

const props = defineProps<{
  thread: AnalysisQuestionThread
}>()

const emit = defineEmits<{
  ask: [question: string]
}>()

const question = ref('')
const streamEnd = ref<HTMLElement | null>(null)
const suggestions = ['用三句话总结核心结论', '哪些观点值得进一步验证？', '整理成可执行清单']

function submit(raw = question.value) {
  const value = raw.trim()
  if (!value) return
  emit('ask', value)
  question.value = ''
}

watch(
  () => props.thread.messages.at(-1)?.content,
  async () => {
    await nextTick()
    streamEnd.value?.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <section class="follow-up-panel">
    <header>
      <span><MessageCircle :size="17" /></span>
      <div>
        <strong>基于字幕继续追问</strong>
        <small>问题和回答留在当前分析中，不会跳转页面。</small>
      </div>
    </header>

    <div v-if="thread.messages.length" class="follow-up-thread">
      <article
        v-for="message in thread.messages"
        :key="message.id"
        class="follow-up-message"
        :class="message.role"
      >
        <span>{{ message.role === 'user' ? '你' : 'AI' }}</span>
        <div v-if="message.role === 'assistant'">
          <MarkdownView :content="message.content" />
          <i v-if="message.streaming" class="stream-cursor" aria-hidden="true"></i>
        </div>
        <p v-else>{{ message.content }}</p>
      </article>
      <span ref="streamEnd" class="stream-end" aria-hidden="true"></span>
    </div>

    <div v-else class="follow-up-suggestions">
      <button v-for="item in suggestions" :key="item" type="button" @click="submit(item)">
        <Sparkles :size="13" /> {{ item }}
      </button>
    </div>

    <p v-if="thread.error" class="follow-up-error">{{ thread.error }}</p>

    <div class="follow-up-composer">
      <textarea
        v-model="question"
        rows="2"
        maxlength="1000"
        placeholder="针对这段字幕或分析继续提问…"
        @keydown.meta.enter.prevent="submit()"
        @keydown.ctrl.enter.prevent="submit()"
      ></textarea>
      <button type="button" :disabled="thread.asking || !question.trim()" @click="submit()">
        <span>{{ thread.asking ? '回答中…' : '发送' }}</span>
        <Send :size="15" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.follow-up-panel {
  display: grid;
  gap: 12px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border-light));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent-bg) 42%, var(--bg-card));
}

header {
  display: flex;
  align-items: center;
  gap: 9px;
}

header > span {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-contrast);
}

header > div {
  display: grid;
  gap: 2px;
}

header strong {
  color: var(--text-primary);
  font-size: var(--font-size-small);
}

header small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.follow-up-thread {
  display: grid;
  max-height: 420px;
  overflow-y: auto;
  gap: 10px;
  padding-right: 4px;
}

.stream-end {
  width: 1px;
  height: 1px;
}

.stream-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  background: var(--accent);
  vertical-align: -0.12em;
  animation: stream-blink 0.8s steps(1) infinite;
}

@keyframes stream-blink {
  50% {
    opacity: 0;
  }
}

.follow-up-message {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
}

.follow-up-message > span {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 8px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  font-weight: 800;
}

.follow-up-message.assistant > span {
  background: var(--accent);
  color: var(--accent-contrast);
}

.follow-up-message > div,
.follow-up-message > p {
  min-width: 0;
  margin: 0;
  padding: 9px 11px;
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-body);
  font-size: var(--font-size-small);
  line-height: 1.65;
}

.follow-up-message.user > p {
  background: var(--accent-bg);
  color: var(--text-primary);
}

.follow-up-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.follow-up-suggestions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 9px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-caption);
}

.follow-up-suggestions button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.follow-up-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--font-size-meta);
}

.follow-up-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
}

.follow-up-composer textarea {
  min-width: 0;
  resize: vertical;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  outline: 0;
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--font-size-small);
  line-height: 1.5;
}

.follow-up-composer textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.follow-up-composer > button {
  display: inline-flex;
  height: 38px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-contrast);
  cursor: pointer;
  font-size: var(--font-size-meta);
  font-weight: 700;
}

.follow-up-composer > button:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (max-width: 640px) {
  .follow-up-composer {
    grid-template-columns: 1fr;
  }

  .follow-up-composer > button {
    justify-content: center;
  }
}
</style>
