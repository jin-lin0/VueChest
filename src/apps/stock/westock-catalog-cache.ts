// 选股目录缓存。
//
// 背景：目录（strategy/label/event/ranking/filter 的 --list 输出）内容是静态的，
// 但面板每次挂载都会串行 spawn 5 个 CLI 子进程去取，切一次 tab 就要等好几秒。
// 目录在一次会话里几乎不变，缓存到 localStorage 后第二次进入是瞬时的。
//
// 失效策略用「版本号」而不是纯 TTL：CLI 升级可能新增/改名策略，
// 纯时间过期会让用户最长 TTL 内一直看不到新选项；版本号由代码里的
// CATALOG_CACHE_VERSION 显式递增，改一次就全量重取。
// TTL 只作为兜底，防止长期不刷新导致体积膨胀或数据陈旧。

import { getStorage, removeStorage, setStorage } from '@/lib/storage'
import { CATALOG_SPECS, type CatalogGroup } from './westock-discover'

const STORAGE_KEY = 'stock-discover-catalog-cache'

/** 缓存结构变更（如新增字段、改变 items 形态）时 +1，旧缓存自动作废。 */
const CATALOG_CACHE_VERSION = 1
/** 兜底过期时间：24 小时后即使版本没变也重新取一次。 */
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000

interface CatalogCache {
  version: number
  savedAt: number
  groups: Record<string, CatalogGroup[]>
}

function isFresh(cache: CatalogCache | null): cache is CatalogCache {
  if (!cache) return false
  if (cache.version !== CATALOG_CACHE_VERSION) return false
  if (!Number.isFinite(cache.savedAt)) return false
  return Date.now() - cache.savedAt < CATALOG_TTL_MS
}

/**
 * 读缓存。命中返回分组结构，未命中/过期/结构不对一律返回 null，
 * 由调用方走网络加载 —— 这里不返回部分结果，避免拿到半套目录。
 */
export function readCatalogCache(): Record<string, CatalogGroup[]> | null {
  const raw = getStorage<CatalogCache>(STORAGE_KEY)
  if (!isFresh(raw)) return null
  // 五个目录都齐才算完整；缺一个就当作没有缓存
  if (!CATALOG_SPECS.every((spec) => Array.isArray(raw.groups?.[spec.key]))) return null
  return raw.groups
}

export function writeCatalogCache(groups: Record<string, CatalogGroup[]>): void {
  setStorage(STORAGE_KEY, { version: CATALOG_CACHE_VERSION, savedAt: Date.now(), groups })
}

/** 手动刷新用：清掉缓存后由调用方重新加载。 */
export function clearCatalogCache(): void {
  removeStorage(STORAGE_KEY)
}
