<script setup lang="ts">
import { computed, watch } from 'vue'
import { Check, Copy, Plus, Search, X } from '@lucide/vue'
import CustomSelect, { type SelectOption } from '@/components/common/CustomSelect.vue'
import type { ApiItem } from '../defaults'
import type { ApiCollection, SavedRequest } from '../types'
import { useWorkspaceRequestPicker } from '../useWorkspaceRequestPicker'

defineOptions({ name: 'WorkspaceRequestPicker' })

const props = defineProps<{
  apis: ApiItem[]
  catalogApis: ApiItem[]
  savedRequests: SavedRequest[]
  collections: ApiCollection[]
  activeCollectionId: string
  activeCollectionName: string
}>()

const emit = defineEmits<{
  close: []
  append: [requests: SavedRequest[]]
  create: [api: ApiItem, saved?: SavedRequest]
  notify: [type: 'success' | 'error' | 'warning' | 'info', message: string]
}>()

const methodOptions: SelectOption[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({
  value,
  label: value,
}))

const activeCollectionRequests = computed(() =>
  props.savedRequests.filter((request) => request.collectionId === props.activeCollectionId),
)

const {
  showWorkspaceRequestPicker,
  workspacePickerTab,
  workspacePickerSearch,
  workspacePickerMethod,
  workspaceSelectedApiIds,
  workspaceSelectedSavedIds,
  workspaceCustomErrors,
  workspaceCustomMode,
  workspaceCurlCommand,
  workspaceCurlError,
  workspaceCustomRequest,
  workspaceMethodOptions,
  workspaceCatalogApis,
  workspaceReusableRequests,
  workspacePickerSelectionCount,
  workspaceCurlPreview,
  apiForSavedRequest,
  collectionNameForSavedRequest,
  resetWorkspaceCustomRequest,
  openWorkspaceRequestPicker,
  selectWorkspacePickerTab,
  selectWorkspaceCustomMode,
  handleWorkspacePickerKeydown,
  toggleWorkspaceApiSelection,
  toggleWorkspaceSavedSelection,
  addSelectedCatalogRequests,
  addSelectedSavedRequests,
  createWorkspaceCustomRequest,
  createWorkspaceCurlRequest,
} = useWorkspaceRequestPicker({
  apis: computed(() => props.apis),
  catalogApis: computed(() => props.catalogApis),
  savedRequests: computed(() => props.savedRequests),
  collections: computed(() => props.collections),
  activeCollectionId: computed(() => props.activeCollectionId),
  activeCollectionName: computed(() => props.activeCollectionName),
  appendRequests: (requests) => emit('append', requests),
  addCreatedRequest: (api, saved) => emit('create', api, saved),
  notify: (type, message) => emit('notify', type, message),
})

openWorkspaceRequestPicker()
watch(showWorkspaceRequestPicker, (visible) => {
  if (!visible) emit('close')
})
</script>

<template>
  <Transition name="request-picker" appear>
    <div
      v-if="showWorkspaceRequestPicker"
      class="workspace-request-picker-layer"
      @click.self="showWorkspaceRequestPicker = false"
      @keydown.capture="handleWorkspacePickerKeydown"
    >
      <section
        class="workspace-request-picker"
        role="dialog"
        aria-modal="false"
        aria-labelledby="workspace-request-picker-title"
      >
        <header class="request-picker-header">
          <div>
            <span><Plus :size="17" /></span>
            <div>
              <h2 id="workspace-request-picker-title">添加请求</h2>
              <p>添加到「{{ activeCollectionName }}」</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭请求选择器"
            @click="showWorkspaceRequestPicker = false"
          >
            <X :size="19" />
          </button>
        </header>

        <nav class="request-picker-tabs" role="tablist" aria-label="请求来源">
          <button
            type="button"
            role="tab"
            :aria-selected="workspacePickerTab === 'catalog'"
            :class="{ active: workspacePickerTab === 'catalog' }"
            @click="selectWorkspacePickerTab('catalog')"
          >
            API 目录
            <span>{{ catalogApis.length }}</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="workspacePickerTab === 'saved'"
            :class="{ active: workspacePickerTab === 'saved' }"
            @click="selectWorkspacePickerTab('saved')"
          >
            已保存请求
            <span>{{ workspaceReusableRequests.length }}</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="workspacePickerTab === 'custom'"
            :class="{ active: workspacePickerTab === 'custom' }"
            @click="selectWorkspacePickerTab('custom')"
          >
            自定义请求
          </button>
        </nav>

        <div
          v-if="workspacePickerTab !== 'custom'"
          class="request-picker-toolbar"
          :class="{ 'saved-only': workspacePickerTab === 'saved' }"
        >
          <label>
            <Search :size="16" />
            <input
              v-model="workspacePickerSearch"
              type="search"
              autofocus
              :placeholder="
                workspacePickerTab === 'catalog'
                  ? '搜索 API 名称、分类或 URL'
                  : '搜索已保存请求'
              "
            />
          </label>
          <CustomSelect
            v-if="workspacePickerTab === 'catalog'"
            v-model="workspacePickerMethod"
            :options="workspaceMethodOptions"
            size="sm"
            width="142px"
          />
        </div>

        <div v-if="workspacePickerTab === 'catalog'" class="request-picker-body">
          <div class="request-picker-result-meta">
            <span>{{ workspaceCatalogApis.length }} 个可用 API</span>
            <button
              v-if="workspaceSelectedApiIds.length"
              type="button"
              @click="workspaceSelectedApiIds = []"
            >
              清空选择
            </button>
          </div>
          <div class="request-source-list vc-scrollbar vc-scrollbar--thin">
            <button
              v-for="api in workspaceCatalogApis"
              :key="api.id"
              type="button"
              :class="{ selected: workspaceSelectedApiIds.includes(api.id) }"
              :aria-pressed="workspaceSelectedApiIds.includes(api.id)"
              @click="toggleWorkspaceApiSelection(api.id)"
            >
              <span class="request-source-check">
                <Check v-if="workspaceSelectedApiIds.includes(api.id)" :size="14" />
              </span>
              <span class="method-chip" :class="api.method.toLowerCase()">{{ api.method }}</span>
              <span class="request-source-copy">
                <strong>{{ api.name }}</strong>
                <code>{{ api.url }}</code>
              </span>
              <span class="request-source-meta">
                <small>{{ api.category }}</small>
                <b v-if="activeCollectionRequests.filter((item) => item.apiId === api.id).length">
                  已有 {{ activeCollectionRequests.filter((item) => item.apiId === api.id).length }}
                </b>
              </span>
            </button>
          </div>
        </div>

        <div v-else-if="workspacePickerTab === 'saved'" class="request-picker-body">
          <div class="request-picker-result-meta">
            <span>{{ workspaceReusableRequests.length }} 个可复用请求</span>
            <button
              v-if="workspaceSelectedSavedIds.length"
              type="button"
              @click="workspaceSelectedSavedIds = []"
            >
              清空选择
            </button>
          </div>
          <div
            v-if="workspaceReusableRequests.length"
            class="request-source-list saved-sources vc-scrollbar vc-scrollbar--thin"
          >
            <button
              v-for="saved in workspaceReusableRequests"
              :key="saved.id"
              type="button"
              :class="{ selected: workspaceSelectedSavedIds.includes(saved.id) }"
              :aria-pressed="workspaceSelectedSavedIds.includes(saved.id)"
              @click="toggleWorkspaceSavedSelection(saved.id)"
            >
              <span class="request-source-check">
                <Check v-if="workspaceSelectedSavedIds.includes(saved.id)" :size="14" />
              </span>
              <span class="method-chip" :class="apiForSavedRequest(saved)?.method.toLowerCase()">
                {{ apiForSavedRequest(saved)?.method || 'API' }}
              </span>
              <span class="request-source-copy">
                <strong>{{ saved.name }}</strong>
                <code>{{ apiForSavedRequest(saved)?.url || '原始 API 已不存在' }}</code>
              </span>
              <span class="request-source-meta">
                <small>{{ collectionNameForSavedRequest(saved) }}</small>
                <b>{{ saved.extractions?.length || 0 }} 提取</b>
              </span>
            </button>
          </div>
          <div v-else class="request-picker-empty">
            <Copy :size="26" />
            <strong>没有其他集合里的已保存请求</strong>
          </div>
        </div>

        <form
          v-else
          class="workspace-custom-request-form"
          @submit.prevent="
            workspaceCustomMode === 'form'
              ? createWorkspaceCustomRequest()
              : createWorkspaceCurlRequest()
          "
        >
          <div class="custom-request-heading">
            <div>
              <strong>快速创建</strong>
              <p>手动配置请求，或者粘贴现成的 cURL。</p>
            </div>
            <nav class="custom-request-mode" aria-label="自定义请求创建方式">
              <button
                type="button"
                :class="{ active: workspaceCustomMode === 'form' }"
                @click="selectWorkspaceCustomMode('form')"
              >
                手动配置
              </button>
              <button
                type="button"
                :class="{ active: workspaceCustomMode === 'curl' }"
                @click="selectWorkspaceCustomMode('curl')"
              >
                导入 cURL
              </button>
            </nav>
          </div>

          <template v-if="workspaceCustomMode === 'form'">
            <label>
              <span>请求名称 <b>*</b></span>
              <input v-model="workspaceCustomRequest.name" type="text" placeholder="例如：获取当前用户" />
              <small v-if="workspaceCustomErrors.name">{{ workspaceCustomErrors.name }}</small>
            </label>
            <div class="custom-request-url-row">
              <label>
                <span>方法</span>
                <CustomSelect
                  v-model="workspaceCustomRequest.method"
                  :options="methodOptions"
                  size="sm"
                  block
                />
              </label>
              <label>
                <span>请求地址 <b>*</b></span>
                <input
                  v-model="workspaceCustomRequest.url"
                  type="text"
                  placeholder="https://api.example.com/users"
                />
                <small v-if="workspaceCustomErrors.url">{{ workspaceCustomErrors.url }}</small>
              </label>
            </div>
            <label>
              <span>分类</span>
              <input v-model="workspaceCustomRequest.category" type="text" placeholder="自定义" />
            </label>
            <label>
              <span>用途说明</span>
              <textarea
                v-model="workspaceCustomRequest.description"
                rows="4"
                placeholder="这个请求会完成什么任务？"
              ></textarea>
            </label>
          </template>

          <template v-else>
            <label class="curl-command-field">
              <span>cURL 命令 <b>*</b></span>
              <textarea
                v-model="workspaceCurlCommand"
                rows="8"
                spellcheck="false"
                placeholder="curl 'https://api.example.com/users' -H 'Authorization: Bearer ...'"
                @input="workspaceCurlError = ''"
              ></textarea>
              <small v-if="workspaceCurlError">{{ workspaceCurlError }}</small>
            </label>
            <div v-if="workspaceCurlPreview" class="curl-import-preview">
              <span class="method-chip" :class="workspaceCurlPreview.method.toLowerCase()">
                {{ workspaceCurlPreview.method }}
              </span>
              <code>{{ workspaceCurlPreview.url }}</code>
              <small>
                {{ workspaceCurlPreview.headers.length }} Headers ·
                {{ workspaceCurlPreview.basicAuth ? 'Basic Auth ·' : '' }}
                {{ workspaceCurlPreview.body ? '包含请求体' : '无请求体' }}
              </small>
            </div>
            <div class="curl-meta-row">
              <label>
                <span>请求名称</span>
                <input
                  v-model="workspaceCustomRequest.name"
                  type="text"
                  :placeholder="workspaceCurlPreview?.suggestedName || '自动生成'"
                />
              </label>
              <label>
                <span>分类</span>
                <input v-model="workspaceCustomRequest.category" type="text" placeholder="自定义" />
              </label>
            </div>
          </template>

          <label class="catalog-save-option">
            <input v-model="workspaceCustomRequest.addToCatalog" type="checkbox" />
            <span></span>
            <div>
              <strong>同时添加到 API 目录</strong>
              <small>关闭时只在当前工作区和复用请求中可见</small>
            </div>
          </label>
          <footer>
            <button type="button" @click="resetWorkspaceCustomRequest">重置</button>
            <button class="primary" type="submit">
              <Plus :size="15" />
              {{ workspaceCustomMode === 'form' ? '创建并添加' : '导入并添加' }}
            </button>
          </footer>
        </form>

        <footer v-if="workspacePickerTab !== 'custom'" class="request-picker-footer">
          <span>已选择 {{ workspacePickerSelectionCount }} 个</span>
          <div>
            <button type="button" @click="showWorkspaceRequestPicker = false">取消</button>
            <button
              class="primary"
              type="button"
              :disabled="!workspacePickerSelectionCount"
              @click="
                workspacePickerTab === 'catalog'
                  ? addSelectedCatalogRequests()
                  : addSelectedSavedRequests()
              "
            >
              <Plus :size="15" />
              添加 {{ workspacePickerSelectionCount || '' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
button,
input,
textarea {
  color: inherit;
  font: inherit;
}

button {
  border: 0;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 3px solid rgba(var(--accent-rgb), 0.22);
  outline-offset: 2px;
}

svg {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.method-chip {
  display: inline-flex;
  min-width: 43px;
  height: 23px;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--font-size-meta);
  font-weight: 850;
  letter-spacing: -0.04em;
}

.get {
  background: rgba(21, 163, 109, 0.12);
  color: var(--lab-green);
}

.post {
  background: rgba(213, 139, 33, 0.13);
  color: var(--lab-amber);
}

.put,
.patch {
  background: rgba(109, 93, 252, 0.12);
  color: var(--lab-violet);
}

.delete {
  background: rgba(220, 90, 100, 0.12);
  color: var(--lab-red);
}

.workspace-request-picker-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  justify-content: flex-end;
  background: rgba(20, 28, 46, 0.22);
  backdrop-filter: blur(2px);
}

.workspace-request-picker {
  display: flex;
  width: min(700px, calc(100% - 80px));
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--border-light);
  background: var(--bg-card);
  box-shadow: -18px 0 48px rgba(24, 35, 58, 0.15);
}

.request-picker-header {
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-light);
}

.request-picker-header > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}

.request-picker-header > div > span {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: rgba(98, 85, 232, 0.1);
  color: #6255e8;
}

.request-picker-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-title-lg);
}

.request-picker-header p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-small);
}

.request-picker-header > button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.request-picker-header > button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.request-picker-tabs {
  display: flex;
  min-height: 48px;
  align-items: flex-end;
  gap: 22px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-light);
}

.request-picker-tabs button {
  display: inline-flex;
  height: 48px;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-control);
  font-weight: 720;
}

.request-picker-tabs button.active {
  border-bottom-color: #6255e8;
  color: #6255e8;
}

.request-picker-tabs span {
  display: grid;
  min-width: 21px;
  height: 20px;
  place-items: center;
  border-radius: 6px;
  background: var(--bg-subtle);
  color: inherit;
  font-size: var(--font-size-caption);
}

.request-picker-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 142px;
  gap: 9px;
  padding: 14px 20px 10px;
}

.request-picker-toolbar.saved-only {
  grid-template-columns: 1fr;
}

.request-picker-toolbar > label {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-input);
  color: var(--text-muted);
}

.request-picker-toolbar input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-control);
}

.request-picker-toolbar :deep(.select-trigger) {
  height: 38px;
}

.request-picker-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.request-picker-result-meta {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  color: var(--text-muted);
  font-size: var(--font-size-meta);
}

.request-picker-result-meta button {
  background: transparent;
  color: #6255e8;
  cursor: pointer;
  font-size: var(--font-size-meta);
}

.request-source-list {
  display: grid;
  min-height: 0;
  overflow: auto;
  align-content: start;
  padding: 0 12px 14px;
}

.request-source-list > button {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 26px 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 11px 9px;
  border-top: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.request-source-list > button:first-child {
  border-top: 0;
}

.request-source-list > button:hover {
  background: color-mix(in srgb, var(--bg-hover) 72%, transparent);
}

.request-source-list > button.selected {
  border-radius: 9px;
  background: rgba(98, 85, 232, 0.08);
}

.request-source-check {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: #fff;
}

.request-source-list > button.selected .request-source-check {
  border-color: #6255e8;
  background: #6255e8;
}

.request-source-list .method-chip {
  justify-self: start;
}

.request-source-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.request-source-copy strong {
  overflow: hidden;
  font-size: var(--font-size-control);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-source-copy code {
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-source-meta {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 5px;
}

.request-source-meta small {
  max-width: 100px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-source-meta b {
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  font-weight: 650;
}

.request-picker-empty {
  display: grid;
  min-height: 260px;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--text-muted);
}

.request-picker-empty strong {
  color: var(--text-secondary);
  font-size: var(--font-size-control);
}

.request-picker-footer {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
}

.request-picker-footer > span {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}

.request-picker-footer > div {
  display: flex;
  gap: 8px;
}

.request-picker-footer button,
.workspace-custom-request-form footer button {
  display: inline-flex;
  height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 13px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-small);
  font-weight: 700;
}

.request-picker-footer button.primary,
.workspace-custom-request-form footer button.primary {
  border-color: #6255e8;
  background: #6255e8;
  color: #fff;
}

.request-picker-footer button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.workspace-custom-request-form {
  display: grid;
  min-height: 0;
  overflow: auto;
  gap: 15px;
  padding: 22px 24px;
}

.custom-request-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 4px;
}

.custom-request-heading strong {
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
}

.custom-request-heading p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-small);
}

.custom-request-mode {
  display: flex;
  flex: 0 0 auto;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-subtle);
}

.custom-request-mode button {
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-meta);
  font-weight: 700;
}

.custom-request-mode button.active {
  background: var(--bg-card);
  box-shadow: 0 1px 4px rgba(20, 29, 48, 0.08);
  color: #6255e8;
}

.workspace-custom-request-form > label,
.custom-request-url-row > label,
.curl-meta-row > label {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.workspace-custom-request-form label > span {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  font-weight: 700;
}

.workspace-custom-request-form label b {
  color: var(--danger);
}

.workspace-custom-request-form input,
.workspace-custom-request-form textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  outline: 0;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--font-size-control);
}

.workspace-custom-request-form input {
  height: 40px;
  padding: 0 11px;
}

.workspace-custom-request-form textarea {
  resize: vertical;
  padding: 10px 11px;
  line-height: 1.55;
}

.workspace-custom-request-form input:focus,
.workspace-custom-request-form textarea:focus {
  border-color: rgba(98, 85, 232, 0.55);
  box-shadow: 0 0 0 3px rgba(98, 85, 232, 0.08);
}

.workspace-custom-request-form label > small {
  color: var(--danger);
  font-size: var(--font-size-meta);
}

.custom-request-url-row {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 10px;
}

.custom-request-url-row :deep(.select-trigger) {
  height: 40px;
}

.curl-command-field textarea {
  min-height: 174px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-size-small);
}

.curl-import-preview {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 7px 9px;
  padding: 11px;
  border: 1px solid rgba(98, 85, 232, 0.2);
  border-radius: 9px;
  background: rgba(98, 85, 232, 0.055);
}

.curl-import-preview code {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-size-small);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.curl-import-preview small {
  grid-column: 2;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.curl-meta-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workspace-custom-request-form > .catalog-save-option {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-subtle);
  cursor: pointer;
}

.catalog-save-option > input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
}

.catalog-save-option > span {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--border);
  transition: 0.18s ease;
}

.catalog-save-option > span::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(20, 29, 48, 0.22);
  content: '';
  transition: 0.18s ease;
}

.catalog-save-option > input:checked + span {
  background: #6255e8;
}

.catalog-save-option > input:checked + span::after {
  transform: translateX(14px);
}

.catalog-save-option > input:focus-visible + span {
  outline: 3px solid rgba(98, 85, 232, 0.18);
}

.catalog-save-option > div {
  display: grid;
  gap: 3px;
}

.catalog-save-option strong {
  color: var(--text-primary);
  font-size: var(--font-size-small);
}

.catalog-save-option small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.workspace-custom-request-form footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.request-picker-enter-active,
.request-picker-leave-active {
  transition: opacity 0.18s ease;
}

.request-picker-enter-active .workspace-request-picker,
.request-picker-leave-active .workspace-request-picker {
  transition: transform 0.2s ease;
}

.request-picker-enter-from,
.request-picker-leave-to {
  opacity: 0;
}

.request-picker-enter-from .workspace-request-picker,
.request-picker-leave-to .workspace-request-picker {
  transform: translateX(24px);
}

@media (max-width: 760px) {
  .workspace-request-picker {
    width: 100%;
  }

  .request-picker-tabs {
    gap: 12px;
    overflow-x: auto;
  }

  .request-picker-tabs button {
    flex: 0 0 auto;
  }

  .request-picker-toolbar {
    grid-template-columns: 1fr;
  }

  .custom-request-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .custom-request-mode {
    align-self: flex-start;
  }

  .curl-meta-row {
    grid-template-columns: 1fr;
  }

  .request-source-list > button {
    grid-template-columns: 24px 48px minmax(0, 1fr);
  }

  .request-source-meta {
    display: none;
  }

  .custom-request-url-row {
    grid-template-columns: 1fr;
  }
}
</style>
