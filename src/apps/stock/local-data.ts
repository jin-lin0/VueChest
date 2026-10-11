import { ref } from 'vue'
import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config'
import {
  instrumentKey,
  isStockReference,
  resolveInstrument,
  type FavoriteStock,
  type PriceAlert,
  type InstrumentInput,
} from './model'
import type { StockPosition } from './portfolio'

function readRecords<T extends FavoriteStock>(key: string): T[] {
  const records = getStorage<T[]>(key, [])
  return Array.isArray(records) ? records.filter(isStockReference) : []
}

export function useStockLocalData(onChange: () => void) {
  const favorites = ref(readRecords<FavoriteStock>(STORAGE_KEYS.STOCK_FAVORITES))
  const recentStocks = ref(readRecords<FavoriteStock>(STORAGE_KEYS.STOCK_RECENT))
  const positions = ref(readRecords<StockPosition>(STORAGE_KEYS.STOCK_POSITIONS))
  const alerts = ref(readRecords<PriceAlert>(STORAGE_KEYS.STOCK_ALERTS))
  const notes = ref(getStorage<Record<string, string>>(STORAGE_KEYS.STOCK_NOTES, {}) || {})
  const isFavorite = (input: InstrumentInput) =>
    favorites.value.some((item) => instrumentKey(item) === instrumentKey(input))
  function addFavorite(input: InstrumentInput, name: string) {
    const meta = resolveInstrument(input)
    if (isFavorite(meta)) return
    favorites.value = [...favorites.value, { ...meta, name }]
    setStorage(STORAGE_KEYS.STOCK_FAVORITES, favorites.value)
    onChange()
  }
  function removeFavorite(input: InstrumentInput) {
    favorites.value = favorites.value.filter((item) => instrumentKey(item) !== instrumentKey(input))
    setStorage(STORAGE_KEYS.STOCK_FAVORITES, favorites.value)
    onChange()
  }
  function reorderFavorites(items: FavoriteStock[]) {
    favorites.value = items
    setStorage(STORAGE_KEYS.STOCK_FAVORITES, items)
  }
  function recordRecent(input: InstrumentInput, name: string) {
    const meta = resolveInstrument(input)
    recentStocks.value = [
      { ...meta, name },
      ...recentStocks.value.filter((item) => instrumentKey(item) !== meta.symbol),
    ].slice(0, 8)
    setStorage(STORAGE_KEYS.STOCK_RECENT, recentStocks.value)
  }
  function upsertPosition(payload: Omit<StockPosition, 'id' | 'createdAt'>) {
    if (
      !Number.isInteger(payload.shares) ||
      payload.shares <= 0 ||
      !Number.isFinite(payload.costPrice) ||
      payload.costPrice <= 0
    )
      return false
    const meta = resolveInstrument(payload)
    if (meta.type === 'index') return false
    const existing = positions.value.find((item) => instrumentKey(item) === meta.symbol)
    const normalized = { ...payload, ...meta }
    if (existing) Object.assign(existing, normalized)
    else positions.value.push({ ...normalized, id: crypto.randomUUID(), createdAt: Date.now() })
    positions.value = [...positions.value]
    setStorage(STORAGE_KEYS.STOCK_POSITIONS, positions.value)
    addFavorite(meta, payload.name)
    onChange()
    return true
  }
  function removePosition(id: string) {
    positions.value = positions.value.filter((item) => item.id !== id)
    setStorage(STORAGE_KEYS.STOCK_POSITIONS, positions.value)
    onChange()
  }
  function checkAlerts(input: InstrumentInput, price: number) {
    if (!Number.isFinite(price) || price <= 0) return
    let changed = false
    alerts.value = alerts.value.map((alert) => {
      if (!alert.enabled || alert.triggeredAt || instrumentKey(alert) !== instrumentKey(input))
        return alert
      const reached = alert.direction === 'above' ? price >= alert.target : price <= alert.target
      if (!reached) return alert
      changed = true
      return { ...alert, triggeredAt: Date.now() }
    })
    if (changed) setStorage(STORAGE_KEYS.STOCK_ALERTS, alerts.value)
  }
  function addAlert(payload: Omit<PriceAlert, 'id' | 'enabled'>) {
    if (!Number.isFinite(payload.target) || payload.target <= 0)
      throw new Error('提醒价格必须为有效正数')
    const alert: PriceAlert = {
      ...payload,
      ...resolveInstrument(payload),
      id: crypto.randomUUID(),
      enabled: true,
    }
    alerts.value = [alert, ...alerts.value].slice(0, 30)
    setStorage(STORAGE_KEYS.STOCK_ALERTS, alerts.value)
    return alert
  }
  function removeAlert(id: string) {
    alerts.value = alerts.value.filter((alert) => alert.id !== id)
    setStorage(STORAGE_KEYS.STOCK_ALERTS, alerts.value)
  }
  function toggleAlert(id: string) {
    alerts.value = alerts.value.map((alert) =>
      alert.id === id ? { ...alert, enabled: !alert.enabled, triggeredAt: undefined } : alert,
    )
    setStorage(STORAGE_KEYS.STOCK_ALERTS, alerts.value)
  }
  function setResearchNote(input: InstrumentInput, text: string) {
    notes.value = { ...notes.value, [instrumentKey(input)]: text }
    setStorage(STORAGE_KEYS.STOCK_NOTES, notes.value)
  }
  function getResearchNote(input: InstrumentInput) {
    return notes.value[instrumentKey(input)] ?? ''
  }
  return {
    favorites,
    recentStocks,
    positions,
    alerts,
    notes,
    isFavorite,
    addFavorite,
    removeFavorite,
    reorderFavorites,
    recordRecent,
    upsertPosition,
    removePosition,
    checkAlerts,
    addAlert,
    removeAlert,
    toggleAlert,
    setResearchNote,
    getResearchNote,
  }
}
