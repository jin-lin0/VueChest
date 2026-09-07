<script setup lang="ts">
import { computed } from 'vue'
import CopyButton from '@/components/common/CopyButton.vue'
import type { ApiResponse } from '../types'
import { formatBytes, getStatusTone, type AssertionResult } from '../request-utils'
const props = defineProps<{
  response: ApiResponse | null
  isLoading: boolean
  error: string | null
  assertionResults: AssertionResult[]
}>()
const emit = defineEmits<{ retry: [] }>()
const responseTab = defineModel<'preview' | 'headers' | 'tests'>('tab', { required: true })
const responseText = computed(() => {
  if (!props.response || props.response.imageUrl) return ''
  if (typeof props.response.data === 'string') return props.response.data
  try {
    return JSON.stringify(props.response.data, null, 2)
  } catch {
    return String(props.response.data)
  }
})
</script>

<template>
  <section class="runner-card response-card">
    <div class="runner-card-heading response-heading">
      <div>
        <span class="step-number">02</span>
        <div>
          <h2>读取响应</h2>
          <p>预览 Body 与响应 Header</p>
        </div>
      </div>
      <CopyButton
        v-if="responseText"
        :text="responseText"
        label="复制响应"
        :icon="false"
        variant="mini"
      />
    </div>

    <div class="runner-tabs response-tabs" role="group" aria-label="响应显示">
      <button
        :class="{ active: responseTab === 'preview' }"
        :aria-pressed="responseTab === 'preview'"
        type="button"
        @click="responseTab = 'preview'"
      >
        Preview</button
      ><button
        :class="{ active: responseTab === 'headers' }"
        :aria-pressed="responseTab === 'headers'"
        :disabled="!response"
        type="button"
        @click="responseTab = 'headers'"
      >
        Headers <span>{{ response ? Object.keys(response.headers).length : 0 }}</span>
      </button>
      <button
        :class="{ active: responseTab === 'tests' }"
        :aria-pressed="responseTab === 'tests'"
        :disabled="!response"
        type="button"
        @click="responseTab = 'tests'"
      >
        Tests
        <span
          >{{ assertionResults.filter((item) => item.passed).length }}/{{
            assertionResults.length
          }}</span
        >
      </button>
      <div v-if="response" class="response-metrics">
        <span class="status-pill" :class="getStatusTone(response.status)"
          ><i></i>{{ response.status }} {{ response.statusText }}</span
        ><span>{{ response.time }} ms</span><span>{{ formatBytes(response.size) }}</span>
      </div>
    </div>

    <div class="response-viewport vc-scrollbar vc-scrollbar--thin">
      <div v-if="isLoading" class="response-loading">
        <span class="pulse-ring"></span><strong>请求已发出</strong>
        <p>正在等待响应并读取数据流…</p>
        <div><i></i><i></i><i></i></div>
      </div>
      <div v-else-if="error" class="response-error">
        <span>!</span><strong>请求没有完成</strong>
        <p>{{ error }}</p>
        <button type="button" @click="emit('retry')">重新发送</button>
      </div>
      <template v-else-if="response">
        <div v-if="response.truncated" class="truncate-banner">
          响应超过 512 KB，已停止读取并只展示安全范围内的内容。
        </div>
        <div v-if="responseTab === 'preview'" class="response-body">
          <img v-if="response.imageUrl" :src="response.imageUrl" :alt="response.contentType" />
          <pre v-else><code>{{ responseText }}</code></pre>
        </div>
        <div v-else-if="responseTab === 'headers'" class="response-headers-table">
          <div v-for="(value, name) in response.headers" :key="name">
            <strong>{{ name }}</strong
            ><code>{{ value }}</code>
          </div>
        </div>
        <div v-else class="assertion-results">
          <div
            v-for="item in assertionResults"
            :key="item.id"
            :class="item.passed ? 'passed' : 'failed'"
          >
            <span>{{ item.passed ? '✓' : '×' }}</span
            ><strong>{{ item.label }}</strong
            ><small>{{ item.detail }}</small>
          </div>
          <p v-if="!assertionResults.length">还没有启用的断言。</p>
        </div>
      </template>
      <div v-else class="response-placeholder">
        <div class="response-orbit"><span>{ }</span><i></i><i></i></div>
        <strong>等待一次真实响应</strong>
        <p>配置左侧请求并点击“发送请求”，状态、耗时、大小和响应内容会显示在这里。</p>
        <div class="placeholder-hints">
          <span>JSON 格式化</span><span>图片预览</span><span>响应头</span>
        </div>
      </div>
    </div>
  </section>
</template>
