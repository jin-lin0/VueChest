import type { KlineData } from './model'

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

export function completedThrough(now = new Date()) {
  const clock = marketClock(now)
  if (clock.closed) return clock.date
  const previous = new Date(`${clock.date}T00:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return previous.toISOString().slice(0, 10)
}
