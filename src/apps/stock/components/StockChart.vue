<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
} from 'lightweight-charts'
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, Time } from 'lightweight-charts'
import type { KlineData } from '@/stores/stock'
import { STOCK_COLORS } from '../config'
import { sma } from '../research'

// 平台注入的主题对象（opt-in）：CSS 变量管不到 lightweight-charts 的 JS 上色，
// 所以图表背景/文字/网格必须读 isDark 主动重绘。拿不到时降级为浅色。
interface AppTheme {
  isDark: boolean
  onChange: (cb: (isDark: boolean) => void) => () => void
}
const appTheme = inject<AppTheme | null>('appTheme', null)
let unsubscribeTheme: (() => void) | null = null

// 图表主题色（对齐 public/tokens.css：浅色 #fff/#333/#f0f0f0；深色 #1e293b/#94a3b8/#334155）
const chartTheme = (dark: boolean) =>
  dark
    ? { background: '#1e293b', text: '#94a3b8', grid: '#334155' }
    : { background: '#ffffff', text: '#333333', grid: '#f0f0f0' }

const applyChartTheme = (dark: boolean) => {
  if (!chart) return
  const c = chartTheme(dark)
  chart.applyOptions({
    layout: { background: { type: ColorType.Solid, color: c.background }, textColor: c.text },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
  })
}

const props = defineProps<{
  data: KlineData[]
  selectedDate: string
}>()

const emit = defineEmits<{
  candleClick: [data: KlineData]
}>()

const chartContainer = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let candlestickSeries: ISeriesApi<'Candlestick'> | null = null
let volumeSeries: ISeriesApi<'Histogram'> | null = null
let ma5Series: ISeriesApi<'Line'> | null = null
let ma10Series: ISeriesApi<'Line'> | null = null
let ma20Series: ISeriesApi<'Line'> | null = null
let markersPlugin: ISeriesMarkersPluginApi<Time> | null = null

const initChart = () => {
  if (!chartContainer.value) return

  const c = chartTheme(appTheme?.isDark ?? false)
  chart = createChart(chartContainer.value, {
    layout: {
      background: { type: ColorType.Solid, color: c.background },
      textColor: c.text,
    },
    grid: {
      vertLines: { color: c.grid },
      horzLines: { color: c.grid },
    },
    width: chartContainer.value.clientWidth,
    height: 460,
    timeScale: {
      timeVisible: false,
      secondsVisible: false,
    },
  })

  candlestickSeries = chart.addSeries(CandlestickSeries, {
    upColor: STOCK_COLORS.UP,
    downColor: STOCK_COLORS.DOWN,
    borderDownColor: STOCK_COLORS.DOWN,
    borderUpColor: STOCK_COLORS.UP,
    wickDownColor: STOCK_COLORS.DOWN,
    wickUpColor: STOCK_COLORS.UP,
  })

  volumeSeries = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  })
  volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })

  ma5Series = chart.addSeries(LineSeries, {
    color: '#f59e0b',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    title: 'MA5',
  })
  ma10Series = chart.addSeries(LineSeries, {
    color: '#8b5cf6',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    title: 'MA10',
  })
  ma20Series = chart.addSeries(LineSeries, {
    color: '#0ea5e9',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    title: 'MA20',
  })

  chart.subscribeClick(handleClick)
  updateChart()
}

const handleClick = (param: { time?: Time }) => {
  if (!param.time) return
  const timeStr = String(param.time)
  const found = props.data.find((item) => {
    const [year, month, day] = item.date.split('-')
    return `${year}-${month}-${day}` === timeStr
  })
  if (found) {
    emit('candleClick', found)
  }
}

const updateChart = () => {
  if (!candlestickSeries) return
  if (!props.data.length) {
    candlestickSeries.setData([])
    volumeSeries?.setData([])
    ma5Series?.setData([])
    ma10Series?.setData([])
    ma20Series?.setData([])
    return
  }

  const chartData = props.data.map((item) => {
    const [year, month, day] = item.date.split('-')
    return {
      time: `${year}-${month}-${day}`,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
    }
  })

  candlestickSeries.setData(chartData)
  volumeSeries?.setData(
    props.data.map((item) => ({
      time: item.date as Time,
      value: Number(item.volume),
      color:
        Number(item.close) >= Number(item.open)
          ? 'rgba(220, 38, 38, 0.32)'
          : 'rgba(5, 150, 105, 0.32)',
    })),
  )
  const toLine = (period: number) =>
    sma(props.data, period).map((item) => ({ time: item.date as Time, value: item.value }))
  ma5Series?.setData(toLine(5))
  ma10Series?.setData(toLine(10))
  ma20Series?.setData(toLine(20))

  if (!props.selectedDate) chart?.timeScale().fitContent()

  if (props.selectedDate && chart && candlestickSeries) {
    const selectedIndex = props.data.findIndex((item) => item.date === props.selectedDate)
    if (selectedIndex !== -1) {
      if (markersPlugin) {
        markersPlugin.detach()
      }
      markersPlugin = createSeriesMarkers(candlestickSeries, [
        {
          time: chartData[selectedIndex].time,
          position: 'belowBar',
          color: '#3498db',
          shape: 'arrowUp',
          text: '查询日',
        },
      ])

      const viewStart = Math.max(0, selectedIndex - 10)
      const viewEnd = Math.min(chartData.length - 1, selectedIndex + 10)
      chart.timeScale().setVisibleRange({
        from: chartData[viewStart].time,
        to: chartData[viewEnd].time,
      })
    }
  }
}

const handleResize = () => {
  if (chart && chartContainer.value) {
    chart.applyOptions({ width: chartContainer.value.clientWidth })
  }
}

onMounted(() => {
  nextTick(() => {
    initChart()
    window.addEventListener('resize', handleResize)
    // 主题切换时重绘图表（app 主动 opt-in 消费平台主题）
    if (appTheme?.onChange) {
      unsubscribeTheme = appTheme.onChange((isDark) => applyChartTheme(isDark))
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (unsubscribeTheme) {
    unsubscribeTheme()
    unsubscribeTheme = null
  }
  if (chart) {
    chart.remove()
    chart = null
  }
})

watch(
  () => props.data,
  () => {
    updateChart()
  },
  { deep: true },
)

watch(
  () => props.selectedDate,
  () => {
    updateChart()
  },
)
</script>

<template>
  <div class="chart-wrapper">
    <div class="chart-legend" aria-label="均线图例">
      <span class="ma5"><i></i>MA5</span>
      <span class="ma10"><i></i>MA10</span>
      <span class="ma20"><i></i>MA20</span>
      <span class="volume"><i></i>成交量</span>
    </div>
    <div ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<style scoped>
.chart-wrapper {
  width: 100%;
  margin-top: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--border-light);
  border-radius: 18px;
  background: var(--bg-card);
}

.chart-container {
  width: 100%;
  height: 460px;
}

.chart-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.chart-legend i {
  width: 18px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
}

.chart-legend .ma5 {
  color: #f59e0b;
}
.chart-legend .ma10 {
  color: #8b5cf6;
}
.chart-legend .ma20 {
  color: #0ea5e9;
}
.chart-legend .volume {
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .chart-container {
    height: 380px;
  }
  .chart-legend {
    flex-wrap: wrap;
    gap: 8px 14px;
  }
}
</style>
