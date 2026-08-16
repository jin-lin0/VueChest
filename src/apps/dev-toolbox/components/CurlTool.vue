<script setup lang="ts">
import { ref } from 'vue'
import { debounce } from '@/utils'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
import CodeEditor from './CodeEditor.vue'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'CurlTool' })

type Direction = 'curl2fetch' | 'fetch2curl'

const direction = ref<Direction>('curl2fetch')
const curlInput = ref(
  `-X POST 'https://x.com/a' -H 'Authorization: Bearer t' -H 'Content-Type: application/json' -d '{"a":1}'`,
)
const fetchInput = ref('')
const output = ref('')
const error = ref('')

const { addToast } = useToast()

interface ParsedCurl {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  user?: string
}

function parseCurl(cmd: string): ParsedCurl {
  const result: ParsedCurl = { method: 'GET', url: '', headers: {} }

  // 方法：-X POST / --request POST
  const methodMatch = cmd.match(/-X\s+(\w+)|--request\s+(\w+)/i)
  if (methodMatch) {
    result.method = (methodMatch[1] || methodMatch[2]).toUpperCase()
  }

  // 用户名密码：-u user:pass
  const userMatch = cmd.match(/-u\s+([^\s'"]+)/)
  if (userMatch) result.user = userMatch[1]

  // URL：优先匹配带引号的 http(s):// 地址；否则取第一个非选项裸 token
  const urlMatch = cmd.match(/['"](https?:\/\/[^'"]+)['"]/)
  if (urlMatch) {
    result.url = urlMatch[1]
  } else {
    const bare = cmd.match(/(?:^|\s)(https?:\/\/[^\s'"]+)/)
    if (bare) {
      result.url = bare[1]
    } else {
      const tokens = cmd.match(/(?:^|\s)([^\s-][^\s]*)/g)
      if (tokens) {
        for (const t of tokens) {
          const tok = t.trim()
          if (tok && !tok.startsWith('-')) {
            result.url = tok
            break
          }
        }
      }
    }
  }

  // 多个 -H 'Name: Value' / --header '...'
  const headerRe = /-H\s+'([^']+)'|--header\s+'([^']+)'|-H\s+"([^"]+)"|--header\s+"([^"]+)"/g
  let hm: RegExpExecArray | null
  while ((hm = headerRe.exec(cmd)) !== null) {
    const raw = hm[1] || hm[2] || hm[3] || hm[4]
    const idx = raw.indexOf(':')
    if (idx > 0) {
      const k = raw.slice(0, idx).trim()
      const v = raw.slice(idx + 1).trim()
      result.headers[k] = v
    }
  }

  // body：-d '...' / --data '...' / --data-binary
  const dataMatch = cmd.match(
    /(?:-d|--data|--data-binary|--data-raw)\s+'([^']*)'|(?:-d|--data|--data-binary|--data-raw)\s+"([^"]*)"/,
  )
  if (dataMatch) {
    result.body = dataMatch[1] ?? dataMatch[2] ?? ''
    // 含 body 且未显式指定 method 时，默认 POST
    if (!methodMatch) result.method = 'POST'
  }

  // 表单：-F 'name=content'
  const formMatches = [...cmd.matchAll(/-F\s+'([^']+)'|-F\s+"([^"]+)"/g)]
  if (formMatches.length) {
    const fields: Record<string, string> = {}
    for (const fm of formMatches) {
      const raw = fm[1] || fm[2]
      const idx = raw.indexOf('=')
      if (idx > 0) fields[raw.slice(0, idx)] = raw.slice(idx + 1)
    }
    result.body = JSON.stringify(fields)
    if (!result.headers['Content-Type'] && !result.headers['content-type']) {
      result.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
    if (!methodMatch) result.method = 'POST'
  }

  return result
}

function curlToFetch(parsed: ParsedCurl): string {
  const lines: string[] = []
  lines.push(`fetch('${parsed.url}', {`)
  lines.push(`  method: '${parsed.method}',`)

  const headers: Record<string, string> = { ...parsed.headers }
  if (parsed.user) {
    const [u, p] = parsed.user.split(':')
    const token = typeof btoa !== 'undefined' ? btoa(`${u}:${p ?? ''}`) : ''
    headers['Authorization'] = `Basic ${token}`
  }

  const headerKeys = Object.keys(headers)
  if (headerKeys.length) {
    lines.push(`  headers: {`)
    for (const k of headerKeys) {
      lines.push(`    '${k}': '${headers[k]}',`)
    }
    lines.push(`  },`)
  }
  if (parsed.body !== undefined) {
    lines.push(`  body: '${parsed.body.replace(/'/g, "\\'")}',`)
  }
  lines.push(`})`)
  return lines.join('\n')
}

function parseFetch(code: string): ParsedCurl {
  const result: ParsedCurl = { method: 'GET', url: '', headers: {} }
  const urlMatch = code.match(/fetch\(\s*['"]([^'"]+)['"]/)
  if (urlMatch) result.url = urlMatch[1]

  const methodMatch = code.match(/method\s*:\s*['"]([A-Za-z]+)['"]/)
  if (methodMatch) result.method = methodMatch[1].toUpperCase()

  const headersBlock = code.match(/headers\s*:\s*\{([^}]*)\}/)
  if (headersBlock) {
    const kvRe = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]*)['"]/g
    let hm: RegExpExecArray | null
    while ((hm = kvRe.exec(headersBlock[1])) !== null) {
      result.headers[hm[1]] = hm[2]
    }
  }

  const bodyMatch = code.match(/body\s*:\s*(['"])([\s\S]*?)\1/)
  if (bodyMatch) result.body = bodyMatch[2]
  return result
}

function fetchToCurl(parsed: ParsedCurl): string {
  const parts: string[] = ['curl -X ' + parsed.method, `'${parsed.url}'`]
  for (const [k, v] of Object.entries(parsed.headers)) {
    parts.push(`-H '${k}: ${v}'`)
  }
  if (parsed.body !== undefined) {
    parts.push(`-d '${parsed.body.replace(/'/g, "'\\''")}'`)
  }
  return parts.join(' ')
}

const run = debounce(() => {
  error.value = ''
  output.value = ''
  try {
    if (direction.value === 'curl2fetch') {
      if (!curlInput.value.trim()) return
      const parsed = parseCurl(curlInput.value)
      if (!parsed.url) {
        error.value = '未能从 curl 命令中解析出 URL，请检查命令格式。'
        addToast('error', error.value)
        return
      }
      output.value = curlToFetch(parsed)
    } else {
      if (!fetchInput.value.trim()) return
      const parsed = parseFetch(fetchInput.value)
      if (!parsed.url) {
        error.value = '未能从 fetch 代码中解析出 URL，请检查代码格式。'
        addToast('error', error.value)
        return
      }
      output.value = fetchToCurl(parsed)
    }
  } catch {
    error.value = '解析失败：命令或代码格式无法识别。'
    addToast('error', error.value)
  }
}, 180)

useRealtime(run, { watch: [curlInput, fetchInput, direction], immediate: true })

function clearAll() {
  curlInput.value = ''
  fetchInput.value = ''
  output.value = ''
  error.value = ''
}
function swap() {
  direction.value = direction.value === 'curl2fetch' ? 'fetch2curl' : 'curl2fetch'
  error.value = ''
}
</script>

<template>
  <div class="curl-app">
    <header class="head">
      <h1>Curl ⇄ Fetch 转换</h1>
      <p class="sub">
        启发式正则解析常见字段（-X / URL / -H / -d / -u / -F）。覆盖常见情形，无需完美。
      </p>
    </header>

    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: direction === 'curl2fetch' }" @click="direction = 'curl2fetch'">
          Curl → Fetch
        </button>
        <button :class="{ active: direction === 'fetch2curl' }" @click="direction = 'fetch2curl'">
          Fetch → Curl
        </button>
      </div>
      <button class="btn ghost" @click="swap">⇄ 交换方向</button>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="addToast" />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{
            direction === 'curl2fetch' ? 'Curl 命令' : 'Fetch 代码'
          }}</span>
        </div>
        <CodeEditor
          v-if="direction === 'curl2fetch'"
          v-model="curlInput"
          language="plaintext"
          placeholder="粘贴 curl 命令…"
        />
        <CodeEditor
          v-else
          v-model="fetchInput"
          language="javascript"
          placeholder="粘贴 fetch(...) 代码…"
        />
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">转换结果</span>
          <span class="hint">{{ direction === 'curl2fetch' ? 'fetch 代码' : 'curl 命令' }}</span>
        </div>
        <CodeEditor
          :model-value="output"
          :language="direction === 'curl2fetch' ? 'javascript' : 'plaintext'"
          readonly
          placeholder="结果将显示在此"
        />
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.curl-app {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  flex: 1; /* 关键：填充内容区，勿用 height:100% */
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1.5rem 1rem;
  color: var(--text-body);
  gap: 1rem;
}
.head h1 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}
.sub {
  margin: 0.3rem 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
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
  min-height: 240px;
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
  font-size: 0.95rem;
}
.hint {
  color: var(--text-muted);
  font-size: 0.72rem;
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
