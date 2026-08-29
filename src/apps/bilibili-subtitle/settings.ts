import { STORAGE_KEYS } from '@/config/storage-keys'
import { getStorage, setStorage } from '@/lib/storage'

export type DefaultPageMode = 'first' | 'all'

export interface BilibiliSubtitleSettings {
  autoExtractAfterParse: boolean
  defaultPageMode: DefaultPageMode
  collapseSetupAfterExtract: boolean
  autoAnalyzeOverview: boolean
  collapseAnalysisConfigAfterStart: boolean
  showTimestampsByDefault: boolean
  useAnalysisCache: boolean
}

export const DEFAULT_BILIBILI_SUBTITLE_SETTINGS: BilibiliSubtitleSettings = {
  autoExtractAfterParse: true,
  defaultPageMode: 'first',
  collapseSetupAfterExtract: true,
  autoAnalyzeOverview: false,
  collapseAnalysisConfigAfterStart: true,
  showTimestampsByDefault: false,
  useAnalysisCache: true,
}

export function normalizeBilibiliSubtitleSettings(value: unknown): BilibiliSubtitleSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    autoExtractAfterParse:
      typeof raw.autoExtractAfterParse === 'boolean'
        ? raw.autoExtractAfterParse
        : DEFAULT_BILIBILI_SUBTITLE_SETTINGS.autoExtractAfterParse,
    defaultPageMode:
      raw.defaultPageMode === 'all' || raw.defaultPageMode === 'first'
        ? raw.defaultPageMode
        : DEFAULT_BILIBILI_SUBTITLE_SETTINGS.defaultPageMode,
    collapseSetupAfterExtract:
      typeof raw.collapseSetupAfterExtract === 'boolean'
        ? raw.collapseSetupAfterExtract
        : DEFAULT_BILIBILI_SUBTITLE_SETTINGS.collapseSetupAfterExtract,
    autoAnalyzeOverview:
      typeof raw.autoAnalyzeOverview === 'boolean'
        ? raw.autoAnalyzeOverview
        : DEFAULT_BILIBILI_SUBTITLE_SETTINGS.autoAnalyzeOverview,
    collapseAnalysisConfigAfterStart:
      typeof raw.collapseAnalysisConfigAfterStart === 'boolean'
        ? raw.collapseAnalysisConfigAfterStart
        : DEFAULT_BILIBILI_SUBTITLE_SETTINGS.collapseAnalysisConfigAfterStart,
    showTimestampsByDefault:
      typeof raw.showTimestampsByDefault === 'boolean'
        ? raw.showTimestampsByDefault
        : DEFAULT_BILIBILI_SUBTITLE_SETTINGS.showTimestampsByDefault,
    useAnalysisCache:
      typeof raw.useAnalysisCache === 'boolean'
        ? raw.useAnalysisCache
        : DEFAULT_BILIBILI_SUBTITLE_SETTINGS.useAnalysisCache,
  }
}

export function loadBilibiliSubtitleSettings(): BilibiliSubtitleSettings {
  return normalizeBilibiliSubtitleSettings(
    getStorage(STORAGE_KEYS.BILI_SUBTITLE_SETTINGS, DEFAULT_BILIBILI_SUBTITLE_SETTINGS),
  )
}

export function saveBilibiliSubtitleSettings(settings: BilibiliSubtitleSettings): void {
  setStorage(STORAGE_KEYS.BILI_SUBTITLE_SETTINGS, normalizeBilibiliSubtitleSettings(settings))
}
