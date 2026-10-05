import { beforeEach, describe, expect, it, vi } from 'vitest'

// 缓存直接落到 localStorage，测试里换成内存实现，免得污染真实浏览器存储。
const store = new Map<string, string>()

vi.mock('@/lib/storage', () => ({
  getStorage: <T>(key: string, defaultValue?: T): T | null => {
    const raw = store.get(key)
    if (raw == null) return defaultValue ?? null
    try {
      return JSON.parse(raw) as T
    } catch {
      return defaultValue ?? null
    }
  },
  setStorage: (key: string, value: unknown): void => {
    store.set(key, JSON.stringify(value))
  },
  removeStorage: (key: string): void => {
    store.delete(key)
  },
}))

import { clearCatalogCache, readCatalogCache, writeCatalogCache } from '../westock-catalog-cache'
import { groupCatalog, parseCatalog } from '../westock-discover'

const KEY = 'stock-discover-catalog-cache'

/** 造一份五个目录齐全的缓存。 */
function fullCatalog() {
  return {
    strategy: groupCatalog(parseCatalog('# 基本面\n  big_cap  行业高增长', 'strategy')),
    ranking: groupCatalog(parseCatalog('  【评分】\n    CompScore  综合评分', 'ranking')),
    label: groupCatalog(parseCatalog('# 股东属性\n  shareholder_private  民企公司', 'label')),
    event: groupCatalog(parseCatalog('# 分红\n  dividend_plan  分红预案', 'event')),
    filter: groupCatalog(parseCatalog('  LowPE', 'filter')),
  }
}

describe('选股目录缓存', () => {
  beforeEach(() => {
    store.clear()
  })

  it('写入后能读回，结构不变', () => {
    const groups = fullCatalog()
    writeCatalogCache(groups)
    const read = readCatalogCache()
    expect(read).not.toBeNull()
    expect(read!.strategy[0].items[0].id).toBe('big_cap')
    expect(read!.ranking[0].group).toBe('评分')
    expect(read!.filter[0].items[0].id).toBe('LowPE')
  })

  it('无缓存时返回 null，交给调用方走网络', () => {
    expect(readCatalogCache()).toBeNull()
  })

  // 半套目录进缓存会让下次命中的人以为某分类没有可选项，必须视为无缓存
  it('目录不全时视为无缓存', () => {
    const groups = fullCatalog()
    delete (groups as Record<string, unknown>).label
    writeCatalogCache(groups as never)
    expect(readCatalogCache()).toBeNull()
  })

  it('版本号不匹配时作废（CLI 升级新增策略后需要能刷新）', () => {
    const groups = fullCatalog()
    writeCatalogCache(groups)
    const raw = JSON.parse(store.get(KEY)!)
    store.set(KEY, JSON.stringify({ ...raw, version: raw.version + 1 }))
    expect(readCatalogCache()).toBeNull()
  })

  it('时间戳异常时视为过期', () => {
    writeCatalogCache(fullCatalog())
    const raw = JSON.parse(store.get(KEY)!)
    store.set(KEY, JSON.stringify({ ...raw, savedAt: Number.NaN }))
    expect(readCatalogCache()).toBeNull()
  })

  it('损坏的 JSON 不抛错，按无缓存处理', () => {
    store.set(KEY, '{ 这不是 json')
    expect(readCatalogCache()).toBeNull()
  })

  it('clearCatalogCache 后读不到', () => {
    writeCatalogCache(fullCatalog())
    clearCatalogCache()
    expect(readCatalogCache()).toBeNull()
  })
})
