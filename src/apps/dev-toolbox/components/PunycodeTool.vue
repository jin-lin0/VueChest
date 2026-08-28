<script setup lang="ts">
import { ref } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce } from '@/utils/common'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
import * as punycode from 'punycode'

defineOptions({ name: 'PunycodeTool' })

// mode: 完整域名(IDN↔Punycode) / 纯标签(只对标签部分)
const mode = ref<'domain' | 'label'>('domain')
// dir: 编码 / 解码
const dir = ref<'encode' | 'decode'>('encode')

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
    if (mode.value === 'domain') {
      output.value =
        dir.value === 'encode' ? punycode.toASCII(input.value) : punycode.toUnicode(input.value)
    } else {
      const label = input.value.trim()
      if (dir.value === 'encode') {
        // 纯标签编码：punycode 以 "-" 开头
        output.value = punycode.encode(label)
      } else {
        output.value = punycode.decode(label)
      }
    }
  } catch (e) {
    output.value = ''
    const msg = e instanceof Error ? e.message : '处理失败'
    error.value = (dir.value === 'encode' ? '编码失败：' : '解码失败：') + msg
    addToast('error', error.value)
  }
}, 120)

useRealtime(run, { watch: [input, mode, dir] })

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}

const inputPlaceholder = () =>
  mode.value === 'domain'
    ? dir.value === 'encode'
      ? '输入国际化域名，如 中国.com'
      : '输入 Punycode 域名，如 xn--fiqs8s.com'
    : dir.value === 'encode'
      ? '输入纯标签，如 中国'
      : '输入 Punycode 标签，如 -fiqs8s'

const inputTitle = () =>
  mode.value === 'domain'
    ? dir.value === 'encode'
      ? '原始域名'
      : 'Punycode 域名'
    : dir.value === 'encode'
      ? '原始标签'
      : 'Punycode 标签'

const outputTitle = () =>
  mode.value === 'domain'
    ? dir.value === 'encode'
      ? 'Punycode 域名'
      : '原始域名'
    : dir.value === 'encode'
      ? 'Punycode 标签'
      : '原始标签'
</script>

<template>
  <div class="punycode-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: mode === 'domain' }" @click="mode = 'domain'">完整域名</button>
        <button :class="{ active: mode === 'label' }" @click="mode = 'label'">纯标签</button>
      </div>
      <div class="seg">
        <button :class="{ active: dir === 'encode' }" @click="dir = 'encode'">编码</button>
        <button :class="{ active: dir === 'decode' }" @click="dir = 'decode'">解码</button>
      </div>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="addToast" />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <p class="hint">
      <template v-if="mode === 'domain'">
        完整域名模式：整个域名转换（标签自动加 <code>xn--</code> 前缀）。
      </template>
      <template v-else>
        纯标签模式：仅对单个标签编码 / 解码（编码结果以 <code>-</code> 开头，如
        <code>-fiqs8s</code>）。
      </template>
    </p>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ inputTitle() }}</span>
        </div>
        <textarea
          v-model="input"
          class="plain"
          :placeholder="inputPlaceholder()"
          spellcheck="false"
        ></textarea>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">{{ outputTitle() }}</span>
        </div>
        <textarea v-model="output" class="plain" readonly placeholder="结果将显示在此"></textarea>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.punycode-app {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1.5rem 1rem;
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
  font-size: 0.85rem;
  transition: var(--transition-fast);
}
.seg button.active {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  font-weight: 600;
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
  font-size: 0.85rem;
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
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.hint code {
  font-family: var(--font-mono, ui-monospace, monospace);
  background: var(--bg-subtle);
  padding: 0.05rem 0.35rem;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
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
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.95rem;
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
  font-size: 13px;
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
  font-size: 0.8rem;
}

@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
