<script setup lang="ts">
import { ref } from 'vue'
import { Check, CircleHelp, Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from '@lucide/vue'

defineOptions({ name: 'BilibiliCredentialPanel' })

defineProps<{
  modelValue: string
  saved: boolean
  hasStoredCredential: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
  clear: []
}>()

const revealCredential = ref(false)
</script>

<template>
  <aside class="credential-panel" aria-label="B站登录凭证">
    <header>
      <span class="credential-icon"><KeyRound :size="18" /></span>
      <div>
        <div class="credential-title-row">
          <h2>B站登录凭证</h2>
          <span class="credential-help">
            <button type="button" aria-label="查看 SESSDATA 获取与安全说明">
              <CircleHelp :size="15" />
            </button>
            <span class="credential-tooltip" role="tooltip">
              <strong>如何更新 SESSDATA</strong>
              <ol>
                <li>登录 bilibili.com</li>
                <li>打开开发者工具 → Application → Cookies</li>
                <li>复制 SESSDATA 的值，粘贴后保存</li>
              </ol>
              <span class="credential-safety">
                <ShieldCheck :size="14" />
                仅保存在当前浏览器；它等同账号登录凭证，请勿外传。
              </span>
            </span>
          </span>
          <span class="credential-state" :class="{ saved, pending: modelValue && !saved }">
            <Check v-if="saved" :size="12" />
            {{ saved ? '已保存' : modelValue ? '待保存' : '未填写' }}
          </span>
        </div>
      </div>
    </header>

    <label class="credential-field">
      <span>SESSDATA</span>
      <span class="credential-input-wrap">
        <input
          :value="modelValue"
          :type="revealCredential ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          placeholder="粘贴新的 SESSDATA，可仅本次使用"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
        <button
          type="button"
          :aria-label="revealCredential ? '隐藏 SESSDATA' : '显示 SESSDATA'"
          @click="revealCredential = !revealCredential"
        >
          <EyeOff v-if="revealCredential" :size="16" />
          <Eye v-else :size="16" />
        </button>
      </span>
    </label>

    <div class="credential-actions">
      <button
        class="save-credential"
        type="button"
        :disabled="!modelValue.trim() || saved"
        @click="emit('save')"
      >
        {{ saved ? '已保存到本机' : '保存 / 更新凭证' }}
      </button>
      <button
        v-if="modelValue || hasStoredCredential"
        class="clear-credential"
        type="button"
        @click="emit('clear')"
      >
        <Trash2 :size="14" /> 清除
      </button>
    </div>
  </aside>
</template>

<style scoped>
.credential-panel {
  position: relative;
  z-index: 3;
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border-light));
  border-radius: var(--radius-lg);
  background:
    linear-gradient(145deg, rgba(var(--accent-rgb), 0.08), transparent 58%), var(--bg-card);
}

header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.credential-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--accent-bg);
  color: var(--accent);
}

.credential-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
}

.credential-state {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 7px;
  border-radius: var(--radius-pill);
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  font-weight: 700;
}

.credential-help {
  position: relative;
  display: inline-flex;
}

.credential-help > button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  cursor: help;
}

.credential-help > button:hover,
.credential-help > button:focus-visible {
  background: var(--accent-bg);
  color: var(--accent);
}

.credential-tooltip {
  position: absolute;
  z-index: 30;
  top: calc(100% + 7px);
  left: -8px;
  width: min(310px, calc(100vw - 42px));
  padding: 12px 13px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-elevated, var(--bg-card));
  color: var(--text-secondary);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-size-caption);
  line-height: 1.55;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-3px);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    visibility 0.15s ease;
}

.credential-help:hover .credential-tooltip,
.credential-help:focus-within .credential-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.credential-tooltip strong {
  display: block;
  margin-bottom: 5px;
  color: var(--text-primary);
  font-size: var(--font-size-meta);
}

.credential-tooltip ol {
  display: grid;
  gap: 3px;
  margin: 0 0 8px 16px;
}

.credential-state.saved {
  background: var(--success-bg);
  color: var(--success);
}

.credential-state.pending {
  background: var(--warning-bg);
  color: var(--warning);
}

.credential-field {
  display: grid;
  gap: 6px;
}

.credential-field > span:first-child {
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  font-weight: 700;
}

.credential-input-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-input);
}

.credential-input-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.credential-input-wrap input {
  min-width: 0;
  height: 40px;
  padding: 0 11px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-size-small);
}

.credential-input-wrap button {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.credential-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.credential-actions button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 11px;
  border-radius: 8px;
  cursor: pointer;
  font-size: var(--font-size-meta);
  font-weight: 700;
}

.save-credential {
  border: 0;
  background: var(--accent);
  color: var(--accent-contrast);
}

.save-credential:disabled {
  background: var(--bg-subtle);
  color: var(--text-muted);
  cursor: default;
}

.clear-credential {
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-secondary);
}

.credential-safety {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  line-height: 1.55;
}

.credential-safety svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--success);
}
</style>
