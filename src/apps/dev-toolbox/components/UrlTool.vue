<script setup lang="ts">
import { ref } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce } from '@/utils/common'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'UrlTool' })

const mode = ref<'encode' | 'decode'>('encode')
const useComponent = ref(false) // 组件编码（encodeURI）开关
const input = ref('')
const output = ref('')
const error = ref('')

const { addToast } = useToast()

const run = debounce(() => {
  error.value = ''
  if (!input.value) {
    output.value = ''
    return
  }
  try {
    if (mode.value === 'encode') {
      output.value = useComponent.value ? encodeURI(input.value) : encodeURIComponent(input.value)
    } else {
      output.value = decodeURIComponent(input.value)
    }
  } catch {
    output.value = ''
    error.value =
      mode.value === 'decode'
        ? '解码失败：包含非法的 % 转义序列或非法 URI'
        : '编码失败：输入包含无法处理的内容'
    addToast('error', error.value)
  }
}, 150)

useRealtime(run, { watch: [input, mode, useComponent] })

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="url-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: mode === 'encode' }" @click="mode = 'encode'">编码</button>
        <button :class="{ active: mode === 'decode' }" @click="mode = 'decode'">解码</button>
      </div>
      <button
        v-if="mode === 'encode'"
        class="btn"
        :class="{ on: useComponent }"
        @click="useComponent = !useComponent"
      >
        组件编码 (encodeURI)
      </button>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="addToast" />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ mode === 'encode' ? '原始文本' : 'URL 编码串' }}</span>
        </div>
        <textarea
          v-model="input"
          class="plain"
          :placeholder="mode === 'encode' ? '输入要编码的文本…' : '粘贴要解码的 URL 编码串…'"
          spellcheck="false"
        ></textarea>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">结果</span>
          <span class="hint" v-if="mode === 'encode' && useComponent"
            >encodeURI（仅编码空格等保留字符）</span
          >
          <span class="hint" v-else-if="mode === 'encode'">encodeURIComponent（全编码）</span>
        </div>
        <textarea v-model="output" class="plain" readonly placeholder="结果将显示在此"></textarea>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.url-app {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1.5rem 1rem 1.5rem;
  color: var(--text-body);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-bottom: 1rem;
  align-items: center;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.seg button {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: none;
  padding: 0.5rem 1.1rem;
  cursor: pointer;
  font-size: var(--font-size-body);
  transition: var(--transition-fast);
}
.seg button.active {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  font-weight: 600;
}
.btn {
  background: var(--bg-card);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-body);
  transition: var(--transition-fast);
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.btn.on {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(102, 126, 234, 0.12);
}
.btn.primary {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border: none;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.ghost {
  background: transparent;
}
.tb-group {
  display: flex;
  gap: 0.4rem;
}
.tb-group.push-right {
  margin-left: auto;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}
.card {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.1rem 1.15rem;
  min-height: 0;
}
.card-head {
  margin-bottom: 0.7rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
}
.hint {
  color: var(--text-muted);
  font-size: var(--font-size-small);
}
.plain {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-body);
  padding: 12px 14px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--font-size-control);
  line-height: 1.6;
  outline: none;
  transition: var(--transition-fast);
}
.plain:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.err {
  margin: 0.6rem 0 0;
  color: var(--danger, #ef4444);
  font-size: var(--font-size-control);
}

@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
