import { ref, watch } from 'vue'
import {
  clearSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from '../core/settings'

export const DIFFICULTY_PRESETS = [
  { key: 'easy', label: 'EASY', density: 1.5, chord: 0.05, hold: 0.2, division: 1 },
  { key: 'normal', label: 'NORMAL', density: 2.5, chord: 0.15, hold: 0.25, division: 2 },
  { key: 'hard', label: 'HARD', density: 4.0, chord: 0.25, hold: 0.3, division: 2 },
  { key: 'master', label: 'MASTER', density: 5.5, chord: 0.35, hold: 0.35, division: 4 },
] as const

export function useRhythmSettings() {
  const saved = loadSettings()
  const quantizeDivision = ref(saved.quantizeDivision)
  const noteSpeed = ref(saved.noteSpeed)
  const targetDensity = ref(saved.targetDensity)
  const chordRatio = ref(saved.chordRatio)
  const beatBias = ref(saved.beatBias)
  const holdEnabled = ref(saved.holdEnabled)
  const holdRmsPercentile = ref(saved.holdRmsPercentile)
  const userOffset = ref(saved.userOffset)
  const activePreset = ref<string>(saved.preset)
  const showAdvanced = ref(false)

  watch(
    [
      noteSpeed,
      userOffset,
      activePreset,
      targetDensity,
      chordRatio,
      beatBias,
      holdEnabled,
      holdRmsPercentile,
      quantizeDivision,
    ],
    () => {
      saveSettings({
        noteSpeed: noteSpeed.value,
        userOffset: userOffset.value,
        preset: activePreset.value,
        targetDensity: targetDensity.value,
        chordRatio: chordRatio.value,
        beatBias: beatBias.value,
        holdEnabled: holdEnabled.value,
        holdRmsPercentile: holdRmsPercentile.value,
        quantizeDivision: quantizeDivision.value,
      })
    },
  )

  function resetSettings() {
    clearSettings()
    const defaults = DEFAULT_SETTINGS
    noteSpeed.value = defaults.noteSpeed
    userOffset.value = defaults.userOffset
    activePreset.value = defaults.preset
    targetDensity.value = defaults.targetDensity
    chordRatio.value = defaults.chordRatio
    beatBias.value = defaults.beatBias
    holdEnabled.value = defaults.holdEnabled
    holdRmsPercentile.value = defaults.holdRmsPercentile
    quantizeDivision.value = defaults.quantizeDivision
  }

  function applyPreset(preset: (typeof DIFFICULTY_PRESETS)[number]) {
    activePreset.value = preset.key
    targetDensity.value = preset.density
    chordRatio.value = preset.chord
    holdRmsPercentile.value = preset.hold
    quantizeDivision.value = preset.division
  }

  function markCustom() {
    activePreset.value = 'custom'
  }

  function selectQuantizeDivision(value: 1 | 2 | 4) {
    quantizeDivision.value = value
    markCustom()
  }

  return {
    quantizeDivision,
    noteSpeed,
    targetDensity,
    chordRatio,
    beatBias,
    holdEnabled,
    holdRmsPercentile,
    userOffset,
    activePreset,
    showAdvanced,
    resetSettings,
    applyPreset,
    markCustom,
    selectQuantizeDivision,
  }
}
