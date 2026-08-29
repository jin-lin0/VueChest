<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce } from '@/utils/common'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'HtmlEntityTool' })

const mode = ref<'encode' | 'decode'>('encode')
const input = ref('')
const output = ref('')
const error = ref('')

const { addToast } = useToast()

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&') // 必须最后处理，避免把已还原的 & 再次误伤
}

// 沙箱预览：decode 模式下把解码后的 HTML 放进 sandbox="" 的 iframe，脚本无法执行（防 XSS）
const previewSrcdoc = computed(() => (mode.value === 'decode' && output.value ? output.value : ''))

const run = debounce(() => {
  error.value = ''
  if (!input.value) {
    output.value = ''
    return
  }
  try {
    output.value = mode.value === 'encode' ? escapeHtml(input.value) : unescapeHtml(input.value)
  } catch {
    output.value = ''
    error.value = mode.value === 'encode' ? '编码失败' : '解码失败：包含无法处理的实体'
    addToast('error', error.value)
  }
}, 150)

useRealtime(run, { watch: [input, mode] })

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="html-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: mode === 'encode' }" @click="mode = 'encode'">编码</button>
        <button :class="{ active: mode === 'decode' }" @click="mode = 'decode'">解码</button>
      </div>
      <span class="hint">
        {{
          mode === 'encode'
            ? '转义 &lt; &gt; &amp; " \' 为命名实体'
            : '还原命名实体与 \u0026#num; / \u0026#xhex;'
        }}
      </span>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="addToast" />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ mode === 'encode' ? '原始 HTML' : '实体编码串' }}</span>
        </div>
        <textarea
          v-model="input"
          class="plain"
          :placeholder="mode === 'encode' ? '输入含 < > & 等字符的文本…' : '粘贴 HTML 实体编码串…'"
          spellcheck="false"
        ></textarea>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">结果</span>
        </div>
        <textarea v-model="output" class="plain" readonly placeholder="结果将显示在此"></textarea>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>

    <section class="card preview" v-if="mode === 'decode'">
      <div class="card-head">
        <span class="card-title">浏览器预览（沙箱，禁用脚本）</span>
      </div>
      <iframe
        v-if="previewSrcdoc"
        class="frame"
        sandbox=""
        :srcdoc="previewSrcdoc"
        title="HTML 实体解码预览"
      ></iframe>
      <p v-else class="hint">解码后的 HTML 将在此安全预览（脚本不会执行）。</p>
    </section>
  </div>
</template>

<style scoped>
.html-app {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1.5rem 1rem 1.5rem;
  color: var(--text-body);
  gap: 1rem;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
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
.hint {
  color: var(--text-muted);
  font-size: var(--font-size-small);
}
.tb-group {
  display: flex;
  gap: 0.4rem;
}
.tb-group.push-right {
  margin-left: auto;
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
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.ghost {
  background: transparent;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.1rem 1.15rem;
}
.card-head {
  margin-bottom: 0.7rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border-light);
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
}
.plain {
  width: 100%;
  min-height: 200px;
  height: 260px;
  resize: vertical;
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
.frame {
  width: 100%;
  height: 280px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: #fff;
}

@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
