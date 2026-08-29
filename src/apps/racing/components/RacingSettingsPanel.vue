<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { CustomSelect, Modal, type SelectOption } from '@/components'
import { DEFAULT_KEY_BINDINGS, type RacingSettings } from '../game'

const props = defineProps<{ open: boolean; settings: RacingSettings }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [value: RacingSettings]
}>()

function cloneSettings(settings: RacingSettings): RacingSettings {
  return { ...settings, keyBindings: { ...settings.keyBindings } }
}

const draft = reactive<RacingSettings>(cloneSettings(props.settings))
watch(
  () => props.open,
  (open) => {
    if (open) Object.assign(draft, cloneSettings(props.settings))
  },
)

const qualityOptions: SelectOption[] = [
  { value: 'low', label: '低画质' },
  { value: 'medium', label: '中画质' },
  { value: 'high', label: '高画质' },
]
const touchOptions: SelectOption[] = [
  { value: 'auto', label: '自动识别' },
  { value: 'on', label: '始终显示' },
  { value: 'off', label: '始终隐藏' },
]
const ghostOptions: SelectOption[] = [
  { value: 'personal', label: '个人最佳' },
  { value: 'gold', label: '金牌目标' },
  { value: 'off', label: '关闭' },
]

const rebinding = ref<string | null>(null)
const keyRows = [
  ['p1Gas', 'P1 油门'],
  ['p1Brake', 'P1 刹车'],
  ['p1Left', 'P1 左转'],
  ['p1Right', 'P1 右转'],
  ['p1Action', 'P1 氮气/道具'],
  ['p1Reset', 'P1 重置'],
  ['p2Gas', 'P2 油门'],
  ['p2Brake', 'P2 刹车'],
  ['p2Left', 'P2 左转'],
  ['p2Right', 'P2 右转'],
  ['p2Action', 'P2 氮气/道具'],
  ['p2Reset', 'P2 重置'],
] as const

function displayKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key === 'Shift') return 'Right Shift'
  return key.replace('Arrow', '方向')
}

function captureKey(event: KeyboardEvent) {
  if (!props.open || !rebinding.value) return
  event.preventDefault()
  event.stopPropagation()
  draft.keyBindings[rebinding.value] = event.key
  rebinding.value = null
}

function restoreKeys() {
  draft.keyBindings = { ...DEFAULT_KEY_BINDINGS }
  rebinding.value = null
}

onMounted(() => window.addEventListener('keydown', captureKey, true))
onUnmounted(() => window.removeEventListener('keydown', captureKey, true))

function save() {
  emit('save', cloneSettings(draft))
  emit('update:open', false)
}
</script>

<template>
  <Modal
    :open="open"
    title="赛车设置"
    width="min(92vw, 680px)"
    dark
    class="racing-settings-modal"
    @update:open="emit('update:open', $event)"
  >
    <div class="settings-grid">
      <section>
        <h3>画面与舒适度</h3>
        <label class="field">
          <span>画质档位</span>
          <CustomSelect v-model="draft.quality" :options="qualityOptions" block />
        </label>
        <label class="range-field">
          <span
            >粒子数量 <b>{{ draft.particles }}%</b></span
          >
          <input v-model.number="draft.particles" type="range" min="0" max="100" />
        </label>
        <label class="switch"
          ><input v-model="draft.cameraShake" type="checkbox" /><span>相机碰撞震动</span></label
        >
        <label class="switch"
          ><input v-model="draft.speedFov" type="checkbox" /><span>高速视野拉伸</span></label
        >
        <label class="switch"
          ><input v-model="draft.largeText" type="checkbox" /><span>放大比赛文字</span></label
        >
        <label class="switch"
          ><input v-model="draft.colorAssist" type="checkbox" /><span>色弱辅助标记</span></label
        >
      </section>

      <section>
        <h3>操控与幽灵</h3>
        <label class="range-field">
          <span
            >转向灵敏度 <b>{{ draft.steeringSensitivity.toFixed(1) }}</b></span
          >
          <input
            v-model.number="draft.steeringSensitivity"
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
          />
        </label>
        <label class="switch"
          ><input v-model="draft.autoAccelerate" type="checkbox" /><span>自动加速</span></label
        >
        <label class="field">
          <span>触摸按钮</span>
          <CustomSelect
            :model-value="
              draft.touchControls === true ? 'on' : draft.touchControls === false ? 'off' : 'auto'
            "
            :options="touchOptions"
            block
            @update:model-value="
              draft.touchControls = $event === 'on' ? true : $event === 'off' ? false : 'auto'
            "
          />
        </label>
        <label class="field">
          <span>计时赛幽灵</span>
          <CustomSelect v-model="draft.ghostMode" :options="ghostOptions" block />
        </label>
        <label class="range-field">
          <span
            >幽灵透明度 <b>{{ Math.round(draft.ghostOpacity * 100) }}%</b></span
          >
          <input v-model.number="draft.ghostOpacity" type="range" min="0.1" max="0.7" step="0.05" />
        </label>
      </section>

      <section class="audio-section">
        <h3>声音</h3>
        <label class="range-field"
          ><span
            >总音量 <b>{{ Math.round(draft.masterVolume * 100) }}%</b></span
          ><input v-model.number="draft.masterVolume" type="range" min="0" max="1" step="0.05"
        /></label>
        <label class="range-field"
          ><span
            >引擎音量 <b>{{ Math.round(draft.engineVolume * 100) }}%</b></span
          ><input v-model.number="draft.engineVolume" type="range" min="0" max="1" step="0.05"
        /></label>
        <label class="range-field"
          ><span
            >效果音 <b>{{ Math.round(draft.effectsVolume * 100) }}%</b></span
          ><input v-model.number="draft.effectsVolume" type="range" min="0" max="1" step="0.05"
        /></label>
      </section>

      <section class="keys-section">
        <div class="section-heading">
          <h3>按键映射</h3>
          <button type="button" class="text-btn" @click="restoreKeys">恢复默认</button>
        </div>
        <div class="key-grid">
          <button
            v-for="[key, label] in keyRows"
            :key="key"
            type="button"
            :class="['key-row', { listening: rebinding === key }]"
            @click="rebinding = key"
          >
            <span>{{ label }}</span>
            <kbd>{{ rebinding === key ? '请按键…' : displayKey(draft.keyBindings[key]) }}</kbd>
          </button>
        </div>
      </section>
    </div>
    <template #footer>
      <button type="button" class="secondary-btn" @click="emit('update:open', false)">取消</button>
      <button type="button" class="primary-btn" @click="save">保存设置</button>
    </template>
  </Modal>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  color: #edf1ff;
}
section {
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
}
.audio-section,
.keys-section {
  grid-column: 1/-1;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-heading h3 {
  margin: 0;
}
.text-btn {
  border: 0;
  color: #ff9b7f;
  background: transparent;
  cursor: pointer;
}
.key-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
.key-row {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #dce2f1;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
}
.key-row.listening {
  border-color: #ff8062;
  box-shadow: 0 0 0 2px rgba(255, 128, 98, 0.15);
}
.key-row kbd {
  color: #fff;
  font: 700 var(--font-size-small) / 1 system-ui;
}
h3 {
  margin: 0 0 14px;
  font-size: var(--font-size-body-lg);
}
.field,
.range-field {
  display: block;
  margin-top: 14px;
}
.field > span,
.range-field > span {
  display: flex;
  justify-content: space-between;
  margin-bottom: 7px;
  color: #b8bfd2;
  font-size: var(--font-size-control);
}
.range-field b {
  color: #ff9172;
}
input[type='range'] {
  width: 100%;
  accent-color: #ff765d;
}
.switch {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  color: #d8ddec;
  font-size: var(--font-size-body);
}
.switch input {
  width: 18px;
  height: 18px;
  accent-color: #ff765d;
}
.primary-btn,
.secondary-btn {
  min-height: 40px;
  padding: 0 18px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 700;
}
.primary-btn {
  border: 0;
  color: white;
  background: linear-gradient(110deg, #ff6b55, #ff9a61);
}
.secondary-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #e5e9f5;
  background: rgba(255, 255, 255, 0.06);
}
@media (max-width: 640px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .audio-section,
  .keys-section {
    grid-column: auto;
  }
  .key-grid {
    grid-template-columns: 1fr;
  }
}
</style>
