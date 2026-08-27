export interface PageInfo {
  cid: number
  page: number
  part: string
  duration: number
}

export interface VideoInfo {
  bvid: string
  title: string
  pages: PageInfo[]
}

export interface SingleResult {
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

export interface PageSub extends PageInfo {
  lan?: string
  lanDoc?: string
  text?: string
  timed?: string
  count?: number
  error?: string
}

export interface AllResult {
  title: string
  bvid: string
  all: true
  pages: PageSub[]
}

export type ExtractResult = SingleResult | AllResult
export type AnalysisType = 'overview' | 'translate' | 'custom'

export interface AnalysisResponse {
  content: string
  structured: unknown
  model: string
  chunkCount: number
}

export interface AnalysisItem extends AnalysisResponse {
  id: string
  title: string
  cached?: boolean
}

export interface AnalysisCacheEntry extends AnalysisResponse {
  title: string
  cachedAt: number
}
