import { describe, expect, it } from 'vitest'
import { decodePipeline, encodePipeline, runPipeline, type PipelineStep } from '../pipeline'

const steps: PipelineStep[] = [
  { id: '1', operation: 'trim-lines' },
  { id: '2', operation: 'unique-lines' },
  { id: '3', operation: 'sort-lines' },
]

describe('tool pipeline', () => {
  it('passes each output into the next operation', async () => {
    const result = await runPipeline(' b\na\na ', steps)
    expect(result.output).toBe('a\nb')
    expect(result.stages).toHaveLength(3)
  })

  it('round-trips UTF-8 through Base64 and Gzip', async () => {
    const base64 = await runPipeline('你好 VueChest', [
      { id: '1', operation: 'base64-encode' },
      { id: '2', operation: 'base64-decode' },
      { id: '3', operation: 'gzip-compress' },
      { id: '4', operation: 'gzip-decompress' },
    ])
    expect(base64.output).toBe('你好 VueChest')
  })

  it('serializes pipeline steps for deep links', () => {
    const encoded = encodePipeline(steps)
    expect(decodePipeline(encoded).map((item) => item.operation)).toEqual(
      steps.map((item) => item.operation),
    )
  })
})
