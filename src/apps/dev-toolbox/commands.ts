import { encodePipeline, type PipelineStep } from './pipeline'
import { defineAppCommandProvider, type AppCommandDefinition } from '@/lib/app-command'

interface PipelinePreset {
  id: string
  name: string
  steps: PipelineStep[]
}

const PRESET_STORAGE_KEY = 'dev-toolbox:pipeline:presets'

function loadPipelinePresets(): PipelinePreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value
      .filter(
        (preset): preset is PipelinePreset =>
          preset &&
          typeof preset.id === 'string' &&
          typeof preset.name === 'string' &&
          Array.isArray(preset.steps),
      )
      .slice(0, 20)
  } catch {
    return []
  }
}

export function useDevToolboxCommandProvider() {
  return defineAppCommandProvider({
    appKey: 'builtin:15',
    appName: '开发工具箱',
    commands: () => {
      const presetCommands: AppCommandDefinition[] = loadPipelinePresets().map((preset) => ({
        id: `pipeline-preset-${preset.id}`,
        label: `应用流水线预设：${preset.name}`,
        description: `${preset.steps.length} 个处理步骤，打开后可直接输入内容`,
        icon: '⛓',
        keywords: ['流水线', '预设', preset.name, 'pipeline'],
        priority: 55,
        execute: ({ router }) => {
          router.push({
            path: '/dev-toolbox',
            query: { tool: 'pipeline', p: encodePipeline(preset.steps) },
          })
          return { message: `已应用流水线预设「${preset.name}」` }
        },
      }))

      return presetCommands
    },
  })
}
