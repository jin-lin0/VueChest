<script setup lang="ts">
import { computed } from 'vue'
import { CustomSelect, type SelectOption } from '@/components'
import { Flag, Gauge, Gamepad2, Settings, Shuffle, Timer, Trophy, Zap } from '@lucide/vue'
import {
  MODE_LABELS,
  TRACKS,
  normalizeRaceConfig,
  type RaceConfig,
  type RaceMode,
  type TrackId,
} from '../game'

const props = defineProps<{ config: RaceConfig }>()
const emit = defineEmits<{
  'update:config': [value: RaceConfig]
  start: []
  back: []
  settings: []
}>()

const model = computed({
  get: () => props.config,
  set: (value: RaceConfig) => emit('update:config', normalizeRaceConfig(value)),
})

const modeOptions = computed<SelectOption[]>(() => {
  const all = (Object.keys(MODE_LABELS) as RaceMode[]).map((value) => ({ value, label: MODE_LABELS[value].label }))
  if (model.value.localPlayers === 2) {
    return all.filter((option) => option.value === 'quick' || option.value === 'item-battle')
  }
  return all
})

const trackOptions: SelectOption[] = [
  ...Object.values(TRACKS).map((track) => ({ value: track.id, label: track.name })),
  { value: 'random', label: '无限赛道' },
]
const difficultyOptions: SelectOption[] = [
  { value: 'casual', label: '休闲' },
  { value: 'standard', label: '标准' },
  { value: 'expert', label: '专家' },
]
const lapsOptions: SelectOption[] = [1, 3, 5].map((value) => ({ value, label: `${value} 圈` }))
const aiOptions: SelectOption[] = [0, 1, 2, 3].map((value) => ({ value, label: `${value} 名 AI` }))

function patchConfig(patch: Partial<RaceConfig>) {
  model.value = { ...model.value, ...patch }
}

const selectedTrack = computed(() =>
  model.value.trackId === 'random' ? null : TRACKS[model.value.trackId],
)

const modeDescription = computed(() => MODE_LABELS[model.value.mode].description)
const isLockedRace = computed(() => ['time-trial', 'knockout', 'item-battle', 'championship'].includes(model.value.mode))
</script>

<template>
  <section class="race-setup" aria-labelledby="race-setup-title">
    <header class="setup-header">
      <button type="button" class="icon-btn" aria-label="返回车库" @click="emit('back')">
        <Flag :size="20" />
      </button>
      <div>
        <p class="eyebrow">RACE CONTROL</p>
        <h2 id="race-setup-title">配置比赛</h2>
      </div>
      <button type="button" class="icon-btn" aria-label="打开赛车设置" @click="emit('settings')">
        <Settings :size="20" />
      </button>
    </header>

    <div class="mode-grid" role="list" aria-label="比赛模式">
      <button
        v-for="option in modeOptions"
        :key="option.value"
        type="button"
        :class="['mode-card', { active: model.mode === option.value }]"
        @click="patchConfig({ mode: option.value as RaceMode })"
      >
        <Timer v-if="option.value === 'time-trial'" :size="21" />
        <Trophy v-else-if="option.value === 'championship'" :size="21" />
        <Zap v-else-if="option.value === 'item-battle'" :size="21" />
        <Gauge v-else :size="21" />
        <span>{{ option.label }}</span>
      </button>
    </div>
    <p class="mode-copy">{{ modeDescription }}</p>

    <div class="track-preview" :style="{ '--track-accent': selectedTrack?.accent || '#ff7456' }">
      <div class="track-icon">
        <Shuffle v-if="model.trackId === 'random'" :size="26" />
        <Flag v-else :size="26" />
      </div>
      <div>
        <strong>{{ selectedTrack?.name || '无限赛道' }}</strong>
        <span>{{ selectedTrack?.subtitle || '每局生成不同路线，不记录奖牌与幽灵' }}</span>
      </div>
      <span v-if="selectedTrack" class="difficulty-chip">{{ selectedTrack.difficulty }}</span>
    </div>

    <div class="setup-fields">
      <label>
        <span>赛道</span>
        <CustomSelect
          :model-value="model.trackId"
          :options="trackOptions"
          block
          @update:model-value="patchConfig({ trackId: $event as TrackId })"
        />
      </label>
      <label>
        <span>难度</span>
        <CustomSelect
          :model-value="model.difficulty"
          :options="difficultyOptions"
          block
          @update:model-value="patchConfig({ difficulty: $event as RaceConfig['difficulty'] })"
        />
      </label>
      <label>
        <span>圈数</span>
        <CustomSelect
          :model-value="model.laps"
          :options="lapsOptions"
          :disabled="isLockedRace"
          block
          @update:model-value="patchConfig({ laps: $event as RaceConfig['laps'] })"
        />
      </label>
      <label>
        <span>AI 对手</span>
        <CustomSelect
          :model-value="model.aiCount"
          :options="aiOptions"
          :disabled="model.mode !== 'quick' || model.localPlayers === 2"
          block
          @update:model-value="patchConfig({ aiCount: $event as RaceConfig['aiCount'] })"
        />
      </label>
    </div>

    <div class="setup-summary">
      <Gamepad2 :size="18" />
      <span>{{ model.localPlayers === 2 ? '本地双人分屏' : `${model.aiCount} 名 AI 对手` }}</span>
      <span>·</span>
      <span>{{ model.laps }} 圈</span>
    </div>
    <p v-if="model.aiCount > 0" class="ai-roster">
      同车辆物理 · AI 性格：进攻 · 稳健 · 漂移 · 极速
    </p>

    <button type="button" class="launch-btn" @click="emit('start')">
      <span>进入赛道</span>
      <Zap :size="20" fill="currentColor" />
    </button>
  </section>
</template>

<style scoped>
.race-setup {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 24px;
  color: #f7f8ff;
  background: rgba(14, 17, 30, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 26px;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(24px);
}
.setup-header { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 14px; }
.setup-header h2 { margin: 1px 0 0; font-size: 1.65rem; }
.eyebrow { margin: 0; color: #ff8a68; font-size: .68rem; font-weight: 800; letter-spacing: .2em; }
.icon-btn { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.16); border-radius: 14px; color: inherit; background: rgba(255,255,255,.06); cursor: pointer; }
.mode-grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 9px; margin-top: 22px; }
.mode-card { min-height: 76px; display: grid; place-items: center; align-content: center; gap: 7px; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; color: #aeb5c9; background: rgba(255,255,255,.04); cursor: pointer; }
.mode-card span { font-size: .78rem; font-weight: 700; }
.mode-card.active { color: #fff; border-color: #ff8062; background: linear-gradient(145deg, rgba(255,111,82,.34), rgba(255,111,82,.09)); box-shadow: inset 0 0 0 1px rgba(255,138,104,.2), 0 8px 28px rgba(255,100,70,.13); }
.mode-copy { min-height: 22px; margin: 10px 0 16px; text-align: center; color: #9fa8be; font-size: .84rem; }
.track-preview { display: grid; grid-template-columns: 54px 1fr auto; align-items: center; gap: 14px; padding: 15px; border-radius: 18px; background: linear-gradient(100deg, color-mix(in srgb, var(--track-accent) 19%, transparent), rgba(255,255,255,.04)); border: 1px solid color-mix(in srgb, var(--track-accent) 45%, transparent); }
.track-icon { width: 48px; height: 48px; display: grid; place-items: center; color: var(--track-accent); border-radius: 15px; background: rgba(0,0,0,.25); }
.track-preview strong,.track-preview span { display: block; }
.track-preview span { margin-top: 3px; color: #aab2c4; font-size: .78rem; }
.difficulty-chip { padding: 5px 9px; color: #fff !important; border: 1px solid color-mix(in srgb,var(--track-accent) 55%,transparent); border-radius: 999px; background: rgba(0,0,0,.2); }
.setup-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 13px; margin-top: 16px; }
.setup-fields label > span { display: block; margin: 0 0 6px 4px; color: #aeb5c9; font-size: .76rem; font-weight: 700; }
.setup-summary { display: flex; justify-content: center; align-items: center; gap: 8px; margin: 17px 0 12px; color: #aeb5c9; font-size: .82rem; }
.ai-roster { margin: -4px 0 12px; color: #7f8ba4; text-align: center; font-size: .72rem; }
.launch-btn { width: 100%; min-height: 54px; display: flex; align-items: center; justify-content: center; gap: 10px; border: 0; border-radius: 16px; color: #fff; background: linear-gradient(110deg,#ff6b55,#ff9a61); font-size: 1rem; font-weight: 800; cursor: pointer; box-shadow: 0 14px 34px rgba(255,95,67,.27); }
button:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
@media (max-width: 700px) {
  .race-setup { padding: 18px; border-radius: 20px; }
  .mode-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .setup-fields { grid-template-columns: 1fr; }
  .track-preview { grid-template-columns: 48px 1fr; }
  .difficulty-chip { display: none !important; }
}
</style>
