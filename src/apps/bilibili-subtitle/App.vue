<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/request'
import { copyToClipboard } from '@/utils'
import { Tooltip } from '@/components'

const router = useRouter()
function goBack() {
  router.push('/')
}

interface PageInfo {
  cid: number
  page: number
  part: string
  duration: number
}
interface VideoInfo {
  bvid: string
  title: string
  pages: PageInfo[]
}
interface SingleResult {
  title: string
  bvid: string
  all: false
  page?: number
  part?: string
  lan?: string
  lanDoc?: string
  text?: string
  timed?: string
  count?: number
}
interface PageSub extends PageInfo {
  lan?: string
  lanDoc?: string
  text?: string
  timed?: string
  count?: number
  error?: string
}
interface AllResult {
  title: string
  bvid: string
  all: true
  pages: PageSub[]
}
type ExtractResult = SingleResult | AllResult

const url = ref('')
const sessdata = ref(localStorage.getItem('bili_sessdata') || '')
const remember = ref(!!localStorage.getItem('bili_sessdata'))

const parsing = ref(false)
const infoError = ref('')
const videoInfo = ref<VideoInfo | null>(null)

// 分P选择：'all' 表示全部P，否则为某个分P 的 cid（number）
const selMode = ref<number | 'all'>(0)
const extracting = ref(false)
const subError = ref('')
const result = ref<ExtractResult | null>(null)

const showTimestamps = ref(false)
const copied = ref(false)

// 修改链接后清空已解析状态，避免拿到旧视频的分P列表
watch(url, () => {
  videoInfo.value = null
  result.value = null
  infoError.value = ''
  subError.value = ''
})

const singleResult = computed(() => (result.value && !result.value.all ? result.value : null))
const charCount = computed(() => singleResult.value?.text?.length || 0)
const totalCount = computed(() =>
  result.value && result.value.all ? result.value.pages.reduce((s, p) => s + (p.count || 0), 0) : 0,
)
const totalChars = computed(() =>
  result.value && result.value.all
    ? result.value.pages.reduce((s, p) => s + (p.text?.length || 0), 0)
    : 0,
)

function saveSessdata() {
  if (remember.value && sessdata.value.trim()) {
    localStorage.setItem('bili_sessdata', sessdata.value.trim())
  } else {
    localStorage.removeItem('bili_sessdata')
  }
}

// 第一步：解析视频，拿到标题 + 完整分P列表（用于选P）
async function parseVideo() {
  const input = url.value.trim()
  if (!input) {
    infoError.value = '请先粘贴 B站视频链接'
    return
  }
  parsing.value = true
  infoError.value = ''
  videoInfo.value = null
  result.value = null
  subError.value = ''
  try {
    saveSessdata()
    const res = await api.post<{ data: VideoInfo }>('/api/bilibili/info', {
      url: input,
      sessdata: sessdata.value.trim() || undefined,
    })
    videoInfo.value = res.data
    // 默认选中第 1P；用户可改选其他分P 或「全部 P」
    selMode.value = res.data.pages[0]?.cid ?? 'all'
    // 单P 视频无需选P，解析成功后直接提取字幕，省去一次点击
    if (res.data.pages.length === 1) {
      void extractSubtitle()
    }
  } catch (e) {
    infoError.value = e instanceof Error ? e.message : '视频解析失败，请稍后重试'
  } finally {
    parsing.value = false
  }
}

// 第二步：按选择（单P 或 全部P）提取字幕
async function extractSubtitle() {
  if (!videoInfo.value) return
  extracting.value = true
  subError.value = ''
  result.value = null
  try {
    const res = await api.post<{ data: ExtractResult }>('/api/bilibili/subtitle', {
      bvid: videoInfo.value.bvid,
      cid: selMode.value === 'all' ? undefined : selMode.value,
      all: selMode.value === 'all' ? true : undefined,
      sessdata: sessdata.value.trim() || undefined,
    })
    result.value = res.data
  } catch (e) {
    subError.value = e instanceof Error ? e.message : '字幕获取失败，请稍后重试'
  } finally {
    extracting.value = false
  }
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// 复制成功后的 UI 反馈（「已复制 ✓」状态 1.5s 后复原），copyText / copyAll 共用
function onCopied() {
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

// 单P 文本：按「显示时间戳」开关选 timed / text
function pickText(item: { text?: string; timed?: string }): string {
  return showTimestamps.value ? item.timed || '' : item.text || ''
}

function copyText() {
  if (singleResult.value) copyToClipboard(pickText(singleResult.value), onCopied)
}

function exportTxt() {
  const r = singleResult.value
  if (!r) return
  downloadFile(`${r.bvid}-字幕.txt`, pickText(r), 'text/plain;charset=utf-8')
}

function exportJson() {
  const r = singleResult.value
  if (!r) return
  downloadFile(`${r.bvid}-字幕.json`, JSON.stringify(r, null, 2), 'application/json')
}

// 全部P 时，把各分P 文本拼成一段（用于复制 / 导出）
function buildAllText(): string {
  if (!result.value || !result.value.all) return ''
  return result.value.pages
    .map((p) => {
      const head = `【P${p.page} · ${p.part}】`
      if (p.error) return `${head}\n（${p.error}）`
      return `${head}\n${pickText(p)}`
    })
    .join('\n\n')
}

function copyAll() {
  const t = buildAllText()
  if (t) copyToClipboard(t, onCopied)
}

function exportAllTxt() {
  if (!result.value || !result.value.all) return
  const t = buildAllText()
  if (!t) return
  downloadFile(`${result.value.bvid}-全部分P字幕.txt`, t, 'text/plain;charset=utf-8')
}
</script>

<template>
  <div class="page">
    <header class="head">
      <button class="back-btn" @click="goBack" aria-label="返回首页">← 返回</button>
      <div class="title-row">
        <span class="logo">📝</span>
        <div>
          <h1>B站字幕提取</h1>
          <p class="sub">粘贴视频链接，提取字幕文本，方便做内容分析（支持多选分P / 全部P）</p>
        </div>
      </div>
    </header>

    <!-- 第一步：链接 + 解析 -->
    <section class="card">
      <label class="field">
        <span class="label">视频链接</span>
        <input
          v-model="url"
          class="input"
          type="text"
          placeholder="https://www.bilibili.com/video/BV1xx411c7mD"
          @keyup.enter="parseVideo"
        />
      </label>

      <label class="field">
        <span class="label">
          SESSDATA
          <Tooltip placement="bottom" max-width="min(300px, 88vw)">
            <span class="hint-icon" role="button" aria-label="什么是 SESSDATA，如何获取">ⓘ</span>
            <template #content>
              <b>SESSDATA 是什么？</b><br />
              登录 B站后，浏览器 Cookie 里的一个字段，相当于你的登录凭证。<br /><br />
              部分视频的
              <b>AI 字幕需登录后才可见</b>，填入可解锁更多字幕；留空也能抓取公开字幕。<br /><br />
              <b>如何获取：</b>登录 bilibili.com → 按 F12 → Application → Cookies → 复制 SESSDATA
              的值。<br /><br />
              <span class="hint-warn">该值等同账号凭证，仅本地使用，请勿外传。</span>
            </template>
          </Tooltip>
        </span>
        <div class="sess-row">
          <input
            v-model="sessdata"
            class="input"
            type="password"
            placeholder="留空即可，填了可解锁更多字幕"
          />
          <label class="remember"> <input v-model="remember" type="checkbox" /> 记住 </label>
        </div>
      </label>

      <button class="btn" :disabled="parsing" @click="parseVideo">
        {{ parsing ? '解析中…' : '解析视频' }}
      </button>

      <p v-if="infoError" class="error">{{ infoError }}</p>
    </section>

    <!-- 单P：解析后自动提取，这里只展示加载 / 错误状态（成功后由结果卡片接管） -->
    <section v-if="videoInfo && videoInfo.pages.length === 1 && !result" class="card">
      <div class="video-meta">
        <span class="logo-sm">🎬</span>
        <div>
          <div class="vm-title">{{ videoInfo.title }}</div>
          <div class="muted">单分P · 已自动提取字幕</div>
        </div>
      </div>
      <p v-if="extracting" class="muted" style="margin-top: 0.9rem">正在提取字幕…</p>
      <p v-if="subError" class="error">
        {{ subError }}
        <button class="retry" @click="extractSubtitle">重试</button>
      </p>
    </section>

    <!-- 第二步：多P 选分P + 生成（单P 已自动提取，不再展示此卡片） -->
    <section v-if="videoInfo && videoInfo.pages.length > 1" class="card">
      <div class="video-meta">
        <span class="logo-sm">🎬</span>
        <div>
          <div class="vm-title">{{ videoInfo.title }}</div>
          <div class="muted">共 {{ videoInfo.pages.length }} 个分P · 请选择要提取的分P</div>
        </div>
      </div>

      <div class="field" style="margin-top: 1rem">
        <span class="label">选择分P</span>
        <div class="pages">
          <label
            v-for="p in videoInfo.pages"
            :key="p.cid"
            class="page-opt"
            :class="{ active: selMode === p.cid }"
          >
            <input
              type="radio"
              name="pageSel"
              :checked="selMode === p.cid"
              @change="selMode = p.cid"
            />
            <span class="page-name">P{{ p.page }} · {{ p.part }}</span>
          </label>
          <label class="page-opt all-opt" :class="{ active: selMode === 'all' }">
            <input
              type="radio"
              name="pageSel"
              :checked="selMode === 'all'"
              @change="selMode = 'all'"
            />
            <span class="page-name">全部 P（{{ videoInfo.pages.length }} 个）</span>
          </label>
        </div>
      </div>

      <button
        class="btn"
        :disabled="extracting"
        @click="extractSubtitle"
        style="margin-top: 0.5rem"
      >
        {{ extracting ? '生成中…' : '生成字幕' }}
      </button>

      <p v-if="subError" class="error">{{ subError }}</p>
    </section>

    <!-- 结果：单P -->
    <section v-if="result && !result.all" class="card result">
      <div class="result-head">
        <div>
          <h2 class="video-title">{{ result.title }}</h2>
          <div class="meta">
            <span v-if="result.part" class="tag">P{{ result.page }} · {{ result.part }}</span>
            <span class="tag">{{ result.lanDoc }}</span>
            <span class="muted">共 {{ result.count }} 句</span>
            <span class="muted">{{ charCount }} 字</span>
          </div>
        </div>
        <div class="actions">
          <button class="ghost" @click="copyText">{{ copied ? '已复制 ✓' : '复制' }}</button>
          <button class="ghost" @click="exportTxt">导出 TXT</button>
          <button class="ghost" @click="exportJson">导出 JSON</button>
        </div>
      </div>

      <div class="toggle">
        <label class="remember">
          <input v-model="showTimestamps" type="checkbox" /> 显示时间戳
        </label>
      </div>

      <textarea class="output" readonly :value="pickText(result)" />
    </section>

    <!-- 结果：全部P -->
    <section v-if="result && result.all" class="card result">
      <div class="result-head">
        <div>
          <h2 class="video-title">{{ result.title }}</h2>
          <div class="meta">
            <span class="tag">全部分P</span>
            <span class="muted">共 {{ result.pages.length }} 个分P</span>
            <span class="muted">{{ totalCount }} 句</span>
            <span class="muted">{{ totalChars }} 字</span>
          </div>
        </div>
        <div class="actions">
          <button class="ghost" @click="copyAll">{{ copied ? '已复制 ✓' : '复制全部' }}</button>
          <button class="ghost" @click="exportAllTxt">导出全部 TXT</button>
        </div>
      </div>

      <div class="toggle">
        <label class="remember">
          <input v-model="showTimestamps" type="checkbox" /> 显示时间戳
        </label>
      </div>

      <div v-for="p in result.pages" :key="p.cid" class="page-block">
        <div class="page-block-head">
          <span class="page-tag">P{{ p.page }} · {{ p.part }}</span>
          <span v-if="p.error" class="page-err">{{ p.error }}</span>
          <span v-else class="muted">{{ p.count }} 句 · {{ p.lanDoc }}</span>
        </div>
        <textarea v-if="!p.error" class="output" readonly :value="pickText(p)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 820px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}
.head {
  margin-bottom: 1.25rem;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.logo {
  font-size: 2rem;
}
h1 {
  margin: 0;
  font-size: 1.4rem;
  color: var(--text-primary);
}
.sub {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1.25rem;
  margin-bottom: 1.25rem;
}
.field {
  display: block;
  margin-bottom: 1rem;
}
.label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.4rem;
}
.hint-icon {
  color: var(--text-muted);
  cursor: help;
  margin-left: 0.2rem;
  outline: none;
}
.hint-warn {
  color: #fca5a5;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background var(--transition-fast);
  margin-bottom: 1rem;
}
.back-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.input {
  width: 100%;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.95rem;
  outline: none;
  transition: border-color var(--transition-fast);
}
.input:focus {
  border-color: var(--accent);
  box-shadow: var(--shadow-brand-sm);
}
.sess-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.remember {
  font-size: 0.82rem;
  color: var(--text-secondary);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.btn {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border: none;
  padding: 0.7rem 1.6rem;
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error {
  margin-top: 0.9rem;
  color: var(--danger);
  background: var(--danger-bg);
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
}
.retry {
  margin-left: 0.6rem;
  background: transparent;
  border: 1px solid currentColor;
  color: inherit;
  padding: 0.2rem 0.65rem;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  cursor: pointer;
  vertical-align: middle;
}
.video-meta {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.logo-sm {
  font-size: 1.5rem;
}
.vm-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}
.pages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.page-opt {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.page-opt.active {
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent-strong);
}
.page-opt.all-opt {
  font-weight: 600;
}
.page-name {
  white-space: nowrap;
}
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}
.video-title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
  word-break: break-all;
}
.meta {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
}
.tag {
  background: var(--accent-bg);
  color: var(--accent-strong);
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
}
.muted {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.ghost {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border: 1px solid var(--border-light);
  padding: 0.45rem 0.9rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background var(--transition-fast);
}
.ghost:hover {
  background: var(--bg-hover);
}
.toggle {
  margin: 1rem 0 0.5rem;
}
.page-block {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--border-light);
}
.page-block:first-of-type {
  border-top: none;
  padding-top: 0;
}
.page-block-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}
.page-tag {
  background: var(--accent-bg);
  color: var(--accent-strong);
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
}
.page-err {
  font-size: 0.82rem;
  color: var(--danger);
}
.output {
  width: 100%;
  height: 320px;
  margin-top: 0.25rem;
  padding: 1rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-page);
  color: var(--text-body);
  font-size: 0.9rem;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  font-family: var(--font-sans);
}
</style>
