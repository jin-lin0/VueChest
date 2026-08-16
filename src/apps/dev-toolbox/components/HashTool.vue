<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce } from '@/utils'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
// @ts-ignore spark-md5 未提供类型声明，运行期由依赖提供
import SparkMD5 from 'spark-md5'

defineOptions({ name: 'HashTool' })

const { addToast } = useToast()

const text = ref('')
const ALGOS = [
  { id: 'md5', label: 'MD5' },
  { id: 'sha1', label: 'SHA-1' },
  { id: 'sha256', label: 'SHA-256' },
  { id: 'sha512', label: 'SHA-512' },
] as const
const selectedAlgos = ref<string[]>(['md5', 'sha256'])
const hmacEnabled = ref(false)
const hmacKey = ref('')

const results = ref<Record<string, string>>({})
const error = ref('')

// crypto.subtle 仅在安全上下文（localhost / https）可用
const subtleAvailable = typeof crypto !== 'undefined' && !!crypto.subtle
let subtleWarned = false

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

const compute = debounce(async () => {
  error.value = ''
  if (!text.value) {
    results.value = {}
    return
  }
  const out: Record<string, string> = {}

  // MD5（SparkMD5，纯前端）
  if (selectedAlgos.value.includes('md5')) {
    try {
      out.md5 = SparkMD5.hash(text.value)
    } catch {
      error.value = 'MD5 计算失败'
    }
  }

  // SHA-1 / SHA-256 / SHA-512（crypto.subtle.digest）
  for (const id of ['sha1', 'sha256', 'sha512'] as const) {
    if (!selectedAlgos.value.includes(id)) continue
    if (!subtleAvailable) {
      out[id] = '—'
      continue
    }
    const algoName = (id === 'sha1' ? 'SHA-1' : id === 'sha256' ? 'SHA-256' : 'SHA-512') as
      | 'SHA-1'
      | 'SHA-256'
      | 'SHA-512'
    try {
      const buf = await crypto.subtle.digest(algoName, new TextEncoder().encode(text.value))
      out[id] = bufToHex(buf)
    } catch {
      error.value = `${id.toUpperCase()} 计算失败`
    }
  }

  // HMAC-SHA256（crypto.subtle.importKey + sign）
  if (hmacEnabled.value) {
    if (!hmacKey.value) {
      error.value = '启用 HMAC 后请填写密钥'
    } else if (!subtleAvailable) {
      out.hmac = '—'
    } else {
      try {
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(hmacKey.value),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        )
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text.value))
        out.hmac = bufToHex(sig)
      } catch {
        error.value = 'HMAC 计算失败'
      }
    }
  }

  results.value = out

  if (
    !subtleAvailable &&
    (selectedAlgos.value.some((a) => a !== 'md5') || hmacEnabled.value) &&
    !subtleWarned
  ) {
    subtleWarned = true
    addToast('error', '当前环境不支持 crypto.subtle（需 HTTPS 或 localhost），SHA/HMAC 无法计算')
  } else if (error.value) {
    addToast('error', error.value)
  }
}, 150)

useRealtime(compute, { watch: [text, selectedAlgos, hmacEnabled, hmacKey], deep: true })

const resultRows = computed(() => {
  const rows: { key: string; label: string; value: string }[] = []
  for (const a of ALGOS) {
    if (selectedAlgos.value.includes(a.id) && results.value[a.id] !== undefined) {
      rows.push({ key: a.id, label: a.label, value: results.value[a.id] })
    }
  }
  if (hmacEnabled.value && results.value.hmac !== undefined) {
    rows.push({ key: 'hmac', label: 'HMAC-SHA256', value: results.value.hmac })
  }
  return rows
})

function clearAll() {
  text.value = ''
  results.value = {}
  error.value = ''
}
</script>

<template>
  <div class="hash-app">
    <section class="card">
      <div class="card-title">输入文本</div>
      <textarea
        v-model="text"
        class="plain"
        rows="6"
        placeholder="输入要哈希的文本，结果将自动计算…"
        spellcheck="false"
      ></textarea>
      <p v-if="error" class="err">{{ error }}</p>
      <p class="hint">
        提示：输入即计算（防抖 150ms）。SHA 与 HMAC 依赖 crypto.subtle，仅在 HTTPS / localhost
        等安全上下文可用。
      </p>
    </section>

    <section class="card">
      <div class="card-title">算法</div>
      <div class="row">
        <label v-for="a in ALGOS" :key="a.id" class="chk">
          <input type="checkbox" :value="a.id" v-model="selectedAlgos" />
          <span>{{ a.label }}</span>
        </label>
      </div>
      <div class="hmac-box">
        <label class="chk">
          <input type="checkbox" v-model="hmacEnabled" />
          <span>启用 HMAC（SHA-256）</span>
        </label>
        <input
          v-if="hmacEnabled"
          v-model="hmacKey"
          class="inp"
          type="text"
          placeholder="填写 HMAC 密钥…"
          style="margin-top: 0.5rem"
        />
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">结果</span>
        <button class="btn" :disabled="!resultRows.length" @click="clearAll">清空</button>
      </div>
      <div v-if="!resultRows.length" class="hint">尚未生成结果。</div>
      <div v-for="r in resultRows" :key="r.key" class="result-row">
        <span class="res-label">{{ r.label }}</span>
        <code class="mono res-value">{{ r.value }}</code>
        <CopyButton :text="r.value" variant="mini" success-text="已复制结果" :disabled="r.value === '—'" :toast="addToast" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.hash-app {
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
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.7rem;
}
.card-head .card-title {
  margin-bottom: 0;
}
.plain {
  width: 100%;
  resize: vertical;
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.7rem;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 0.85rem;
  outline: none;
}
.plain:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  cursor: pointer;
  margin-right: 0.8rem;
}
.chk input {
  accent-color: var(--accent);
}
.hmac-box {
  margin-top: 0.7rem;
  padding-top: 0.7rem;
  border-top: 1px dashed var(--border-light);
}
.inp {
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  outline: none;
  width: 100%;
}
.inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.result-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-light);
}
.result-row:last-child {
  border-bottom: none;
}
.res-label {
  color: var(--text-muted);
  font-size: 0.8rem;
  min-width: 96px;
  flex-shrink: 0;
}
.res-value {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  font-size: 0.85rem;
  color: var(--text-body);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.35rem 0.5rem;
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
.mini {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.mini:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.err {
  color: var(--danger, #ef4444);
  font-size: 0.8rem;
  margin: 0.5rem 0 0;
}
.hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0.5rem 0 0;
  line-height: 1.5;
}
</style>
