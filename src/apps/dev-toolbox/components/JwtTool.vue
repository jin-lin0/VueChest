<script setup lang="ts">
import { ref } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce } from '@/utils/common'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
import CodeEditor from './CodeEditor.vue'

defineOptions({ name: 'JwtTool' })

const input = ref('')
const error = ref('')
const headerJson = ref('')
const payloadJson = ref('')
const signatureInfo = ref('')
const claims = ref<{ key: string; value: string; expired?: boolean }[]>([])

const { addToast } = useToast()

function base64UrlDecode(seg: string): string {
  let s = seg.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function formatTime(sec: number): string {
  const d = new Date(sec * 1000)
  if (Number.isNaN(d.getTime())) return '（无法识别的时间）'
  return d.toLocaleString()
}

const run = debounce(() => {
  error.value = ''
  headerJson.value = ''
  payloadJson.value = ''
  signatureInfo.value = ''
  claims.value = []

  const raw = input.value.trim()
  if (!raw) return

  const parts = raw.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    error.value = '不是合法的 JWT：应由 header.payload.signature 三段用 "." 分隔'
    addToast('error', error.value)
    return
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]))
    const payload = JSON.parse(base64UrlDecode(parts[1]))
    headerJson.value = JSON.stringify(header, null, 2)
    payloadJson.value = JSON.stringify(payload, null, 2)

    const list: { key: string; value: string; expired?: boolean }[] = []
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp === 'number') {
      list.push({
        key: 'exp',
        value: `${formatTime(payload.exp)}（${payload.exp < now ? '已过期' : '未过期'}）`,
        expired: payload.exp < now,
      })
    }
    if (typeof payload.iat === 'number') {
      list.push({ key: 'iat', value: formatTime(payload.iat) })
    }
    if (typeof payload.nbf === 'number') {
      list.push({
        key: 'nbf',
        value: `${formatTime(payload.nbf)}（${payload.nbf > now ? '尚未生效' : '已生效'}）`,
      })
    }
    claims.value = list

    signatureInfo.value = `${parts[2].length} 字节（base64url），前 16 字符：${parts[2].slice(0, 16)}${parts[2].length > 16 ? '…' : ''}`
  } catch {
    error.value = '不是合法的 JWT：header 或 payload 无法解码 / 不是合法 JSON'
    addToast('error', error.value)
  }
}, 150)

useRealtime(run, { watch: input })

function clearAll() {
  input.value = ''
  error.value = ''
  headerJson.value = ''
  payloadJson.value = ''
  signatureInfo.value = ''
  claims.value = []
}
</script>

<template>
  <div class="jwt-app">
    <div class="toolbar">
      <span class="hint"
        >粘贴 JWT，自动拆分三段并对 header / payload 做 base64url
        解码。仅展示，不校验签名密钥。</span
      >
      <div class="tb-group push-right">
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <span class="card-title">JWT 字符串</span>
      </div>
      <textarea
        v-model="input"
        class="plain"
        placeholder="粘贴形如 xxxxx.yyyyy.zzzzz 的 JWT…"
        spellcheck="false"
      ></textarea>
      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <div class="grid" v-if="headerJson || payloadJson">
      <section class="card">
        <div class="card-head">
          <span class="card-title">Header</span>
          <CopyButton
            :text="headerJson"
            variant="mini"
            success-text="已复制 header"
            :toast="addToast"
          />
        </div>
        <CodeEditor v-model="headerJson" language="json" readonly placeholder="header 将显示在此" />
      </section>

      <section class="card">
        <div class="card-head">
          <span class="card-title">Payload</span>
          <CopyButton
            :text="payloadJson"
            variant="mini"
            success-text="已复制 payload"
            :toast="addToast"
          />
        </div>
        <CodeEditor
          v-model="payloadJson"
          language="json"
          readonly
          placeholder="payload 将显示在此"
        />
      </section>
    </div>

    <section class="card" v-if="claims.length">
      <div class="card-head">
        <span class="card-title">时间声明</span>
      </div>
      <div class="claims">
        <div class="claim" v-for="c in claims" :key="c.key">
          <span class="k mono">{{ c.key }}</span>
          <span class="v" :class="{ danger: c.expired }">{{ c.value }}</span>
        </div>
      </div>
    </section>

    <section class="card" v-if="signatureInfo">
      <div class="card-head">
        <span class="card-title">Signature</span>
      </div>
      <p class="mono sig">{{ signatureInfo }}</p>
      <p class="hint">签名段未校验，仅展示长度与前缀。</p>
    </section>
  </div>
</template>

<style scoped>
.jwt-app {
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
.hint {
  color: var(--text-muted);
  font-size: 0.78rem;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.95rem;
}
.plain {
  width: 100%;
  min-height: 110px;
  height: 140px;
  resize: vertical;
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
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.claims {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.claim {
  display: flex;
  gap: 0.8rem;
  align-items: baseline;
}
.k {
  color: var(--text-secondary);
  font-size: 0.8rem;
  min-width: 48px;
}
.v {
  font-size: 0.88rem;
  color: var(--text-body);
}
.v.danger {
  color: var(--danger, #ef4444);
  font-weight: 600;
}
.sig {
  font-size: 0.85rem;
  color: var(--text-body);
  word-break: break-all;
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
