import { describe, expect, it } from 'vitest'
import { DEFAULT_BILIBILI_SUBTITLE_SETTINGS, normalizeBilibiliSubtitleSettings } from '../settings'

describe('B站字幕工作台设置', () => {
  it('uses safe defaults for missing settings', () => {
    expect(normalizeBilibiliSubtitleSettings(null)).toEqual(DEFAULT_BILIBILI_SUBTITLE_SETTINGS)
  })

  it('keeps valid choices and repairs malformed fields', () => {
    expect(
      normalizeBilibiliSubtitleSettings({
        autoExtractAfterParse: false,
        defaultPageMode: 'all',
        autoAnalyzeOverview: true,
        useAnalysisCache: 'yes',
      }),
    ).toMatchObject({
      autoExtractAfterParse: false,
      defaultPageMode: 'all',
      autoAnalyzeOverview: true,
      useAnalysisCache: true,
    })
  })
})
