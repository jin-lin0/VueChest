<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { createChart, ColorType, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, Time } from 'lightweight-charts'
import type { KlineData } from '@/stores/stock'
import { STOCK_COLORS } from '../config'

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
    height: 400,
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
  if (!candlestickSeries || !props.data.length) return

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
    <div ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<style scoped>
.chart-wrapper {
  width: 100%;
  margin-top: 1rem;
}

.chart-container {
  width: 100%;
  height: 400px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
}
</style>
