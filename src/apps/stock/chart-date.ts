import type { Time } from 'lightweight-charts'

export function formatChartDate(time: Time): string {
  if (typeof time === 'string') return time
  if (typeof time === 'number') return new Date(time * 1000).toISOString().slice(0, 10)
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
}

export function formatChartTick(time: Time, tickMarkType: number): string {
  const [year, month, day] = formatChartDate(time).split('-')
  if (tickMarkType === 0) return year
  if (tickMarkType === 1) return `${Number(month)}月`
  return `${month}-${day}`
}
