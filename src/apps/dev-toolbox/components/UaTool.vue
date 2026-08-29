<script setup lang="ts">
import { ref } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { UAParser } from 'ua-parser-js'
import { debounce } from '@/utils/common'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'UaTool' })

const input = ref(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
)
const error = ref('')
const fields = ref<{ key: string; value: string }[]>([])

const { addToast } = useToast()

function parse() {
  error.value = ''
  const ua = input.value.trim()
  if (!ua) {
    error.value = '请输入 User-Agent 字符串'
    return
  }
  try {
    const result = new UAParser(ua).getResult()
    const list: { key: string; value: string }[] = []
    const push = (group: string, k: string, v: unknown) => {
      const sv = v == null || v === '' ? '(未知)' : String(v)
      list.push({ key: `${group}.${k}`, value: sv })
    }
    push('browser', 'name', result.browser.name)
    push('browser', 'version', result.browser.version)
    push('engine', 'name', result.engine.name)
    push('engine', 'version', result.engine.version)
    push('os', 'name', result.os.name)
    push('os', 'version', result.os.version)
    push('device', 'vendor', result.device.vendor)
    push('device', 'model', result.device.model)
    push('device', 'type', result.device.type)
    push('cpu', 'architecture', result.cpu.architecture)
    fields.value = list
  } catch {
    error.value = '解析失败'
    addToast('error', error.value)
  }
}

const run = debounce(() => parse(), 120)
useRealtime(run, { watch: input })

parse()
</script>

<template>
  <div class="ua-app">
    <section class="card">
      <div class="card-title">
        User-Agent 输入
        <CopyButton
          :text="
            fields.map((f: { key: string; value: string }) => `${f.key} = ${f.value}`).join('\n')
          "
          variant="mini"
          label="复制全部"
          :disabled="!fields.length"
          :toast="addToast"
          success-text="已复制全部字段"
        />
      </div>
      <textarea
        v-model="input"
        class="plain"
        rows="3"
        placeholder="粘贴 User-Agent 字符串…"
        spellcheck="false"
      ></textarea>
      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <section class="card">
      <div class="card-title">解析结果（{{ fields.length }} 字段）</div>
      <table class="tbl">
        <thead>
          <tr>
            <th>字段</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in fields" :key="f.key">
            <td class="mono k">{{ f.key }}</td>
            <td class="mono v">{{ f.value }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.ua-app {
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
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.1rem 1.15rem;
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: var(--font-size-title);
  margin-bottom: 0.7rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.plain {
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: var(--font-size-body);
  outline: none;
  width: 100%;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  resize: vertical;
}
.plain:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.hint {
  color: var(--text-muted);
  font-size: var(--font-size-control);
}
.err {
  color: var(--danger, #ef4444);
  font-size: var(--font-size-control);
  margin: 0.5rem 0 0;
}
.mini {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.25rem 0.55rem;
  font-size: var(--font-size-small);
  cursor: pointer;
  white-space: nowrap;
}
.mini:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.push {
  margin-left: auto;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-body);
}
.tbl th,
.tbl td {
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--border-light);
}
.tbl th {
  color: var(--text-muted);
  font-weight: 600;
}
.tbl td.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  word-break: break-all;
}
.k {
  color: var(--text-muted);
}
.v {
  color: var(--text-body);
}
</style>
