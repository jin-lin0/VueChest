<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { createChart, ColorType, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, Time } from 'lightweight-charts'
import type { KlineData } from '@/stores/stock'

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

  chart = createChart(chartContainer.value, {
    layout: {
      background: { type: ColorType.Solid, color: '#ffffff' },
      textColor: '#333',
    },
    grid: {
      vertLines: { color: '#f0f0f0' },
      horzLines: { color: '#f0f0f0' },
    },
    width: chartContainer.value.clientWidth,
    height: 400,
    timeScale: {
      timeVisible: false,
      secondsVisible: false,
    },
  })

  candlestickSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#e74c3c',
    downColor: '#2ecc71',
    borderDownColor: '#2ecc71',
    borderUpColor: '#e74c3c',
    wickDownColor: '#2ecc71',
    wickUpColor: '#e74c3c',
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
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
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
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}
</style>
