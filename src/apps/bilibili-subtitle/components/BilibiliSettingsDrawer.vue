<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { RotateCcw, Settings2, Trash2 } from '@lucide/vue'
import Drawer from '@/components/common/Drawer.vue'
import { DEFAULT_BILIBILI_SUBTITLE_SETTINGS, type BilibiliSubtitleSettings } from '../settings'

defineOptions({ name: 'BilibiliSettingsDrawer' })

const props = defineProps<{
  open: boolean
  settings: BilibiliSubtitleSettings
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [settings: BilibiliSubtitleSettings]
  clearCache: []
}>()

const draft = reactive<BilibiliSubtitleSettings>({ ...props.settings })
const cacheCleared = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(draft, props.settings)
    cacheCleared.value = false
  },
)

function save() {
  emit('save', { ...draft })
  emit('update:open', false)
}

function reset() {
  Object.assign(draft, DEFAULT_BILIBILI_SUBTITLE_SETTINGS)
}

function clearCache() {
  emit('clearCache')
  cacheCleared.value = true
}
</script>

<template>
  <Drawer
    :open="open"
    side="right"
    title="字幕工作台设置"
    width="min(400px, 92vw)"
    @update:open="emit('update:open', $event)"
  >
    <div class="settings-content">
      <div class="settings-intro">
        <span><Settings2 :size="17" /></span>
        <p>设置仅保存在当前浏览器，下次进入工作台时继续生效。</p>
      </div>

      <section class="settings-section">
        <header>
          <strong>提取流程</strong>
          <small>决定解析视频后如何继续。</small>
        </header>

        <label class="setting-row">
          <span>
            <strong>自动生成字幕</strong>
            <small>视频解析成功后，按默认分P范围直接提取字幕。</small>
          </span>
          <input v-model="draft.autoExtractAfterParse" class="switch" type="checkbox" />
        </label>

        <div class="setting-row vertical">
          <span>
            <strong>默认分P范围</strong>
            <small>多分P视频解析后默认选择第一P或全部分P。</small>
          </span>
          <div class="segmented" role="group" aria-label="默认分P范围">
            <button
              type="button"
              :class="{ active: draft.defaultPageMode === 'first' }"
              @click="draft.defaultPageMode = 'first'"
            >
              第一P
            </button>
            <button
              type="button"
              :class="{ active: draft.defaultPageMode === 'all' }"
              @click="draft.defaultPageMode = 'all'"
            >
              全部分P
            </button>
          </div>
          <p v-if="draft.defaultPageMode === 'all'" class="setting-warning">
            全部分P会产生更多字幕与 AI 分析请求。
          </p>
        </div>

        <label class="setting-row">
          <span>
            <strong>字幕生成后收起来源与凭证</strong>
            <small>让字幕和分析区域立即占满剩余页面。</small>
          </span>
          <input v-model="draft.collapseSetupAfterExtract" class="switch" type="checkbox" />
        </label>
      </section>

      <section class="settings-section">
        <header>
          <strong>AI 分析</strong>
          <small>控制自动分析与结果复用。</small>
        </header>

        <label class="setting-row">
          <span>
            <strong>字幕生成后自动分析内容概览</strong>
            <small>自动使用当前模型，可能消耗模型额度。</small>
          </span>
          <input v-model="draft.autoAnalyzeOverview" class="switch" type="checkbox" />
        </label>

        <label class="setting-row">
          <span>
            <strong>分析开始后收起模型设置</strong>
            <small>为分析结果与后续追问保留更多高度。</small>
          </span>
          <input v-model="draft.collapseAnalysisConfigAfterStart" class="switch" type="checkbox" />
        </label>

        <label class="setting-row">
          <span>
            <strong>优先使用本地分析缓存</strong>
            <small>相同字幕、类型和模型不重复请求 AI。</small>
          </span>
          <input v-model="draft.useAnalysisCache" class="switch" type="checkbox" />
        </label>
      </section>

      <section class="settings-section">
        <header>
          <strong>字幕显示</strong>
          <small>设置每次进入工作台的初始显示方式。</small>
        </header>

        <label class="setting-row">
          <span>
            <strong>默认显示时间戳</strong>
            <small>字幕提取后优先展示带时间戳的文本。</small>
          </span>
          <input v-model="draft.showTimestampsByDefault" class="switch" type="checkbox" />
        </label>
      </section>

      <section class="settings-section cache-section">
        <header>
          <strong>本地数据</strong>
          <small>分析缓存最多保留最近生成的 30 条。</small>
        </header>
        <button class="clear-cache" type="button" @click="clearCache">
          <Trash2 :size="14" /> {{ cacheCleared ? '分析缓存已清空' : '清空分析缓存' }}
        </button>
      </section>
    </div>

    <div class="settings-actions">
      <button class="reset-settings" type="button" @click="reset">
        <RotateCcw :size="14" /> 恢复默认
      </button>
      <button class="save-settings" type="button" @click="save">保存设置</button>
    </div>
  </Drawer>
</template>

<style scoped>
.settings-content {
  display: grid;
  gap: 14px;
  padding-bottom: 76px;
}

.settings-intro {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 11px;
  border-radius: 10px;
  background: var(--accent-bg);
  color: var(--accent);
}

.settings-intro p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  line-height: 1.5;
}

.settings-section {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
}

.settings-section > header {
  display: grid;
  gap: 2px;
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-subtle);
}

.settings-section > header strong {
  color: var(--text-primary);
  font-size: var(--font-size-small);
}

.settings-section > header small,
.setting-row small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  line-height: 1.5;
}

.setting-row {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
}

.setting-row:last-child {
  border-bottom: 0;
}

.setting-row > span {
  display: grid;
  gap: 2px;
}

.setting-row > span strong {
  color: var(--text-primary);
  font-size: var(--font-size-meta);
}

.setting-row.vertical {
  display: grid;
  justify-content: stretch;
  gap: 8px;
}

.switch {
  width: 34px;
  height: 19px;
  flex: 0 0 auto;
  appearance: none;
  border-radius: var(--radius-pill);
  background: var(--border);
  cursor: pointer;
  transition: background 0.18s ease;
}

.switch::before {
  display: block;
  width: 15px;
  height: 15px;
  margin: 2px;
  border-radius: 50%;
  background: white;
  box-shadow: var(--shadow-xs);
  content: '';
  transition: transform 0.18s ease;
}

.switch:checked {
  background: var(--accent);
}

.switch:checked::before {
  transform: translateX(15px);
}

.segmented {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  padding: 3px;
  border-radius: 9px;
  background: var(--bg-subtle);
}

.segmented button {
  min-height: 30px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.segmented button.active {
  background: var(--accent-bg);
  color: var(--accent);
}

.setting-warning {
  margin: 0;
  color: var(--warning);
  font-size: var(--font-size-caption);
}

.cache-section {
  padding-bottom: 11px;
}

.clear-cache {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-self: start;
  gap: 6px;
  margin: 11px 12px 0;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border-light));
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--danger);
  cursor: pointer;
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.settings-actions {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-light);
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  backdrop-filter: blur(12px);
}

.settings-actions button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 13px;
  border-radius: 9px;
  cursor: pointer;
  font-size: var(--font-size-meta);
  font-weight: 700;
}

.reset-settings {
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-secondary);
}

.save-settings {
  border: 0;
  background: var(--accent);
  color: var(--accent-contrast);
}
</style>
