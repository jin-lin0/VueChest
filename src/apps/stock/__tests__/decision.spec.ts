import { describe, expect, it } from 'vitest'
import { buildResearchDecision, type DecisionContext } from '../decision'
import { buildTechnicalSnapshot } from '../research'
import type { KlineData, StockResearchSummary } from '@/stores/stock'

const data: KlineData[] = Array.from({ length: 130 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
  open: String(10 + index),
  close: String(10 + index),
  high: String(11 + index),
  low: String(9 + index),
  volume: '1000',
}))
const context = (): DecisionContext => ({
  technical: buildTechnicalSnapshot(data),
  valuation: {
    pe: 20,
    pb: 3,
    volumeRatio: 1,
    source: 'tencent',
    asOf: '20261009150000',
  } as StockResearchSummary,
  technicalPrice: 139,
  technicalVolatility: 10,
  support: 100,
  resistance: 140,
  klineLength: 130,
  asOfDate: '2026-10-11',
})

describe('decision coverage is limited to daily technical and Tencent valuation fields', () => {
  it('can have complete coverage without other research providers', () => {
    const result = buildResearchDecision(context())
    expect(result.dataCoverage).toBe(100)
    expect(result.dataAdequacy).toBe('充分')
    expect(result.missingData).toEqual([])
  })
  it('does not count empty valuation objects as usable fields', () => {
    const empty = context()
    empty.valuation = {
      pe: null,
      pb: null,
      volumeRatio: null,
      asOf: '20261009150000',
    } as StockResearchSummary
    const result = buildResearchDecision(empty)
    expect(result.dataCoverage).toBe(70)
    expect(result.dataAdequacy).toBe('部分')
    expect(result.missingData).toContain('估值字段')
  })
  it('counts partial valuation fields proportionally', () => {
    const partial = context()
    partial.valuation!.pb = null
    const result = buildResearchDecision(partial)
    expect(result.dataCoverage).toBe(90)
    expect(result.dataAdequacy).toBe('部分')
    expect(result.missingData).toContain('估值字段（字段不完整）')
  })
  it('does not count a data-insufficient technical placeholder', () => {
    const missing = context()
    missing.technical = buildTechnicalSnapshot([])
    missing.klineLength = 0
    const result = buildResearchDecision(missing)
    expect(result.dataCoverage).toBe(30)
    expect(result.label).toBe('数据不足')
  })
  it('does not score valuation fields with unknown, stale or future quote time', () => {
    for (const asOf of [null, '20260101150000', '20271010150000']) {
      const stale = context()
      stale.valuation!.asOf = asOf
      expect(buildResearchDecision(stale).dataCoverage).toBe(70)
      expect(buildResearchDecision(stale).missingData).toContain('估值字段')
    }
  })
  it('keeps an empty workspace neutral and data-insufficient', () => {
    const missing = context()
    missing.technical = null
    missing.valuation = null
    missing.klineLength = 0
    expect(buildResearchDecision(missing)).toMatchObject({
      dataCoverage: 0,
      dataAdequacy: '不足',
      tone: 'neutral',
      label: '数据不足',
    })
  })
})
