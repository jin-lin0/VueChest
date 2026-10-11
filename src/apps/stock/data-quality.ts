/** Preserve unknown values instead of coercing null, whitespace or booleans to zero. */
export function finiteOrNull(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function formatPrice(value: unknown, digits = 2): string {
  return finiteOrNull(value)?.toFixed(digits) ?? '--'
}

export function quoteTimestamp(value: string): string {
  return /^\d{14}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`
    : ''
}

export function summaryTimestamp(value: string | null | undefined): string {
  return quoteTimestamp(value ?? '')
}
