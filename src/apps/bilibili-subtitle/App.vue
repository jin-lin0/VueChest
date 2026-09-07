<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Braces,
  Captions,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Download,
  FileText,
  Link2,
  LoaderCircle,
  Settings2,
  Sparkles,
} from '@lucide/vue'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { api } from '@/lib/request'
import { getStorage, setStorage, removeStorage } from '@/lib/storage'
import { copyToClipboard } from '@/utils/clipboard'
import { downloadFile } from '@/utils/common'
import CustomSelect from '@/components/common/CustomSelect.vue'
import MarkdownView from '@/components/common/MarkdownView.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import { useBilibiliAnalysis } from './composables/useBilibiliAnalysis'
import AnalysisFollowUp from './components/AnalysisFollowUp.vue'
import BilibiliCredentialPanel from './components/BilibiliCredentialPanel.vue'
import BilibiliSettingsDrawer from './components/BilibiliSettingsDrawer.vue'
import {
  loadBilibiliSubtitleSettings,
  saveBilibiliSubtitleSettings,
  type BilibiliSubtitleSettings,
} from './settings'
import type { ExtractResult, VideoInfo } from './types'

const STORAGE_KEY_BILI_SESSDATA = 'bili_sessdata'

const router = useRouter()
function goBack() {
  router.push('/')
}

const url = ref('')
const savedSessdata = ref(getStorage<string>(STORAGE_KEY_BILI_SESSDATA) ?? '')
const sessdata = ref(savedSessdata.value)
const credentialSaved = computed(
  () => Boolean(sessdata.value.trim()) && sessdata.value.trim() === savedSessdata.value,
)

const parsing = ref(false)
const infoError = ref('')
const videoInfo = ref<VideoInfo | null>(null)

// 分P选择：'all' 表示全部P，否则为某个分P 的 cid（number）
const selMode = ref<number | 'all'>(0)
const extracting = ref(false)
const subError = ref('')
const result = ref<ExtractResult | null>(null)
const setupExpanded = ref(true)
const settingsOpen = ref(false)
const settings = reactive(loadBilibiliSubtitleSettings())
const pendingAutoAnalysis = ref(false)

const showTimestamps = ref(settings.showTimestampsByDefault)
const copied = ref(false)
const useAnalysisCache = computed(() => settings.useAnalysisCache)
const {
  analysisProvider,
  analysisModel,
  analysisType,
  customPrompt,
  analyzing,
  analysisError,
  analysisDone,
  analysisTotal,
  analysisStatus,
  analysisResults,
  analysisResultCounts,
  analysisProviderOptions,
  analysisModelOptions,
  selectAnalysisProvider,
  runAnalysis,
  cancelAnalysis,
  copyAnalysis,
  exportAnalysisMarkdown,
  exportAnalysisJson,
  analysisThreadFor,
  askAnalysisQuestion,
  resetAnalysis,
} = useBilibiliAnalysis(result, onCopied, useAnalysisCache)
const analysisConfigExpanded = ref(true)
const selectedProviderLabel = computed(
  () =>
    analysisProviderOptions.value.find((item) => item.value === analysisProvider.value)?.label ||
    '选择平台',
)
const selectedModelLabel = computed(
  () =>
    analysisModelOptions.value.find((item) => item.value === analysisModel.value)?.label ||
    '选择模型',
)

const workflowStep = computed(() => {
  if (analysisResults.value.length) return 3
  if (result.value) return 2
  return 1
})

// 修改链接后清空已解析状态，避免拿到旧视频的分P列表
watch(url, () => {
  pendingAutoAnalysis.value = false
  setupExpanded.value = true
  videoInfo.value = null
  result.value = null
  infoError.value = ''
  subError.value = ''
  resetAnalysis()
})

watch([analysisProvider, analysisModel], tryPendingAutoAnalysis)

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
  const value = sessdata.value.trim()
  if (!value) return
  setStorage(STORAGE_KEY_BILI_SESSDATA, value)
  savedSessdata.value = value
}

function clearSessdata() {
  sessdata.value = ''
  savedSessdata.value = ''
  removeStorage(STORAGE_KEY_BILI_SESSDATA)
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
    const res = await api.post<{ data: VideoInfo }>('/api/bilibili/info', {
      url: input,
      sessdata: sessdata.value.trim() || undefined,
    })
    videoInfo.value = res.data
    const firstPage = res.data.pages[0]
    selMode.value =
      res.data.pages.length > 1 && settings.defaultPageMode === 'all'
        ? 'all'
        : (firstPage?.cid ?? 'all')
    if (settings.autoExtractAfterParse) {
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
    resetAnalysis()
    setupExpanded.value = !settings.collapseSetupAfterExtract
    if (settings.autoAnalyzeOverview) {
      analysisType.value = 'overview'
      pendingAutoAnalysis.value = true
      tryPendingAutoAnalysis()
    }
  } catch (e) {
    subError.value = e instanceof Error ? e.message : '字幕获取失败，请稍后重试'
  } finally {
    extracting.value = false
  }
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

function startAnalysis() {
  if (
    analysisProvider.value &&
    analysisModel.value &&
    (analysisType.value !== 'custom' || customPrompt.value.trim()) &&
    settings.collapseAnalysisConfigAfterStart
  ) {
    analysisConfigExpanded.value = false
  }
  void runAnalysis()
}

function tryPendingAutoAnalysis() {
  if (
    !pendingAutoAnalysis.value ||
    !result.value ||
    !analysisProvider.value ||
    !analysisModel.value
  ) {
    return
  }
  pendingAutoAnalysis.value = false
  startAnalysis()
}

function applySettings(value: BilibiliSubtitleSettings) {
  Object.assign(settings, value)
  saveBilibiliSubtitleSettings(value)
  showTimestamps.value = value.showTimestampsByDefault
}

function clearAnalysisCache() {
  removeStorage(STORAGE_KEYS.BILI_ANALYSIS_CACHE)
}
</script>

<template>
  <div class="bili-workbench" :class="{ 'has-result': result, 'setup-expanded': setupExpanded }">
    <header class="app-header">
      <button class="back-button" type="button" aria-label="返回首页" @click="goBack">
        <ArrowLeft :size="18" />
      </button>
      <div class="app-identity">
        <span class="app-mark"><Captions :size="22" /></span>
        <div>
          <h1>B站字幕工作台</h1>
          <p>提取字幕、生成内容分析，并在当前页面继续追问。</p>
        </div>
      </div>
      <div class="header-controls">
        <button
          class="settings-button"
          type="button"
          aria-label="打开字幕工作台设置"
          title="工作台设置"
          @click="settingsOpen = true"
        >
          <Settings2 :size="17" />
        </button>
        <ol class="workflow-status" aria-label="处理进度">
          <li :class="{ active: workflowStep >= 1 }"><b>1</b><span>视频与凭证</span></li>
          <li :class="{ active: workflowStep >= 2 }"><b>2</b><span>字幕内容</span></li>
          <li :class="{ active: workflowStep >= 3 }"><b>3</b><span>AI 分析</span></li>
        </ol>
      </div>
    </header>

    <section class="setup-area">
      <div v-if="result" class="setup-summary">
        <div>
          <span><Link2 :size="16" /></span>
          <p>
            <strong>{{ result.title }}</strong>
            <small>
              {{ result.all ? `${result.pages.length} 个分P` : `P${result.page || 1}` }}
              · {{ sessdata.trim() ? '使用个人凭证' : '使用公开或服务端凭证' }}
            </small>
          </p>
        </div>
        <button type="button" @click="setupExpanded = !setupExpanded">
          {{ setupExpanded ? '收起视频与凭证' : '更换视频或凭证' }}
          <ChevronUp v-if="setupExpanded" :size="14" />
          <ChevronDown v-else :size="14" />
        </button>
      </div>

      <template v-if="!result || setupExpanded">
        <section class="setup-grid">
          <article class="source-card">
            <div class="panel-heading">
              <span><Link2 :size="18" /></span>
              <div>
                <h2>视频来源</h2>
                <p>粘贴 B站视频链接；单P视频会自动继续提取字幕。</p>
              </div>
            </div>

            <label class="source-field">
              <span>视频链接</span>
              <input
                v-model="url"
                type="text"
                placeholder="https://www.bilibili.com/video/BV1xx411c7mD"
                @keyup.enter="parseVideo"
              />
            </label>

            <div class="source-actions">
              <button class="primary-action" type="button" :disabled="parsing" @click="parseVideo">
                <LoaderCircle v-if="parsing" class="spin" :size="16" />
                <Captions v-else :size="16" />
                {{ parsing ? '正在解析视频…' : '解析视频' }}
              </button>
              <span v-if="sessdata.trim()">本次请求使用个人凭证</span>
              <span v-else>未填写时尝试服务端凭证或公开字幕</span>
            </div>

            <p v-if="infoError" class="error-message">{{ infoError }}</p>

            <div
              v-if="videoInfo && videoInfo.pages.length === 1 && !result"
              class="source-progress"
            >
              <span><FileText :size="17" /></span>
              <div>
                <strong>{{ videoInfo.title }}</strong>
                <small v-if="extracting">正在自动提取字幕…</small>
                <small v-else>单分P · 已完成视频解析</small>
              </div>
              <button
                v-if="!settings.autoExtractAfterParse && !extracting"
                type="button"
                @click="extractSubtitle"
              >
                生成字幕
              </button>
            </div>
            <p v-if="subError && videoInfo?.pages.length === 1" class="error-message">
              {{ subError }}
              <button type="button" @click="extractSubtitle">重试</button>
            </p>
          </article>

          <BilibiliCredentialPanel
            v-model="sessdata"
            :saved="credentialSaved"
            :has-stored-credential="Boolean(savedSessdata)"
            @save="saveSessdata"
            @clear="clearSessdata"
          />
        </section>

        <section v-if="videoInfo && videoInfo.pages.length > 1" class="page-selection-card">
          <div class="panel-heading compact">
            <span><FileText :size="18" /></span>
            <div>
              <h2>{{ videoInfo.title }}</h2>
              <p>检测到 {{ videoInfo.pages.length }} 个分P，选择单P或一次提取全部。</p>
            </div>
          </div>

          <div class="page-options">
            <label
              v-for="page in videoInfo.pages"
              :key="page.cid"
              :class="{ active: selMode === page.cid }"
            >
              <input
                type="radio"
                name="pageSel"
                :checked="selMode === page.cid"
                @change="selMode = page.cid"
              />
              <span>P{{ page.page }}</span>
              <strong>{{ page.part }}</strong>
              <small>{{ Math.ceil(page.duration / 60) }} 分钟</small>
            </label>
            <label class="all-pages" :class="{ active: selMode === 'all' }">
              <input
                type="radio"
                name="pageSel"
                :checked="selMode === 'all'"
                @change="selMode = 'all'"
              />
              <span>ALL</span>
              <strong>全部分P</strong>
              <small>{{ videoInfo.pages.length }} 个部分</small>
            </label>
          </div>

          <div class="selection-actions">
            <button
              class="primary-action"
              type="button"
              :disabled="extracting"
              @click="extractSubtitle"
            >
              <LoaderCircle v-if="extracting" class="spin" :size="16" />
              <Captions v-else :size="16" />
              {{ extracting ? '正在生成字幕…' : '生成字幕' }}
            </button>
            <p v-if="subError" class="error-message">{{ subError }}</p>
          </div>
        </section>
      </template>
    </section>

    <section v-if="result" class="content-workspace">
      <article class="transcript-panel">
        <header class="content-header">
          <div>
            <span class="section-kicker">TRANSCRIPT</span>
            <h2>{{ result.title }}</h2>
            <div class="content-meta">
              <span v-if="!result.all && result.part">P{{ result.page }} · {{ result.part }}</span>
              <span v-if="!result.all && result.lanDoc">{{ result.lanDoc }}</span>
              <span v-if="result.all">全部 {{ result.pages.length }} 个分P</span>
              <small>{{ result.all ? totalCount : result.count }} 句</small>
              <small>{{ result.all ? totalChars : charCount }} 字</small>
            </div>
          </div>
          <label class="timestamp-toggle">
            <Clock3 :size="14" />
            <input v-model="showTimestamps" type="checkbox" />
            显示时间戳
          </label>
        </header>

        <div class="content-actions">
          <button type="button" @click="result.all ? copyAll() : copyText()">
            <Copy :size="14" /> {{ copied ? '已复制' : result.all ? '复制全部' : '复制字幕' }}
          </button>
          <button v-if="!result.all" type="button" @click="exportTxt">
            <Download :size="14" /> TXT
          </button>
          <button v-if="!result.all" type="button" @click="exportJson">
            <Download :size="14" /> JSON
          </button>
          <button v-if="result.all" type="button" @click="exportAllTxt">
            <Download :size="14" /> 全部分P TXT
          </button>
        </div>

        <textarea v-if="!result.all" class="transcript-output" readonly :value="pickText(result)" />

        <div v-else class="multi-transcript-list">
          <section v-for="page in result.pages" :key="page.cid" class="page-transcript">
            <header>
              <strong>P{{ page.page }} · {{ page.part }}</strong>
              <small v-if="page.error" class="page-error">{{ page.error }}</small>
              <small v-else>{{ page.count }} 句 · {{ page.lanDoc }}</small>
            </header>
            <textarea v-if="!page.error" readonly :value="pickText(page)" />
          </section>
        </div>
      </article>

      <aside class="analysis-panel">
        <header class="analysis-heading">
          <span><Sparkles :size="16" /></span>
          <h2>分析与追问</h2>
          <div class="analysis-types" role="group" aria-label="分析类型">
            <button
              :class="{ active: analysisType === 'overview' }"
              @click="analysisType = 'overview'"
            >
              内容概览
              <span v-if="analysisResultCounts.overview">{{ analysisResultCounts.overview }}</span>
            </button>
            <button
              :class="{ active: analysisType === 'translate' }"
              @click="analysisType = 'translate'"
            >
              中文翻译
              <span v-if="analysisResultCounts.translate">{{
                analysisResultCounts.translate
              }}</span>
            </button>
            <button :class="{ active: analysisType === 'custom' }" @click="analysisType = 'custom'">
              自定义
              <span v-if="analysisResultCounts.custom">{{ analysisResultCounts.custom }}</span>
            </button>
          </div>
          <b v-if="analyzing">{{ analysisDone }}/{{ analysisTotal }}</b>
        </header>

        <div class="analysis-config">
          <div class="analysis-toolbar">
            <button
              class="model-config-toggle"
              type="button"
              :aria-expanded="analysisConfigExpanded"
              @click="analysisConfigExpanded = !analysisConfigExpanded"
            >
              <span>模型</span>
              <strong>{{ selectedProviderLabel }} · {{ selectedModelLabel }}</strong>
              <ChevronUp v-if="analysisConfigExpanded" :size="14" />
              <ChevronDown v-else :size="14" />
            </button>

            <div class="analysis-actions">
              <button v-if="!analyzing" class="primary-action" type="button" @click="startAnalysis">
                <Sparkles :size="14" /> 开始分析
              </button>
              <button v-else class="cancel-action" type="button" @click="cancelAnalysis">
                取消
              </button>
              <Tooltip
                v-if="analysisResults.length && !analyzing"
                :text="copied ? '分析内容已复制' : '复制分析内容'"
                placement="bottom"
                max-width="180px"
              >
                <button
                  class="icon-action"
                  type="button"
                  :aria-label="copied ? '已复制分析' : '复制分析'"
                  @click="copyAnalysis"
                >
                  <Copy :size="14" />
                </button>
              </Tooltip>
              <Tooltip
                v-if="analysisResults.length && !analyzing"
                text="导出为 Markdown 文档"
                placement="bottom"
                max-width="180px"
              >
                <button
                  class="icon-action"
                  type="button"
                  aria-label="导出 Markdown"
                  @click="exportAnalysisMarkdown"
                >
                  <FileText :size="14" />
                </button>
              </Tooltip>
              <Tooltip
                v-if="analysisResults.length && !analyzing"
                text="导出结构化 JSON 数据"
                placement="bottom"
                max-width="180px"
              >
                <button
                  class="icon-action"
                  type="button"
                  aria-label="导出 JSON"
                  @click="exportAnalysisJson"
                >
                  <Braces :size="14" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div v-show="analysisConfigExpanded" class="analysis-models">
            <CustomSelect
              v-model="analysisProvider"
              :options="analysisProviderOptions"
              block
              @change="selectAnalysisProvider"
            />
            <CustomSelect
              v-model="analysisModel"
              :options="analysisModelOptions"
              searchable
              block
            />
          </div>

          <textarea
            v-if="analysisType === 'custom'"
            v-model="customPrompt"
            class="custom-prompt"
            maxlength="1000"
            placeholder="例如：提取产品需求、争议观点和可验证的数据"
          />

          <div v-if="analyzing" class="analysis-progress">
            <i
              :style="{
                width: analysisTotal ? (analysisDone / analysisTotal) * 100 + '%' : '0%',
              }"
            ></i>
          </div>
          <p v-if="analysisError" class="error-message">
            {{ analysisError }}
            <button v-if="!analyzing" type="button" @click="runAnalysis(true)">重试未完成项</button>
          </p>
        </div>

        <div class="analysis-scroll">
          <div v-if="analyzing && !analysisResults.length" class="analysis-empty streaming-empty">
            <LoaderCircle class="spin" :size="22" />
            <strong>{{ analysisStatus || '正在准备分析…' }}</strong>
            <p>内容生成后会立即显示，无需等待完整结果。</p>
          </div>

          <div v-if="!analysisResults.length && !analyzing" class="analysis-empty">
            <Sparkles :size="22" />
            <strong>字幕已准备好</strong>
            <p>选择分析方式和模型，结果会显示在这里。</p>
          </div>

          <article v-for="item in analysisResults" :key="item.id" class="analysis-result">
            <header>
              <div>
                <strong>{{ item.title }}</strong>
                <small v-if="item.streaming" class="streaming-label">
                  <LoaderCircle class="spin" :size="11" /> 正在生成
                </small>
                <small v-else>{{ item.model }} · {{ item.chunkCount }} 个分块</small>
              </div>
              <span v-if="item.cached">缓存结果</span>
            </header>
            <div class="analysis-content">
              <MarkdownView
                v-if="item.content"
                :content="item.content"
                :streaming="item.streaming"
              />
              <p v-else-if="item.streaming" class="stream-preparing">
                {{ analysisStatus || '正在连接 AI…' }}
              </p>
              <i v-if="item.streaming && item.content" class="stream-cursor" aria-hidden="true"></i>
            </div>
            <p v-if="item.error" class="error-message" role="status">{{ item.error }}</p>
            <AnalysisFollowUp
              v-if="item.content && !item.streaming && !item.error"
              :thread="analysisThreadFor(item.id)"
              @ask="askAnalysisQuestion(item, $event)"
            />
          </article>
        </div>
      </aside>
    </section>

    <BilibiliSettingsDrawer
      v-model:open="settingsOpen"
      :settings="settings"
      @save="applySettings"
      @clear-cache="clearAnalysisCache"
    />
  </div>
</template>

<style scoped>
.bili-workbench {
  width: min(1440px, calc(100% - 32px));
  min-height: 100%;
  margin: 0 auto;
  padding: 22px 0 56px;
  color: var(--text-body);
}

.bili-workbench.has-result {
  padding-top: 12px;
}

.bili-workbench.has-result .app-header {
  margin-bottom: 10px;
}

button,
input,
textarea {
  font: inherit;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 3px solid rgba(var(--accent-rgb), 0.2);
  outline-offset: 2px;
}

.app-header {
  display: grid;
  grid-template-columns: 42px minmax(260px, 1fr) auto;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  padding: 4px 2px;
}

.back-button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
}

.back-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.app-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}

.app-mark {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 13px;
  background: linear-gradient(145deg, var(--accent), var(--accent-strong));
  color: var(--accent-contrast);
  box-shadow: var(--shadow-brand-md);
}

.app-identity h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-heading);
  letter-spacing: -0.025em;
}

.app-identity p {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
}

.workflow-status {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  padding: 5px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
  list-style: none;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-button {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
}

.settings-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.workflow-status li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border-radius: 8px;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.workflow-status b {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 6px;
  background: var(--bg-subtle);
  font-size: var(--font-size-caption);
}

.workflow-status li.active {
  background: var(--accent-bg);
  color: var(--accent);
}

.workflow-status li.active b {
  background: var(--accent);
  color: var(--accent-contrast);
}

.setup-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(330px, 0.75fr);
  align-items: start;
  gap: 14px;
  margin-bottom: 14px;
}

.setup-summary + .setup-grid {
  margin-top: 14px;
}

.setup-summary {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 7px 9px 7px 12px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-xs);
}

.setup-summary > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.setup-summary > div > span {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: var(--accent-bg);
  color: var(--accent);
}

.setup-summary p {
  display: grid;
  min-width: 0;
  gap: 1px;
  margin: 0;
}

.setup-summary strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-size-meta);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setup-summary small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.setup-summary > button {
  display: inline-flex;
  min-height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.setup-summary > button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.source-card,
.page-selection-card,
.transcript-panel,
.analysis-panel {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.source-card {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 14px;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.panel-heading > span {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--accent-bg);
  color: var(--accent);
}

.panel-heading h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
}

.panel-heading p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
}

.panel-heading.compact h2 {
  font-size: var(--font-size-body);
}

.source-field {
  display: grid;
  gap: 7px;
}

.source-field > span {
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  font-weight: 700;
}

.source-field input {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 11px;
  outline: 0;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--font-size-control);
}

.source-field input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.source-actions,
.selection-actions,
.analysis-actions,
.content-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.source-actions > span {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.primary-action {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: var(--accent-contrast);
  cursor: pointer;
  font-size: var(--font-size-small);
  font-weight: 750;
  box-shadow: var(--shadow-brand-sm);
}

.primary-action:disabled {
  opacity: 0.58;
  cursor: default;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-message {
  margin: 0;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: var(--font-size-meta);
  line-height: 1.55;
}

.error-message button {
  margin-left: 6px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-weight: 700;
  text-decoration: underline;
}

.source-progress {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
  border-radius: 10px;
  background: var(--bg-subtle);
}

.source-progress > span {
  color: var(--accent);
}

.source-progress > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.source-progress strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-size-meta);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-progress small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.source-progress > button {
  min-height: 30px;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 0 10px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent-bg);
  color: var(--accent);
  cursor: pointer;
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.page-selection-card {
  display: grid;
  gap: 15px;
  margin-bottom: 14px;
  padding: 18px 20px;
}

.page-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.page-options label {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 10px 11px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-subtle);
  cursor: pointer;
}

.page-options label.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.page-options input {
  position: absolute;
  opacity: 0;
}

.page-options label > span {
  display: grid;
  min-width: 32px;
  height: 25px;
  place-items: center;
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--accent);
  font-size: var(--font-size-caption);
  font-weight: 800;
}

.page-options strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-size-meta);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-options small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.content-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(380px, 0.94fr);
  align-items: start;
  gap: 14px;
}

.transcript-panel,
.analysis-panel {
  min-width: 0;
  padding: 18px;
}

.content-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.section-kicker {
  color: var(--accent);
  font-size: var(--font-size-caption);
  font-weight: 800;
  letter-spacing: 0.14em;
}

.content-header h2,
.analysis-heading h2 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: var(--font-size-title);
  line-height: 1.35;
}

.content-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.content-meta span {
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.content-meta small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.timestamp-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-caption);
}

.content-actions {
  margin: 14px 0 10px;
}

.content-actions button,
.analysis-actions button:not(.primary-action) {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.transcript-output,
.page-transcript textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  border: 1px solid var(--border-light);
  border-radius: 11px;
  outline: 0;
  background: color-mix(in srgb, var(--bg-subtle) 58%, var(--bg-card));
  color: var(--text-body);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-size-meta);
  line-height: 1.7;
}

.transcript-output {
  min-height: 520px;
  padding: 14px;
}

.multi-transcript-list {
  display: grid;
  gap: 10px;
}

.page-transcript {
  padding: 10px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
}

.page-transcript header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.page-transcript strong {
  color: var(--text-primary);
  font-size: var(--font-size-meta);
}

.page-transcript small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.page-transcript .page-error {
  color: var(--danger);
}

.page-transcript textarea {
  min-height: 180px;
  padding: 10px;
}

.analysis-panel {
  display: grid;
  gap: 8px;
}

.analysis-scroll {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 14px;
}

.analysis-heading {
  display: grid;
  grid-template-columns: 30px auto minmax(210px, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.analysis-heading > span:first-child {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  background: linear-gradient(145deg, var(--accent), var(--accent-strong));
  color: var(--accent-contrast);
}

.analysis-heading h2 {
  margin: 0;
  font-size: var(--font-size-body);
  white-space: nowrap;
}

.analysis-heading > b {
  padding: 4px 7px;
  border-radius: 7px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: var(--font-size-caption);
}

.analysis-config {
  display: grid;
  gap: 7px;
  padding: 7px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-subtle);
}

.analysis-toolbar {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto;
  align-items: center;
  gap: 6px;
}

.analysis-actions {
  flex-wrap: nowrap;
  gap: 5px;
}

.analysis-actions .primary-action {
  min-height: 32px;
  padding: 0 10px;
  box-shadow: none;
}

.analysis-actions .icon-action {
  width: 32px;
  padding: 0;
}

.analysis-models {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 8px;
}

.analysis-types {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  padding: 2px;
  border-radius: 8px;
  background: var(--bg-subtle);
}

.analysis-types button {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.analysis-types button span {
  display: grid;
  min-width: 17px;
  height: 17px;
  place-items: center;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.analysis-types button.active {
  background: var(--accent-bg);
  color: var(--accent);
}

.analysis-types button.active span {
  background: var(--accent);
  color: var(--accent-contrast);
}

.model-config-toggle {
  display: grid;
  min-width: 0;
  height: 32px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
}

.model-config-toggle > span {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.model-config-toggle strong {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-config-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.custom-prompt {
  box-sizing: border-box;
  width: 100%;
  min-height: 84px;
  resize: vertical;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  outline: 0;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--font-size-meta);
}

.cancel-action {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
}

.analysis-progress {
  height: 3px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--border-light);
}

.analysis-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  transition: width 0.2s ease;
}

.analysis-empty {
  display: grid;
  min-height: 170px;
  place-items: center;
  align-content: center;
  gap: 7px;
  border: 1px dashed var(--border);
  border-radius: 11px;
  color: var(--text-muted);
  text-align: center;
}

.analysis-empty strong {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}

.analysis-empty p {
  margin: 0;
  font-size: var(--font-size-caption);
}

.streaming-empty svg {
  color: var(--accent);
}

.streaming-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent) !important;
}

.stream-preparing {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-meta);
}

.stream-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  background: var(--accent);
  vertical-align: -0.12em;
  animation: stream-blink 0.8s steps(1) infinite;
}

@keyframes stream-blink {
  50% {
    opacity: 0;
  }
}

.analysis-result {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
}

.analysis-result > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.analysis-result > header > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.analysis-result > header strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-size-small);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analysis-result > header small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.analysis-result > header > span {
  flex: 0 0 auto;
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--success-bg);
  color: var(--success);
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.analysis-content {
  max-height: 520px;
  overflow-y: auto;
  padding: 12px 3px 2px;
}

@media (min-width: 961px) {
  .bili-workbench.has-result:not(.setup-expanded) {
    display: grid;
    height: 100%;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
    overflow: hidden;
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .has-result:not(.setup-expanded) .app-header {
    margin-bottom: 0;
  }

  .has-result:not(.setup-expanded) .content-workspace,
  .has-result:not(.setup-expanded) .transcript-panel,
  .has-result:not(.setup-expanded) .analysis-panel {
    height: 100%;
    min-height: 0;
  }

  .has-result:not(.setup-expanded) .content-workspace {
    align-items: stretch;
  }

  .has-result:not(.setup-expanded) .transcript-panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .has-result:not(.setup-expanded) .analysis-panel {
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .has-result:not(.setup-expanded) .transcript-output {
    height: 100%;
    min-height: 0;
    resize: none;
  }

  .has-result:not(.setup-expanded) .multi-transcript-list,
  .has-result:not(.setup-expanded) .analysis-scroll {
    min-height: 0;
    overflow-y: auto;
  }

  .has-result:not(.setup-expanded) .analysis-content {
    max-height: none;
    overflow: visible;
  }

  .has-result:not(.setup-expanded) .analysis-empty {
    min-height: 100%;
  }

  .has-result:not(.setup-expanded) .analysis-scroll :deep(.follow-up-thread) {
    max-height: none;
    overflow: visible;
  }
}

@media (max-width: 960px) {
  .content-workspace {
    grid-template-columns: 1fr;
  }

  .transcript-output {
    min-height: 380px;
  }
}

@media (max-width: 820px) {
  .bili-workbench {
    width: min(100% - 20px, 720px);
    padding-top: 12px;
  }

  .app-header {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .header-controls {
    grid-column: 1 / -1;
    justify-content: center;
  }

  .setup-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .app-identity p,
  .workflow-status span {
    display: none;
  }

  .workflow-status {
    justify-content: stretch;
  }

  .workflow-status li {
    flex: 1;
    justify-content: center;
  }

  .content-header,
  .page-transcript header {
    align-items: stretch;
    flex-direction: column;
  }

  .timestamp-toggle {
    align-self: flex-start;
  }

  .analysis-models {
    grid-template-columns: 1fr;
  }

  .analysis-heading {
    grid-template-columns: 30px minmax(0, 1fr) auto;
  }

  .analysis-heading .analysis-types {
    grid-column: 1 / -1;
  }

  .analysis-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
