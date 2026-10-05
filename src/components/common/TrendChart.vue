<script setup lang="ts">
/**
 * 轻量趋势图：不引入图表库，直接画 SVG。
 *
 * - 横向自适应（viewBox + preserveAspectRatio="none"），描边用
 *   vector-effect="non-scaling-stroke" 保持均匀，不会被拉伸变形。
 * - 支持面积折线（area）与柱状（bars）两种形态，后者适合稀疏的整数计数。
 * - 悬停显示指示线与数值；数据全为 0 时展示空态文案而不是一条无意义的线。
 */
import { computed, ref, useId } from 'vue'
import {
  TREND_VIEW_WIDTH,
  buildTrendGeometry,
  formatDayLabel,
  indexToRatio,
  pickTickIndexes,
  ratioToIndex,
} from './trend-chart'

const props = withDefaults(
  defineProps<{
    values: number[]
    labels?: string[]
    height?: number
    variant?: 'area' | 'bars'
    color?: string
    unit?: string
    emptyText?: string
    ariaLabel?: string
  }>(),
  {
    labels: () => [],
    height: 132,
    variant: 'area',
    color: 'var(--accent)',
    unit: '次',
    emptyText: '所选区间内暂无数据',
    ariaLabel: '趋势图',
  },
)

const gradientId = `trend-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const hoverIndex = ref(-1)

const geometry = computed(() => buildTrendGeometry(props.values, props.height))
const isEmpty = computed(() => geometry.value.total === 0)
const ticks = computed(() => pickTickIndexes(props.labels.length))

const hoverRatio = computed(() =>
  hoverIndex.value < 0 ? 0 : indexToRatio(hoverIndex.value, props.values.length),
)

const hoverPoint = computed(() => {
  const point = geometry.value.points[hoverIndex.value]
  if (!point) return null
  return {
    value: point.value,
    label: props.labels[hoverIndex.value] ?? '',
  }
})

/** 柱状图：按点数均分宽度，留 30% 间隙。 */
const barWidth = computed(() => {
  const count = geometry.value.points.length
  if (!count) return 0
  return (TREND_VIEW_WIDTH / count) * 0.7
})

const bars = computed(() =>
  geometry.value.points.map((point) => ({
    key: point.index,
    x: (TREND_VIEW_WIDTH / geometry.value.points.length) * point.index + barWidth.value * 0.21,
    y: point.y,
    width: barWidth.value,
    height: Math.max(0, geometry.value.baseline - point.y),
  })),
)

function handleMove(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  if (!rect.width) return
  hoverIndex.value = ratioToIndex((event.clientX - rect.left) / rect.width, props.values.length)
}

function clearHover() {
  hoverIndex.value = -1
}
</script>

<template>
  <div class="trend-chart" :class="{ 'has-axis': ticks.length > 1 }" :style="{ height: `${height}px` }">
    <svg
      class="trend-svg"
      :viewBox="`0 0 ${TREND_VIEW_WIDTH} ${height}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="ariaLabel"
    >
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.28" />
          <stop offset="100%" :stop-color="color" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <template v-if="!isEmpty">
        <template v-if="variant === 'area'">
          <path :d="geometry.areaPath" :fill="`url(#${gradientId})`" stroke="none" />
          <path
            :d="geometry.linePath"
            fill="none"
            :stroke="color"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </template>
        <template v-else>
          <rect
            v-for="bar in bars"
            :key="bar.key"
            :x="bar.x"
            :y="bar.y"
            :width="bar.width"
            :height="bar.height"
            :fill="color"
            fill-opacity="0.75"
            rx="1"
          />
        </template>

        <line
          v-if="hoverIndex >= 0"
          :x1="hoverRatio * TREND_VIEW_WIDTH"
          :x2="hoverRatio * TREND_VIEW_WIDTH"
          y1="0"
          :y2="geometry.baseline"
          stroke="var(--border)"
          stroke-width="1"
          stroke-dasharray="3 3"
          vector-effect="non-scaling-stroke"
        />
      </template>
    </svg>

    <div
      v-if="!isEmpty"
      class="trend-overlay"
      @mousemove="handleMove"
      @mouseleave="clearHover"
    >
      <div
        v-if="hoverPoint"
        class="trend-tooltip"
        :style="{
          left: `${hoverRatio * 100}%`,
          transform:
            hoverRatio > 0.85
              ? 'translate(-100%, -100%)'
              : hoverRatio < 0.15
                ? 'translate(0, -100%)'
                : 'translate(-50%, -100%)',
        }"
      >
        <strong>{{ hoverPoint.value }} {{ unit }}</strong>
        <small v-if="hoverPoint.label">{{ formatDayLabel(hoverPoint.label) }}</small>
      </div>
    </div>

    <p v-if="isEmpty" class="trend-empty">{{ emptyText }}</p>

    <div v-if="ticks.length > 1" class="trend-axis">
      <span
        v-for="index in ticks"
        :key="index"
        :style="{ left: `${indexToRatio(index, labels.length) * 100}%` }"
      >
        {{ formatDayLabel(labels[index] ?? '') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.trend-chart {
  position: relative;
  width: 100%;
}

.trend-svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.trend-overlay {
  position: absolute;
  inset: 0;
  cursor: crosshair;
}

/* 有刻度轴时给底部留出 18px，否则迷你图（sparkline）会被白白压扁 */
.trend-chart.has-axis .trend-overlay {
  bottom: 18px;
}

.trend-tooltip {
  position: absolute;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0.28rem 0.5rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
  color: var(--text-primary);
  font-size: var(--font-size-meta);
  pointer-events: none;
  white-space: nowrap;
}

.trend-tooltip small {
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
}

.trend-empty {
  position: absolute;
  inset: 0;
  display: grid;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-meta);
  place-items: center;
}

.trend-chart.has-axis .trend-empty {
  bottom: 18px;
}

.trend-axis {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 16px;
}

.trend-axis span {
  position: absolute;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  transform: translateX(-50%);
}

.trend-axis span:first-child {
  transform: translateX(0);
}

.trend-axis span:last-child {
  transform: translateX(-100%);
}
</style>
