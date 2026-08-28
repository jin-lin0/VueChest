<script setup lang="ts">
import { ref } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce } from '@/utils/common'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'QueryTool' })

const input = ref('https://example.com/search?q=vue&page=2&q=ts#results')
const error = ref('')
const params = ref<{ key: string; value: string }[]>([])
const isUrl = ref(false)
const segments = ref<{ key: string; value: string }[]>([])
const rebuilt = ref('')

const { addToast } = useToast()

function looksLikeUrl(s: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^https?:\/\//i.test(s)
}

function parse() {
  error.value = ''
  params.value = []
  segments.value = []
  isUrl.value = false
  rebuilt.value = ''
  const raw = input.value.trim()
  if (!raw) {
    error.value = '请输入 URL 或查询串'
    return
  }

  let queryString = ''
  if (looksLikeUrl(raw)) {
    try {
      const url = new URL(raw)
      isUrl.value = true
      queryString = url.search.replace(/^\?/, '')
      segments.value = [
        { key: 'href', value: url.href },
        { key: 'origin', value: url.origin },
        { key: 'pathname', value: url.pathname },
        { key: 'hash', value: url.hash || '(无)' },
      ]
    } catch {
      error.value = '无法解析为合法 URL'
      addToast('error', error.value)
      return
    }
  } else {
    queryString = raw.replace(/^\?/, '')
  }

  const sp = new URLSearchParams(queryString)
  const list: { key: string; value: string }[] = []
  sp.forEach((value, key) => list.push({ key, value }))
  params.value = list
  rebuilt.value = sp.toString()
}

const run = debounce(() => parse(), 120)
useRealtime(run, { watch: input })

parse()
</script>

<template>
  <div class="query-app">
    <section class="card">
      <div class="card-title">输入 URL 或裸查询串</div>
      <textarea
        v-model="input"
        class="plain"
        rows="3"
        placeholder="如 https://example.com/a/b?x=1&y=2 或裸串 a=1&b=2"
        spellcheck="false"
      ></textarea>
      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <div v-if="isUrl" class="card">
      <div class="card-title">URL 分段</div>
      <div class="row" v-for="seg in segments" :key="seg.key">
        <span class="k seg-key">{{ seg.key }}</span>
        <code class="mono v seg-val">{{ seg.value }}</code>
        <CopyButton
          :text="seg.value"
          variant="mini"
          :toast="addToast"
          :success-text="`已复制${seg.key}`"
        />
      </div>
    </div>

    <section class="card">
      <div class="card-title">
        Query 参数（{{ params.length }} 项）
        <CopyButton
          :text="rebuilt"
          variant="mini"
          label="复制重组串"
          :disabled="!rebuilt"
          :toast="addToast"
          success-text="已复制查询串"
        />
      </div>
      <table v-if="params.length" class="tbl">
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in params" :key="i">
            <td class="mono">{{ p.key }}</td>
            <td class="mono">{{ p.value }}</td>
            <td>
              <CopyButton
                :text="p.value"
                variant="mini"
                :toast="addToast"
                success-text="已复制参数值"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="hint">无查询参数</p>
      <div class="rebuilt">
        <span class="k">重组为查询串：</span>
        <code class="mono">{{ rebuilt || '(空)' }}</code>
      </div>
    </section>
  </div>
</template>

<style scoped>
.query-app {
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
  font-size: 1rem;
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
  font-size: 0.85rem;
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
  font-size: 0.8rem;
}
.err {
  color: var(--danger, #ef4444);
  font-size: 0.8rem;
  margin: 0.5rem 0 0;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 0.4rem;
}
.k {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.v {
  font-size: 0.88rem;
  color: var(--text-body);
}
.seg-key {
  min-width: 64px;
  display: inline-block;
}
.seg-val {
  flex: 1;
  word-break: break-all;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.5rem;
}
.mini {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
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
  font-size: 0.85rem;
}
.tbl th,
.tbl td {
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--border-light);
  vertical-align: top;
}
.tbl th {
  color: var(--text-muted);
  font-weight: 600;
}
.tbl td.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  word-break: break-all;
}
.rebuilt {
  margin-top: 0.7rem;
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-wrap: wrap;
}
.rebuilt .mono {
  word-break: break-all;
}
</style>
