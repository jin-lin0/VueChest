<script setup lang="ts">
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'

defineOptions({ name: 'StockTradeDatePicker' })

const emit = defineEmits<{
  select: [date: Date | null]
}>()
</script>

<template>
  <VueDatePicker
    :model-value="null"
    :enable-time-picker="false"
    :max-date="new Date()"
    placeholder="定位交易日"
    auto-apply
    :clearable="false"
    @update:model-value="emit('select', $event)"
  />
</template>
