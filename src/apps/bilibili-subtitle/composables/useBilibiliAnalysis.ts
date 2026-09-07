import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { getStorage, setStorage } from '@/lib/storage'
import { copyToClipboard } from '@/utils/clipboard'
import { downloadFile } from '@/utils/common'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { fetchProviders, resolveModelSelection, type ProviderMeta } from '@/apps/ai-chat/config'
import { streamBilibiliRequest } from '../stream'
import type {
  AnalysisCacheEntry,
  AnalysisItem,
  AnalysisQuestionMessage,
  AnalysisQuestionResponse,
  AnalysisQuestionThread,
  AnalysisResponse,
  AnalysisType,
  ExtractResult,
} from '../types'

const ANALYSIS_CACHE_VERSION = 'v3'
const ANALYSIS_TYPES: AnalysisType[] = ['overview', 'translate', 'custom']

function createTypeRecord<T>(factory: () => T): Record<AnalysisType, T> {
  return Object.fromEntries(ANALYSIS_TYPES.map((type) => [type, factory()])) as Record<
    AnalysisType,
    T
  >
}

export function useBilibiliAnalysis(
  result: Ref<ExtractResult | null>,
  onCopied: () => void,
  useCache: Ref<boolean>,
) {
  const providers = ref<ProviderMeta[]>([])
  const analysisProvider = ref(getStorage<string>(STORAGE_KEYS.AI_CHAT_PROVIDER, '') || '')
  const analysisModel = ref('')
  const analysisType = ref<AnalysisType>('overview')
  const customPrompt = ref('')
  const activeAnalysisType = ref<AnalysisType | null>(null)
  const analysisResultsByType = ref(createTypeRecord<AnalysisItem[]>(() => []))
  const analysisThreadsByType = ref(
    createTypeRecord<Record<string, AnalysisQuestionThread>>(() => ({})),
  )
  const analysisErrorsByType = ref(createTypeRecord(() => ''))
  const analysisProgressByType = ref(createTypeRecord(() => ({ done: 0, total: 0 })))
  const analysisStatusByType = ref(createTypeRecord(() => ''))
  let analysisController: AbortController | null = null
  const questionControllers = new Map<string, AbortController>()
  let previousInputs = createTypeRecord<null | {
    provider: string
    model: string
    prompt: string
    sources: Array<{ id: string; text: string }>
  }>(() => null)

  const analyzing = computed(() => activeAnalysisType.value === analysisType.value)
  const analysisError = computed({
    get: () => analysisErrorsByType.value[analysisType.value],
    set: (value: string) => {
      analysisErrorsByType.value[analysisType.value] = value
    },
  })
  const analysisDone = computed(() => analysisProgressByType.value[analysisType.value].done)
  const analysisTotal = computed(() => analysisProgressByType.value[analysisType.value].total)
  const analysisStatus = computed(() => analysisStatusByType.value[analysisType.value])
  const analysisResults = computed(() => analysisResultsByType.value[analysisType.value])
  const analysisThreads = computed(() => analysisThreadsByType.value[analysisType.value])
  const analysisResultCounts = computed(
    () =>
      Object.fromEntries(
        ANALYSIS_TYPES.map((type) => [type, analysisResultsByType.value[type].length]),
      ) as Record<AnalysisType, number>,
  )

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
  function resetAnalysis() {
    analysisController?.abort()
    analysisController = null
    questionControllers.forEach((controller) => controller.abort())
    questionControllers.clear()
    activeAnalysisType.value = null
    previousInputs = createTypeRecord(() => null)
    analysisResultsByType.value = createTypeRecord<AnalysisItem[]>(() => [])
    analysisThreadsByType.value = createTypeRecord<Record<string, AnalysisQuestionThread>>(
      () => ({}),
    )
    analysisErrorsByType.value = createTypeRecord(() => '')
    analysisProgressByType.value = createTypeRecord(() => ({ done: 0, total: 0 }))
    analysisStatusByType.value = createTypeRecord(() => '')
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

  async function analyzeSource(
    source: { id: string; title: string; text: string },
    options: {
      type: AnalysisType
      prompt: string
      provider: string
      model: string
      useCache: boolean
      bvid?: string
      signal: AbortSignal
    },
    callbacks: {
      onStart: () => void
      onDelta: (content: string) => void
      onProgress: (label: string) => void
    },
  ) {
    const digest = await digestText(
      `${ANALYSIS_CACHE_VERSION}\n${options.provider}\n${options.model}\n${options.type}\n${options.prompt}\n${source.text}`,
    )
    options.signal.throwIfAborted()
    const cacheKey = `${source.id}:${digest}`
    const cached = options.useCache ? getAnalysisCache()[cacheKey] : undefined
    if (cached) return { id: source.id, ...cached, cached: true }

    callbacks.onStart()
    let streamedContent = ''
    const response = await streamBilibiliRequest<AnalysisResponse>(
      '/api/bilibili/analyze/stream',
      {
        title: source.title,
        bvid: options.bvid,
        text: source.text,
        provider: options.provider,
        model: options.model,
        type: options.type,
        prompt: options.prompt,
      },
      {
        onDelta: (delta) => {
          streamedContent += delta
          callbacks.onDelta(streamedContent)
        },
        onProgress: (progress) => callbacks.onProgress(progress.label),
      },
      options.signal,
    )
    options.signal.throwIfAborted()
    const entry: AnalysisCacheEntry = {
      ...response,
      title: source.title,
      cachedAt: Date.now(),
    }
    saveAnalysisCache(cacheKey, entry)
    return { id: source.id, ...entry, cached: false }
  }

  async function runAnalysis(retryFailed = false) {
    const type = analysisType.value
    const sources = analysisSources()
    if (!sources.length || !analysisProvider.value || !analysisModel.value) {
      analysisError.value = '请先获取字幕并选择可用模型'
      return
    }
    if (type === 'custom' && !customPrompt.value.trim()) {
      analysisError.value = '请输入自定义分析要求'
      return
    }

    const input = {
      provider: analysisProvider.value,
      model: analysisModel.value,
      prompt: type === 'custom' ? customPrompt.value.trim() : '',
      sources: sources.map(({ id, text }) => ({ id, text })),
    }
    const previousInput = previousInputs[type]
    if (
      retryFailed &&
      previousInput &&
      (input.provider !== previousInput.provider ||
        input.model !== previousInput.model ||
        input.prompt !== previousInput.prompt ||
        input.sources.length !== previousInput.sources.length ||
        input.sources.some(
          (source, index) =>
            source.id !== previousInput.sources[index].id ||
            source.text !== previousInput.sources[index].text,
        ))
    ) {
      analysisError.value = '字幕或分析条件已变化，请点击重新分析以生成一致的结果'
      return
    }
    previousInputs[type] = input
    cancelAnalysis()
    const controller = new AbortController()
    analysisController = controller
    const isCurrent = () => analysisController === controller && !controller.signal.aborted
    const previous = retryFailed ? analysisResultsByType.value[type] : []
    const completed: Array<AnalysisItem | undefined> = sources.map((source) =>
      previous.find(
        (item) => item.id === source.id && !item.error && !item.streaming && item.content,
      ),
    )
    if (!retryFailed) {
      for (const [key, pending] of questionControllers) {
        if (key.startsWith(`${type}:`)) {
          pending.abort()
          questionControllers.delete(key)
        }
      }
      analysisThreadsByType.value[type] = {}
    }
    activeAnalysisType.value = type
    analysisErrorsByType.value[type] = ''
    analysisStatusByType.value[type] = '正在准备字幕上下文…'
    analysisProgressByType.value[type] = {
      done: completed.filter(Boolean).length,
      total: sources.length,
    }
    const options = {
      type,
      prompt: type === 'custom' ? customPrompt.value.trim() : '',
      provider: analysisProvider.value,
      model: analysisModel.value,
      useCache: useCache.value,
      bvid: result.value?.bvid,
      signal: controller.signal,
    }
    const publish = () => {
      if (isCurrent())
        analysisResultsByType.value[type] = completed.filter((item): item is AnalysisItem =>
          Boolean(item),
        )
    }
    publish()
    let cursor = 0
    async function worker() {
      while (cursor < sources.length && isCurrent()) {
        const index = cursor++
        if (completed[index]) continue
        const placeholder: AnalysisItem = {
          id: sources[index].id,
          title: sources[index].title,
          content: '',
          structured: null,
          model: options.model,
          chunkCount: 0,
          streaming: true,
        }
        let latestContent = ''
        let contentTimer: ReturnType<typeof setTimeout> | null = null
        const flushContent = () => {
          contentTimer = null
          if (!isCurrent()) return
          completed[index] = { ...placeholder, content: latestContent }
          publish()
        }
        try {
          const analyzed = await analyzeSource(sources[index], options, {
            onStart: () => {
              if (isCurrent()) {
                completed[index] = placeholder
                publish()
              }
            },
            onDelta: (content) => {
              if (!isCurrent()) return
              latestContent = content
              if (contentTimer === null) contentTimer = setTimeout(flushContent, 32)
            },
            onProgress: (label) => {
              if (isCurrent()) analysisStatusByType.value[type] = label
            },
          })
          if (!isCurrent()) return
          completed[index] = analyzed
        } catch (error) {
          if (!isCurrent()) return
          completed[index] = {
            ...placeholder,
            content: latestContent,
            streaming: false,
            error: error instanceof Error ? error.message : '字幕分析失败',
          }
        } finally {
          if (contentTimer !== null) clearTimeout(contentTimer)
        }
        if (isCurrent()) {
          analysisProgressByType.value[type].done += 1
          publish()
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(2, sources.length) }, worker))
      if (!isCurrent()) return
      const failed = completed.filter((item) => item?.error).length
      if (failed)
        analysisErrorsByType.value[type] =
          `${failed} 个分 P 分析失败，已保留其他结果，可仅重试失败项`
      const actualModel = [...completed].reverse().find((item) => item && !item.error)?.model
      if (
        actualModel &&
        analysisProvider.value === options.provider &&
        currentAnalysisProvider.value?.models.some((item) => item.id === actualModel)
      ) {
        analysisModel.value = actualModel
        if (previousInputs[type]) previousInputs[type]!.model = actualModel
      }
    } finally {
      if (analysisController === controller) {
        activeAnalysisType.value = null
        analysisController = null
        analysisStatusByType.value[type] = ''
      }
    }
  }

  function cancelAnalysis() {
    if (!analysisController) return
    analysisController.abort()
    analysisController = null
    const type = activeAnalysisType.value
    if (type) {
      analysisResultsByType.value[type] = analysisResultsByType.value[type].map((item) =>
        item.streaming ? { ...item, streaming: false, error: '已取消，可重试' } : item,
      )
      analysisErrorsByType.value[type] = '分析已取消，已保留完成的结果'
      analysisStatusByType.value[type] = ''
    }
    activeAnalysisType.value = null
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

  function analysisThreadFor(id: string): AnalysisQuestionThread {
    const threads = analysisThreadsByType.value[analysisType.value]
    if (!threads[id]) {
      threads[id] = { messages: [], asking: false, error: '' }
    }
    return threads[id]
  }

  async function askAnalysisQuestion(item: AnalysisItem, rawQuestion: string) {
    const type = analysisType.value
    const question = rawQuestion.trim()
    const source = analysisSources().find((candidate) => candidate.id === item.id)
    const threads = analysisThreadsByType.value[type]
    const thread =
      threads[item.id] || (threads[item.id] = { messages: [], asking: false, error: '' })
    if (thread.asking) return
    if (!question) {
      thread.error = '请输入要追问的问题'
      return
    }
    if (!source || !analysisProvider.value || !analysisModel.value) {
      thread.error = '字幕上下文或模型不可用，请重新分析后再试'
      return
    }

    const controllerKey = `${type}:${item.id}`
    questionControllers.get(controllerKey)?.abort()
    const controller = new AbortController()
    questionControllers.set(controllerKey, controller)
    const isCurrent = () =>
      questionControllers.get(controllerKey) === controller && !controller.signal.aborted
    const requestProvider = analysisProvider.value
    const previousMessages = [...thread.messages]
    const history = thread.messages.map(({ role, content }) => ({ role, content }))
    thread.messages.push({ id: crypto.randomUUID(), role: 'user', content: question })
    const assistantId = crypto.randomUUID()
    let assistantMessage: AnalysisQuestionMessage = {
      id: assistantId,
      role: 'assistant' as const,
      content: '',
      streaming: true,
    }
    thread.messages.push(assistantMessage)
    thread.asking = true
    thread.error = ''
    let streamedContent = ''
    let contentTimer: ReturnType<typeof setTimeout> | null = null
    const updateAssistant = (content: string, streaming: boolean) => {
      if (!isCurrent()) return
      const messageIndex = thread.messages.findIndex((message) => message.id === assistantId)
      if (messageIndex < 0) return
      assistantMessage = { ...thread.messages[messageIndex], content, streaming }
      thread.messages[messageIndex] = assistantMessage
    }
    const flushContent = () => {
      contentTimer = null
      updateAssistant(streamedContent, true)
    }
    try {
      const response = await streamBilibiliRequest<AnalysisQuestionResponse>(
        '/api/bilibili/ask/stream',
        {
          title: source.title,
          bvid: result.value?.bvid,
          text: source.text,
          analysis: item.content,
          question,
          history,
          provider: analysisProvider.value,
          model: analysisModel.value,
        },
        {
          onDelta: (delta) => {
            streamedContent += delta
            if (contentTimer === null) contentTimer = setTimeout(flushContent, 32)
          },
        },
        controller.signal,
      )
      if (contentTimer !== null) clearTimeout(contentTimer)
      if (!isCurrent()) return
      updateAssistant(response.content, false)
      if (
        response.model &&
        analysisProvider.value === requestProvider &&
        currentAnalysisProvider.value?.models.some((model) => model.id === response.model)
      ) {
        analysisModel.value = response.model
      }
    } catch (reason) {
      if (contentTimer !== null) clearTimeout(contentTimer)
      if (!isCurrent()) return
      updateAssistant(streamedContent, false)
      if (!streamedContent) {
        thread.messages = previousMessages
      }
      if ((reason as { name?: string })?.name !== 'AbortError') {
        thread.error = reason instanceof Error ? reason.message : '追问失败，请稍后重试'
      }
    } finally {
      if (questionControllers.get(controllerKey) === controller) {
        questionControllers.delete(controllerKey)
        thread.asking = false
      }
    }
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
  onUnmounted(resetAnalysis)

  return {
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
    analysisThreads,
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
  }
}
