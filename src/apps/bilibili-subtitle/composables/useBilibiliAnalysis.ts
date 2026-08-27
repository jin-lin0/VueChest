import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/request'
import { getStorage, setStorage } from '@/lib/storage'
import { copyToClipboard, downloadFile } from '@/utils'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { fetchProviders, resolveModelSelection, type ProviderMeta } from '@/apps/ai-chat/config'
import type {
  AnalysisCacheEntry,
  AnalysisItem,
  AnalysisResponse,
  AnalysisType,
  ExtractResult,
} from '../types'

export function useBilibiliAnalysis(result: Ref<ExtractResult | null>, onCopied: () => void) {
  const router = useRouter()
  const providers = ref<ProviderMeta[]>([])
  const analysisProvider = ref(getStorage<string>(STORAGE_KEYS.AI_CHAT_PROVIDER, '') || '')
  const analysisModel = ref('')
  const analysisType = ref<AnalysisType>('overview')
  const customPrompt = ref('')
  const analyzing = ref(false)
  const analysisError = ref('')
  const analysisDone = ref(0)
  const analysisTotal = ref(0)
  const analysisResults = ref<AnalysisItem[]>([])
  let analysisController: AbortController | null = null

  const currentAnalysisProvider = computed(
    () => providers.value.find((provider) => provider.id === analysisProvider.value) || null,
  )
  const analysisProviderOptions = computed(() =>
    providers.value.map((provider) => ({ value: provider.id, label: provider.name })),
  )
  const analysisModelOptions = computed(() =>
    (currentAnalysisProvider.value?.models || []).map((model, index) => ({
      value: model.id,
      label: `${index === 0 && analysisProvider.value === 'openrouter' ? '推荐 · ' : ''}${model.name}`,
    })),
  )

  watch(analysisModel, (model) => {
    if (analysisProvider.value && model) {
      setStorage(`${STORAGE_KEYS.AI_CHAT_MODEL_PREFIX}${analysisProvider.value}`, model)
    }
  })
  watch(analysisType, () => {
    analysisResults.value = []
    analysisError.value = ''
  })

  function resetAnalysis() {
    analysisController?.abort()
    analysisResults.value = []
    analysisError.value = ''
    analysisDone.value = 0
    analysisTotal.value = 0
  }

  function selectAnalysisProvider(raw?: string | number) {
    const id = String(raw ?? analysisProvider.value)
    const provider = providers.value.find((item) => item.id === id)
    if (!provider) return
    analysisProvider.value = id
    setStorage(STORAGE_KEYS.AI_CHAT_PROVIDER, id)
    analysisModel.value = resolveModelSelection(
      provider,
      getStorage<string>(`${STORAGE_KEYS.AI_CHAT_MODEL_PREFIX}${id}`, ''),
    )
  }

  function analysisSources() {
    const extracted = result.value
    if (!extracted) return []
    if (!extracted.all) {
      return [
        {
          id: `${extracted.bvid}:${extracted.page || 1}`,
          title: extracted.part
            ? `${extracted.title} · P${extracted.page} ${extracted.part}`
            : extracted.title,
          text: extracted.timed || extracted.text || '',
        },
      ]
    }
    return extracted.pages
      .filter((page) => !page.error && (page.timed || page.text))
      .map((page) => ({
        id: `${extracted.bvid}:${page.cid}`,
        title: `${extracted.title} · P${page.page} ${page.part}`,
        text: page.timed || page.text || '',
      }))
  }

  async function digestText(text: string) {
    if (crypto?.subtle) {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      )
    }
    let hash = 2166136261
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16)
  }

  function getAnalysisCache() {
    return (
      getStorage<Record<string, AnalysisCacheEntry>>(STORAGE_KEYS.BILI_ANALYSIS_CACHE, {}) || {}
    )
  }

  function saveAnalysisCache(key: string, value: AnalysisCacheEntry) {
    const cache = getAnalysisCache()
    cache[key] = value
    const recent = Object.entries(cache)
      .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      .slice(0, 30)
    setStorage(STORAGE_KEYS.BILI_ANALYSIS_CACHE, Object.fromEntries(recent))
  }

  async function analyzeSource(source: { id: string; title: string; text: string }) {
    const prompt = analysisType.value === 'custom' ? customPrompt.value.trim() : ''
    const digest = await digestText(`${analysisType.value}\n${prompt}\n${source.text}`)
    const cacheKey = `${source.id}:${digest}`
    const cached = getAnalysisCache()[cacheKey]
    if (cached) return { id: source.id, ...cached, cached: true }

    const response = await api.post<{ data: AnalysisResponse }>(
      '/api/bilibili/analyze',
      {
        title: source.title,
        bvid: result.value?.bvid,
        text: source.text,
        provider: analysisProvider.value,
        model: analysisModel.value,
        type: analysisType.value,
        prompt,
      },
      { signal: analysisController?.signal },
    )
    const entry: AnalysisCacheEntry = {
      ...response.data,
      title: source.title,
      cachedAt: Date.now(),
    }
    saveAnalysisCache(cacheKey, entry)
    return { id: source.id, ...entry, cached: false }
  }

  async function runAnalysis() {
    const sources = analysisSources()
    if (!sources.length || !analysisProvider.value || !analysisModel.value) {
      analysisError.value = '请先获取字幕并选择可用模型'
      return
    }
    if (analysisType.value === 'custom' && !customPrompt.value.trim()) {
      analysisError.value = '请输入自定义分析要求'
      return
    }

    analysisController?.abort()
    analysisController = new AbortController()
    analyzing.value = true
    analysisError.value = ''
    analysisDone.value = 0
    analysisTotal.value = sources.length
    const completed: Array<AnalysisItem | undefined> = new Array(sources.length)
    analysisResults.value = []
    let cursor = 0
    async function worker() {
      while (cursor < sources.length && !analysisController?.signal.aborted) {
        const index = cursor++
        completed[index] = await analyzeSource(sources[index])
        analysisDone.value += 1
        analysisResults.value = completed.filter((item): item is AnalysisItem => Boolean(item))
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(2, sources.length) }, worker))
      const actualModel = analysisResults.value.at(-1)?.model
      if (
        actualModel &&
        currentAnalysisProvider.value?.models.some((item) => item.id === actualModel)
      ) {
        analysisModel.value = actualModel
      }
    } catch (reason) {
      if ((reason as { name?: string })?.name !== 'AbortError') {
        analysisError.value = reason instanceof Error ? reason.message : '字幕分析失败'
      }
    } finally {
      analyzing.value = false
      analysisController = null
    }
  }

  function cancelAnalysis() {
    analysisController?.abort()
  }

  const combinedAnalysisMarkdown = computed(() =>
    analysisResults.value.map((item) => item.content).join('\n\n---\n\n'),
  )

  function copyAnalysis() {
    if (combinedAnalysisMarkdown.value) copyToClipboard(combinedAnalysisMarkdown.value, onCopied)
  }

  function exportAnalysisMarkdown() {
    if (!result.value || !combinedAnalysisMarkdown.value) return
    downloadFile(
      `${result.value.bvid}-AI分析.md`,
      combinedAnalysisMarkdown.value,
      'text/markdown;charset=utf-8',
    )
  }

  function exportAnalysisJson() {
    if (!result.value || !analysisResults.value.length) return
    downloadFile(
      `${result.value.bvid}-AI分析.json`,
      JSON.stringify(analysisResults.value, null, 2),
      'application/json;charset=utf-8',
    )
  }

  function continueInChat(item: AnalysisItem) {
    setStorage(STORAGE_KEYS.AI_CHAT_DRAFT, {
      text: `请基于下面的视频分析继续回答我的问题。\n\n${item.content}\n\n我的问题：`,
    })
    router.push('/ai-chat')
  }

  onMounted(async () => {
    try {
      providers.value = await fetchProviders()
      if (!providers.value.length) return
      if (!providers.value.some((item) => item.id === analysisProvider.value)) {
        analysisProvider.value = providers.value[0].id
      }
      selectAnalysisProvider(analysisProvider.value)
    } catch {
      analysisError.value = 'AI 模型列表加载失败，字幕提取仍可正常使用'
    }
  })
  onUnmounted(() => analysisController?.abort())

  return {
    analysisProvider,
    analysisModel,
    analysisType,
    customPrompt,
    analyzing,
    analysisError,
    analysisDone,
    analysisTotal,
    analysisResults,
    analysisProviderOptions,
    analysisModelOptions,
    selectAnalysisProvider,
    runAnalysis,
    cancelAnalysis,
    copyAnalysis,
    exportAnalysisMarkdown,
    exportAnalysisJson,
    continueInChat,
    resetAnalysis,
  }
}
