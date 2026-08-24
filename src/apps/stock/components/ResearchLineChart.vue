<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ColorType, LineSeries, createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts'

export interface ResearchSeries {
  name: string
  color: string
  points: Array<{ date: string; value: number }>
}

const props = defineProps<{ series: ResearchSeries[]; height?: number }>()
const container = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let lines: ISeriesApi<'Line'>[] = []

function render() {
  if (!chart) return
  lines.forEach((line) => chart?.removeSeries(line))
  lines = props.series.map((entry) => {
    const line = chart!.addSeries(LineSeries, {
      color: entry.color,
      lineWidth: 2,
      title: entry.name,
      priceLineVisible: false,
      lastValueVisible: true,
    })
    line.setData(entry.points.map((point) => ({ time: point.date as Time, value: point.value })))
    return line
  })
  chart.timeScale().fitContent()
}

function resize() {
  if (chart && container.value) chart.applyOptions({ width: container.value.clientWidth })
}

onMounted(() => {
  nextTick(() => {
    if (!container.value) return
    const dark = document.documentElement.classList.contains('dark')
    chart = createChart(container.value, {
      width: container.value.clientWidth,
      height: props.height || 300,
      layout: {
        background: { type: ColorType.Solid, color: dark ? '#1e293b' : '#ffffff' },
        textColor: dark ? '#94a3b8' : '#64748b',
      },
      grid: {
        vertLines: { color: dark ? '#334155' : '#edf1f7' },
        horzLines: { color: dark ? '#334155' : '#edf1f7' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    })
    render()
    window.addEventListener('resize', resize)
  })
})

watch(() => props.series, render, { deep: true })
onUnmounted(() => {
  window.removeEventListener('resize', resize)
  chart?.remove()
  chart = null
  lines = []
})
</script>

<template><div ref="container" class="research-line-chart"></div></template>

<style scoped>
.research-line-chart { width: 100%; min-height: 260px; }
</style>
