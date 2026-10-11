import type { KlineData } from '@/stores/stock'

export function marketClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    closed: Number(part('hour')) * 60 + Number(part('minute')) >= 15 * 60,
  }
}

/** Only completed daily bars can form close-based research/backtest signals. */
export function completedDailyBars(data: KlineData[], now = new Date()): KlineData[] {
  const clock = marketClock(now)
  return data.filter((row) => row.date < clock.date || (row.date === clock.date && clock.closed))
}
