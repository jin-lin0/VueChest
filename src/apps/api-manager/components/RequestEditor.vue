<script setup lang="ts">
import { computed } from 'vue'
import CopyButton from '@/components/common/CopyButton.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import RequestBodyEditor from './RequestBodyEditor.vue'
import type { ApiItem } from '../defaults'
import type { AuthDraft } from '../types'
import type { RequestHeader, AssertionRule } from '../request-utils'
import type { ExtractionRule } from '../collection-runner'
import {
  canSendBody,
  type RequestBodyMode,
  type RequestFormField,
  type RequestFiles,
} from '../request-body'
import { createRequestHeader as createHeader } from '../saved-request'
import { assertionTypeOptions, requestAuthOptions, apiKeyLocationOptions } from '../editor-options'
const props = defineProps<{
  selectedApi: ApiItem
  curlCommand: string
  isLoading: boolean
  validationMessage: string | null
}>()
const emit = defineEmits<{ send: []; cancel: []; removeAssertion: [id: string] }>()
const canHaveBody = computed(() => canSendBody(props.selectedApi.method))
const paramValues = defineModel<Record<string, string>>('paramValues', { required: true })
const requestHeaders = defineModel<RequestHeader[]>('requestHeaders', { required: true })
const requestBody = defineModel<string>('requestBody', { required: true })
const requestBodyMode = defineModel<RequestBodyMode>('requestBodyMode', { required: true })
const requestFormFields = defineModel<RequestFormField[]>('requestFormFields', { required: true })
const requestFiles = defineModel<RequestFiles>('requestFiles', { required: true })
const requestTab = defineModel<'params' | 'headers' | 'body' | 'tests' | 'extract'>('requestTab', {
  required: true,
})
const assertions = defineModel<AssertionRule[]>('assertions', { required: true })
const authDraft = defineModel<AuthDraft>('authDraft', { required: true })
const extractionRules = defineModel<ExtractionRule[]>('extractionRules', { required: true })
const retryCount = defineModel<number>('retryCount', { required: true })
const requestTimeoutMs = defineModel<number>('requestTimeoutMs', { required: true })

function addRequestHeader() {
  requestHeaders.value.push(createHeader())
}

function removeRequestHeader(id: string) {
  requestHeaders.value = requestHeaders.value.filter((header) => header.id !== id)
}

function addAssertion() {
  assertions.value.push({
    id: crypto.randomUUID(),
    type: 'body-includes',
    expected: '',
    enabled: true,
  })
}

function removeAssertion(id: string) {
  assertions.value = assertions.value.filter((item) => item.id !== id)
  emit('removeAssertion', id)
}

function addExtractionRule() {
  extractionRules.value.push({
    id: crypto.randomUUID(),
    path: '$.data.token',
    variable: 'token',
    enabled: true,
  })
}

function removeExtractionRule(id: string) {
  extractionRules.value = extractionRules.value.filter((item) => item.id !== id)
}
</script>

<template>
  <section class="runner-card request-card">
    <div class="runner-card-heading">
      <div>
        <span class="step-number">01</span>
        <div>
          <h2>构建请求</h2>
          <p>配置运行时参数、Header 与 Body</p>
        </div>
      </div>
      <CopyButton :text="curlCommand" label="复制 cURL" :icon="false" variant="mini" />
    </div>

    <div class="runner-tabs" role="group" aria-label="请求配置">
      <button
        :class="{ active: requestTab === 'params' }"
        :aria-pressed="requestTab === 'params'"
        type="button"
        @click="requestTab = 'params'"
      >
        Params <span>{{ selectedApi.params.length }}</span>
      </button>
      <button
        :class="{ active: requestTab === 'headers' }"
        :aria-pressed="requestTab === 'headers'"
        type="button"
        @click="requestTab = 'headers'"
      >
        Headers <span>{{ requestHeaders.length }}</span>
      </button>
      <button
        v-if="canHaveBody"
        :class="{ active: requestTab === 'body' }"
        :aria-pressed="requestTab === 'body'"
        type="button"
        @click="requestTab = 'body'"
      >
        Body
      </button>
      <button
        :class="{ active: requestTab === 'tests' }"
        :aria-pressed="requestTab === 'tests'"
        type="button"
        @click="requestTab = 'tests'"
      >
        Tests <span>{{ assertions.length }}</span>
      </button>
      <button
        :class="{ active: requestTab === 'extract' }"
        :aria-pressed="requestTab === 'extract'"
        type="button"
        @click="requestTab = 'extract'"
      >
        提取 <span>{{ extractionRules.length }}</span>
      </button>
    </div>

    <div class="request-config vc-scrollbar vc-scrollbar--thin">
      <div v-if="requestTab === 'params'" class="runtime-params">
        <div v-if="selectedApi.params.length" class="param-table-head">
          <span>参数</span><span>值</span>
        </div>
        <label v-for="param in selectedApi.params" :key="param.name" class="runtime-param"
          ><span class="runtime-param-info"
            ><strong>{{ param.name }} <b v-if="param.required">*</b></strong
            ><small>{{ param.description || `${param.type} 参数` }}</small></span
          ><input
            v-model="paramValues[param.name]"
            :type="param.type === 'number' ? 'number' : 'text'"
            :placeholder="param.defaultValue || '输入参数值'"
        /></label>
        <div v-if="!selectedApi.params.length" class="config-empty">
          <span>✓</span><strong>这个接口没有动态参数</strong>
          <p>请求地址已经可以直接运行。需要自定义 Header 时切换到 Headers。</p>
        </div>
      </div>

      <div v-else-if="requestTab === 'headers'" class="headers-editor">
        <div class="header-table-head">
          <span>启用</span><span>Header</span><span>Value</span><span></span>
        </div>
        <div v-for="header in requestHeaders" :key="header.id" class="header-row">
          <label class="row-check"
            ><input v-model="header.enabled" type="checkbox" /><span></span></label
          ><input v-model="header.name" type="text" placeholder="Authorization" /><input
            v-model="header.value"
            type="text"
            placeholder="Bearer …"
          /><button type="button" aria-label="删除请求头" @click="removeRequestHeader(header.id)">
            ×
          </button>
        </div>
        <button class="add-table-row" type="button" @click="addRequestHeader">
          ＋ 添加 Header
        </button>
        <div class="auth-editor">
          <strong>鉴权</strong>
          <CustomSelect v-model="authDraft.type" :options="requestAuthOptions" size="sm" block />
          <input
            v-if="authDraft.type === 'bearer'"
            v-model="authDraft.token"
            type="password"
            placeholder="Token 或 {{token}}"
          />
          <template v-else-if="authDraft.type === 'api-key'">
            <CustomSelect v-model="authDraft.location" :options="apiKeyLocationOptions" size="sm" />
            <input v-model="authDraft.name" type="text" placeholder="X-API-Key" />
            <input v-model="authDraft.value" type="password" placeholder="值或 {{apiKey}}" />
          </template>
          <template v-else-if="authDraft.type === 'basic'">
            <input v-model="authDraft.username" type="text" placeholder="用户名" />
            <input v-model="authDraft.password" type="password" placeholder="密码" />
          </template>
        </div>
        <p class="security-note">敏感 Header 只用于本次页面会话，不会写入请求历史。</p>
      </div>

      <RequestBodyEditor
        v-else-if="requestTab === 'body'"
        v-model:mode="requestBodyMode"
        v-model:body="requestBody"
        v-model:fields="requestFormFields"
        v-model:files="requestFiles"
      />
      <div v-else-if="requestTab === 'tests'" class="assertion-editor">
        <div class="assertion-head">
          <span>启用</span><span>断言</span><span>期望值</span><span></span>
        </div>
        <div v-for="rule in assertions" :key="rule.id" class="assertion-row">
          <label class="row-check"
            ><input v-model="rule.enabled" type="checkbox" /><span></span
          ></label>
          <CustomSelect v-model="rule.type" :options="assertionTypeOptions" size="sm" block />
          <input
            v-model="rule.expected"
            type="text"
            :placeholder="
              rule.type === 'status' ? '200' : rule.type === 'time' ? '2000' : 'success'
            "
          />
          <button type="button" aria-label="删除断言" @click="removeAssertion(rule.id)">×</button>
        </div>
        <button class="add-table-row" type="button" @click="addAssertion">＋ 添加断言</button>
        <p class="security-note">每次请求完成后自动验证状态、性能和响应内容。</p>
      </div>
      <div v-else class="extraction-editor standalone">
        <div class="extraction-intro">
          <strong>把响应字段传给下一个请求</strong>
          <p>
            例如提取 <code>$.data.token</code> 为 <code>token</code>，后续请求中使用
            <code v-pre>{{ token }}</code
            >。
          </p>
        </div>
        <div v-for="rule in extractionRules" :key="rule.id" class="extraction-row">
          <label class="row-check" title="启用提取规则">
            <input v-model="rule.enabled" type="checkbox" /><span></span>
          </label>
          <input v-model="rule.path" type="text" aria-label="JSONPath" placeholder="$.data.token" />
          <input v-model="rule.variable" type="text" aria-label="变量名" placeholder="token" />
          <button type="button" aria-label="删除提取规则" @click="removeExtractionRule(rule.id)">
            ×
          </button>
        </div>
        <button class="add-table-row" type="button" @click="addExtractionRule">
          ＋ 添加提取规则
        </button>
        <p v-if="!extractionRules.length" class="config-empty compact">
          仅在需要把一个请求的响应传给后续请求时配置。
        </p>
      </div>
    </div>

    <p v-if="validationMessage" class="form-banner error">{{ validationMessage }}</p>
    <div class="request-policy">
      <label>失败重试 <input v-model.number="retryCount" type="number" min="0" max="3" /></label>
      <label>
        超时(ms)
        <input
          v-model.number="requestTimeoutMs"
          type="number"
          min="1000"
          max="120000"
          step="1000"
        />
      </label>
    </div>
    <div class="request-actions">
      <button v-if="!isLoading" class="send-button" type="button" @click="emit('send')">
        <span>▶</span> 发送请求</button
      ><button v-else class="cancel-request-button" type="button" @click="emit('cancel')">
        <span>■</span> 取消请求</button
      ><span
        ><i :class="{ running: isLoading }"></i
        >{{ isLoading ? '正在等待目标服务响应…' : `超时限制 ${requestTimeoutMs / 1000}s` }}</span
      >
    </div>
  </section>
</template>
