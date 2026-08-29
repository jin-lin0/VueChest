<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import type { Plugin } from 'prettier'
import { downloadFile, debounce } from '@/utils/common'
import { Modal, CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
import CodeEditor from './CodeEditor.vue'
import RuleSelect from './RuleSelect.vue'

defineOptions({ name: 'TextTransformTool' })

const inputText = ref('')
const codeText = ref('')
const outputText = ref('')
const outputLang = ref<'json' | 'plaintext'>('json')
const busy = ref(false)
const showNewRuleModal = ref(false)
const showEditModal = ref(false)
const currentRule = ref('')
const newRuleName = ref('')
const newRuleCode = ref('')
const editRuleName = ref('')
const editRuleCode = ref('')

const STORAGE = {
  rules: 'dev-toolbox:tt:rules',
  input: 'dev-toolbox:tt:input',
  code: 'dev-toolbox:tt:code',
  current: 'dev-toolbox:tt:current',
}

interface Rule {
  id: string
  name: string
  code: string
}

const rules = ref<Rule[]>([])

onMounted(() => {
  try {
    rules.value = JSON.parse(localStorage.getItem(STORAGE.rules) || '[]')
  } catch {
    rules.value = []
  }
  const si = localStorage.getItem(STORAGE.input)
  if (si != null) inputText.value = si
  const sc = localStorage.getItem(STORAGE.code)
  if (sc != null) codeText.value = sc
  const scur = localStorage.getItem(STORAGE.current)
  if (scur && rules.value.some((r) => r.name === scur)) currentRule.value = scur
})

const persist = debounce(() => {
  localStorage.setItem(STORAGE.input, inputText.value)
  localStorage.setItem(STORAGE.code, codeText.value)
  localStorage.setItem(STORAGE.current, currentRule.value)
}, 300)
watch([inputText, codeText, currentRule], () => persist())

const { addToast } = useToast()

/* ---------- 转换引擎：把用户代码编译为 Blob ESM 模块并动态 import ---------- */
type TransformFn = (input: unknown) => Promise<unknown>
const moduleCache = new Map<string, Promise<TransformFn>>()

function buildModule(code: string): string {
  const lines = code.split('\n')
  const importLines: string[] = []
  const bodyLines: string[] = []
  let inImport = false
  for (const line of lines) {
    const t = line.trim()
    if (inImport || /^import\s/.test(t)) {
      importLines.push(line)
      const closed = t.includes('}') && t.includes('from')
      const endsSemi = t.endsWith(';')
      const endsParen = t.trimEnd().endsWith(')')
      inImport = !(closed || endsSemi || endsParen)
    } else {
      bodyLines.push(line)
    }
  }
  return `${importLines.join('\n')}\nexport async function transform(input) {\n${bodyLines.join('\n')}\n}`
}

function getTransform(code: string): Promise<TransformFn> {
  const cached = moduleCache.get(code)
  if (cached) return cached
  const p = (async () => {
    const src = buildModule(code)
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
    try {
      const mod = (await import(/* @vite-ignore */ url)) as { transform: TransformFn }
      return (input: unknown) => mod.transform(input)
    } finally {
      URL.revokeObjectURL(url)
    }
  })()
  moduleCache.set(code, p)
  p.catch(() => moduleCache.delete(code))
  return p
}

function looksLikeJson(s: string): boolean {
  const head = s.trimStart().charCodeAt(0)
  if (head !== 123 && head !== 91) return false // 不是 { 或 [
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

async function convert() {
  const raw = inputText.value
  busy.value = true
  try {
    const fn = await getTransform(codeText.value)
    const result = await fn(raw)
    if (result === undefined) {
      addToast('error', '转换函数未返回结果，请使用 return 返回转换后的数据')
      outputText.value = ''
      outputLang.value = 'plaintext'
      return
    }
    if (typeof result === 'string') {
      // 字符串结果：若本身是合法 JSON，按 JSON 高亮更直观
      outputText.value = result
      outputLang.value = looksLikeJson(result) ? 'json' : 'plaintext'
    } else {
      try {
        outputText.value = JSON.stringify(result, null, 2)
        outputLang.value = 'json'
      } catch (e) {
        addToast('error', '转换结果无法序列化为 JSON：' + (e as Error).message)
        outputText.value = ''
        outputLang.value = 'plaintext'
      }
    }
  } catch (e) {
    addToast('error', '转换执行出错：' + (e instanceof Error ? e.message : String(e)))
    outputText.value = ''
    outputLang.value = 'plaintext'
  } finally {
    busy.value = false
  }
}

function formatJsonText(raw: string): string {
  return JSON.stringify(JSON.parse(raw), null, 2)
}

function formatInput() {
  const raw = inputText.value.trim()
  if (!raw) {
    addToast('error', '请输入内容')
    return
  }
  try {
    inputText.value = formatJsonText(raw)
    addToast('success', '输入已格式化')
  } catch (e) {
    addToast('error', '无法格式化：输入不是合法 JSON：' + (e as Error).message)
  }
}

// Cmd/Ctrl+S 触发的静默格式化：成功则漂亮打印，失败/为空则什么都不做，不弹任何 Toast
function formatInputSilent() {
  const raw = inputText.value.trim()
  if (!raw) return
  try {
    inputText.value = formatJsonText(raw)
  } catch {
    // 静默：即使不是合法 JSON 也不提示
  }
}

function formatOutput() {
  const raw = outputText.value.trim()
  if (!raw) {
    addToast('error', '暂无结果')
    return
  }
  try {
    outputText.value = formatJsonText(raw)
    outputLang.value = 'json'
    addToast('success', '结果已格式化')
  } catch (e) {
    addToast('error', '无法格式化：结果不是合法 JSON：' + (e as Error).message)
  }
}

/* ---------- 规则管理（localStorage） ---------- */
function persistRules() {
  localStorage.setItem(STORAGE.rules, JSON.stringify(rules.value))
}

function makeId(): string {
  // 原先的 Date.now() + Math.random() 兜底在同一毫秒批量新增时会撞 id，直接用 UUID
  return crypto.randomUUID()
}

// 主页下拉选择规则：把该规则的函数代码载入编辑器（即"应用"）
function selectRule() {
  const name = currentRule.value
  if (!name) return
  const r = rules.value.find((x) => x.name === name)
  if (r) {
    codeText.value = r.code
  }
}

// 主页下拉每行 × ：删除对应规则；若删除的是当前应用规则则清空选择
function handleDeleteRule(name: string | number) {
  const n = String(name)
  rules.value = rules.value.filter((r) => r.name !== n)
  persistRules()
  if (currentRule.value === n) currentRule.value = ''
  addToast('success', `已删除规则「${n}」`)
}

// 主页下拉「改名」：修改规则名称（value 即名称），避免与现有重名
function handleRenameRule(oldValue: string | number, newLabel: string) {
  const old = String(oldValue)
  const r = rules.value.find((x) => x.name === old)
  if (!r) return
  if (rules.value.some((x) => x.name === newLabel && x.name !== old)) {
    addToast('error', `已存在规则「${newLabel}」`)
    return
  }
  r.name = newLabel
  persistRules()
  if (currentRule.value === old) currentRule.value = newLabel
  addToast('success', `已重命名为「${newLabel}」`)
}

// 新增规则弹窗
function defaultRuleName(): string {
  const names = new Set(rules.value.map((r) => r.name))
  let i = rules.value.length + 1
  while (names.has(`规则 ${i}`)) i++
  return `规则 ${i}`
}
function openNewRuleModal() {
  newRuleName.value = defaultRuleName() // 预填默认名称，避免每次手填
  newRuleCode.value = codeText.value // 以当前编辑器内容为基底，便于在现有函数上改
  showNewRuleModal.value = true
}

function createRule() {
  const name = newRuleName.value.trim()
  if (!name) {
    addToast('error', '请填写规则名称')
    return
  }
  const entry: Rule = { id: makeId(), name, code: newRuleCode.value }
  const idx = rules.value.findIndex((r) => r.name === name)
  if (idx >= 0) rules.value[idx] = entry
  else rules.value.push(entry)
  persistRules()
  currentRule.value = name
  codeText.value = newRuleCode.value
  showNewRuleModal.value = false
  addToast('success', `已保存规则「${name}」`)
}

function closeNewRuleModal() {
  showNewRuleModal.value = false
}

function openEditModal() {
  if (!currentRule.value) return
  const r = rules.value.find((x) => x.name === currentRule.value)
  editRuleName.value = currentRule.value
  editRuleCode.value = r ? r.code : codeText.value
  showEditModal.value = true
}
function closeEditModal() {
  showEditModal.value = false
}
function saveEditRule() {
  const name = editRuleName.value.trim()
  if (!name) {
    addToast('error', '请填写规则名称')
    return
  }
  if (name !== currentRule.value && rules.value.some((x) => x.name === name)) {
    addToast('error', `已存在规则「${name}」`)
    return
  }
  const r = rules.value.find((x) => x.name === currentRule.value)
  if (!r) {
    rules.value.push({ id: makeId(), name, code: editRuleCode.value })
  } else {
    r.name = name
    r.code = editRuleCode.value
  }
  persistRules()
  currentRule.value = name
  codeText.value = editRuleCode.value
  showEditModal.value = false
  addToast('success', `已更新规则「${name}」`)
}

function splitImports(code: string): { imports: string; body: string } {
  const lines = code.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^import\s+(?:\*|\{|[A-Za-z$_])/.test(t) && !t.startsWith('import(')) {
      start = i
      break
    }
  }
  if (start === -1) return { imports: '', body: code }
  const importLines: string[] = []
  let inImport = true
  let i = start
  for (; i < lines.length && inImport; i++) {
    const t = lines[i].trim()
    importLines.push(lines[i])
    const closed = t.includes('}') && t.includes('from')
    const endsSemi = t.endsWith(';')
    const endsParen = t.trimEnd().endsWith(')')
    inImport = !(closed || endsSemi || endsParen)
  }
  const imports = importLines.join('\n')
  const body = lines.filter((_, idx) => idx < start || idx >= i).join('\n')
  return { imports, body }
}

const PRETTIER_OPTS = {
  parser: 'babel',
  semi: false,
  singleQuote: true,
  printWidth: 100,
} as const

async function formatRuleCode(raw: string): Promise<string | null> {
  if (!raw.trim()) return null
  try {
    const prettier = await import('prettier/standalone')
    const babel = await import('prettier/plugins/babel')
    const estree = await import('prettier/plugins/estree')
    const { imports, body } = splitImports(raw)
    let formattedBody = body
    if (body.trim()) {
      const wrapped = `async function __wrap(){\n${body}\n}`
      const fmt = await prettier.format(wrapped, {
        ...PRETTIER_OPTS,
        plugins: [babel, estree] as unknown as Plugin[],
      })
      const open = fmt.indexOf('{')
      const close = fmt.lastIndexOf('}')
      formattedBody = fmt
        .slice(open + 1, close)
        .replace(/^\n+/, '')
        .replace(/\n+$/, '')
    }
    return (imports ? imports + '\n\n' : '') + formattedBody
  } catch {
    return null
  }
}

async function formatEditRule() {
  const formatted = await formatRuleCode(editRuleCode.value)
  if (formatted !== null) {
    editRuleCode.value = formatted
    addToast('success', '已格式化代码')
  } else {
    addToast('error', '格式化失败：代码存在语法错误')
  }
}
async function formatNewRule() {
  const formatted = await formatRuleCode(newRuleCode.value)
  if (formatted !== null) {
    newRuleCode.value = formatted
    addToast('success', '已格式化代码')
  } else {
    addToast('error', '格式化失败：代码存在语法错误')
  }
}

/* ---------- 结果操作 ---------- */
function downloadOutput() {
  if (!outputText.value) return
  if (outputLang.value === 'json')
    downloadFile('converted.json', outputText.value, 'application/json')
  else downloadFile('converted.txt', outputText.value, 'text/plain')
}
</script>

<template>
  <div class="jt-app">
    <div class="toolbar">
      <button class="btn primary" :disabled="busy" @click="convert">
        {{ busy ? '转换中…' : '⚡ 转换' }}
      </button>
      <div class="cs-wrap">
        <RuleSelect
          v-model="currentRule"
          :rules="rules"
          @change="selectRule"
          @delete="handleDeleteRule"
          @rename="handleRenameRule"
        />
      </div>
      <button class="btn ghost view-btn" :disabled="!currentRule" @click="openEditModal">
        ✏️ 修改
      </button>
      <div class="tb-group push-right">
        <button class="btn primary" @click="openNewRuleModal">＋ 新增规则</button>
      </div>
    </div>

    <div class="grid">
      <div class="col">
        <section class="card">
          <div class="card-head">
            <span class="card-title"><span class="dot"></span>输入内容</span>
            <span class="card-actions">
              <button
                class="icon-btn"
                @click="formatInput"
                title="格式化输入"
                aria-label="格式化输入"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="14" y2="12" />
                  <line x1="4" y1="18" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          </div>
          <div class="editor-box">
            <CodeEditor
              v-model="inputText"
              language="json"
              placeholder="在此粘贴文本或 JSON"
              @save="formatInputSilent"
            />
          </div>
        </section>
      </div>
      <div class="col">
        <section class="card output">
          <div class="card-head">
            <span class="card-title"><span class="dot"></span>转换结果</span>
            <span class="card-actions">
              <button
                class="icon-btn"
                :disabled="!outputText"
                @click="formatOutput"
                title="格式化结果"
                aria-label="格式化结果"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="14" y2="12" />
                  <line x1="4" y1="18" x2="18" y2="18" />
                </svg>
              </button>
              <CopyButton
                :text="outputText"
                variant="btn"
                :icon="false"
                label="复制"
                success-text="已复制结果"
                :toast="addToast"
              />
              <button
                class="icon-btn"
                :disabled="!outputText"
                @click="downloadOutput"
                title="下载"
                aria-label="下载"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </span>
          </div>
          <div class="editor-box">
            <CodeEditor
              v-model="outputText"
              :language="outputLang"
              readonly
              placeholder="转换后结果将显示在此"
            />
          </div>
        </section>
      </div>
    </div>

    <!-- 新增规则弹窗 -->
    <Modal
      :open="showNewRuleModal"
      :width="920"
      title="新增规则"
      :style="{
        '--vc-modal-overlay': 'rgba(15, 23, 42, 0.5)',
        '--vc-modal-overlay-blur': 'none',
        '--vc-modal-radius': 'var(--radius-lg)',
        '--vc-modal-border': '1px solid var(--border-light)',
        '--vc-modal-shadow': 'var(--shadow-lg)',
        '--vc-modal-max-h': '88vh',
        '--vc-modal-body-pad': '1.25rem 1.4rem 1.5rem',
        '--vc-modal-header-pad': '1rem 1.4rem',
        '--vc-modal-title-size': '1.15rem',
      }"
      @close="closeNewRuleModal"
    >
      <div
        class="tt-rule-wrap"
        @keydown.ctrl.s.prevent="formatNewRule"
        @keydown.meta.s.prevent="formatNewRule"
      >
        <p class="tt-desc">
          函数体接收 <code>input</code>（输入框的原始字符串），用 <code>return</code> 返回结果。
          如需按 JSON 处理可在函数内 <code>JSON.parse(input)</code>。返回字符串则原样输出，
          返回对象/数组则自动格式化高亮。可用 <code>import</code> 引入第三方包。 按 <kbd>⌘S</kbd> /
          <kbd>Ctrl+S</kbd> 格式化代码。
        </p>

        <div class="tt-row">
          <input class="rule-name" v-model="newRuleName" placeholder="规则名称" />
        </div>

        <div class="editor-box tt-editor">
          <CodeEditor v-model="newRuleCode" language="javascript" placeholder="return input" />
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="closeNewRuleModal">取消</button>
        <button class="btn primary" :disabled="!newRuleName.trim()" @click="createRule">
          保存规则
        </button>
      </template>
    </Modal>

    <Modal
      :open="showEditModal"
      :width="920"
      :title="'修改规则 · ' + currentRule"
      :style="{
        '--vc-modal-overlay': 'rgba(15, 23, 42, 0.5)',
        '--vc-modal-overlay-blur': 'none',
        '--vc-modal-radius': 'var(--radius-lg)',
        '--vc-modal-border': '1px solid var(--border-light)',
        '--vc-modal-shadow': 'var(--shadow-lg)',
        '--vc-modal-max-h': '88vh',
        '--vc-modal-body-pad': '1.25rem 1.4rem 1.5rem',
        '--vc-modal-header-pad': '1rem 1.4rem',
        '--vc-modal-title-size': '1.15rem',
      }"
      @close="closeEditModal"
    >
      <div
        class="tt-rule-wrap"
        @keydown.ctrl.s.prevent="formatEditRule"
        @keydown.meta.s.prevent="formatEditRule"
      >
        <p class="tt-desc">
          直接修改该规则的名称与转换函数，保存后即时生效（当前应用即更新）。 按 <kbd>⌘S</kbd> /
          <kbd>Ctrl+S</kbd> 格式化代码。
        </p>
        <div class="tt-row">
          <input class="rule-name" v-model="editRuleName" placeholder="规则名称" />
        </div>
        <div class="editor-box tt-editor">
          <CodeEditor v-model="editRuleCode" language="javascript" placeholder="return input" />
        </div>
      </div>
      <template #footer>
        <CopyButton
          :text="editRuleCode"
          variant="btn"
          label="复制代码"
          success-text="已复制函数代码"
          :toast="addToast"
        />
        <button class="btn" @click="closeEditModal">取消</button>
        <button class="btn primary" :disabled="!editRuleName.trim()" @click="saveEditRule">
          保存修改
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.jt-app {
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
  gap: 0.6rem;
  margin-bottom: 1rem;
  align-items: center;
}
.tb-group {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
  padding-right: 0.6rem;
  border-right: 1px solid var(--border-light);
}
.tb-group:last-child {
  border-right: none;
  padding-right: 0;
}
.tb-group.push-right {
  margin-left: auto;
  border-right: none;
  padding-right: 0;
}
.tb-label {
  color: var(--text-muted);
  font-size: var(--font-size-control);
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
.btn.primary {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border: none;
  font-weight: 600;
}
.btn.primary:hover:not(:disabled) {
  filter: brightness(1.05);
  color: var(--accent-contrast);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.ghost {
  background: transparent;
}
.rule-name {
  background: var(--bg-card);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  padding: 0.5rem 0.6rem;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-body);
  width: 140px;
  max-width: 200px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: minmax(0, 1fr);
  gap: 1rem;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
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
  flex: 1;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.7rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border-light);
}
.card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
}
.card-title .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.card:not(.output) .dot {
  background: var(--success);
}
.card.output .dot {
  background: var(--accent);
}
.hint {
  color: var(--text-muted);
  font-size: var(--font-size-small);
  white-space: nowrap;
}
.card-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: var(--bg-card);
  color: var(--text-muted);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition-fast);
}
.icon-btn svg {
  width: 15px;
  height: 15px;
}
.icon-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.editor-box {
  flex: 1;
  min-height: 0;
}

/* 让项目下拉组件（CustomSelect）与布局更协调 */
.cs-wrap {
  display: inline-flex;
}

@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .editor-box {
    min-height: 0;
  }
}

/* ---------- 弹窗内容样式（外壳交由 Modal 组件） ---------- */
.tt-rule-wrap {
  display: flex;
  flex-direction: column;
}
.tt-desc {
  margin: 0 0 1rem;
  color: var(--text-secondary);
  font-size: var(--font-size-control);
  line-height: 1.6;
}
.tt-desc code {
  background: var(--bg-subtle);
  padding: 0.05rem 0.35rem;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-control);
}
.tt-desc kbd,
.btn kbd {
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-small);
  line-height: 1;
  padding: 0.12rem 0.35rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border, #d0d0d0);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  white-space: nowrap;
}
.tt-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin: 0.75rem 0;
}
.tt-editor {
  height: 340px;
  margin: 0.5rem 0;
}
</style>
