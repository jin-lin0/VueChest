import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate'

export type PipelineOperation =
  | 'base64-encode'
  | 'base64-decode'
  | 'url-encode'
  | 'url-decode'
  | 'json-format'
  | 'json-minify'
  | 'gzip-compress'
  | 'gzip-decompress'
  | 'sha256'
  | 'uppercase'
  | 'lowercase'
  | 'trim-lines'
  | 'unique-lines'
  | 'sort-lines'

export interface PipelineStep {
  id: string
  operation: PipelineOperation
}

export const PIPELINE_OPERATIONS: Array<{ value: PipelineOperation; label: string }> = [
  { value: 'base64-encode', label: 'Base64 编码' },
  { value: 'base64-decode', label: 'Base64 解码' },
  { value: 'url-encode', label: 'URL 组件编码' },
  { value: 'url-decode', label: 'URL 组件解码' },
  { value: 'json-format', label: 'JSON 格式化' },
  { value: 'json-minify', label: 'JSON 压缩' },
  { value: 'gzip-compress', label: 'Gzip → Base64' },
  { value: 'gzip-decompress', label: 'Base64 → Gzip 解压' },
  { value: 'sha256', label: 'SHA-256' },
  { value: 'uppercase', label: '转大写' },
  { value: 'lowercase', label: '转小写' },
  { value: 'trim-lines', label: '逐行去空格' },
  { value: 'unique-lines', label: '行去重' },
  { value: 'sort-lines', label: '行排序' },
]

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value.trim())
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function bufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function runPipelineStep(input: string, operation: PipelineOperation) {
  switch (operation) {
    case 'base64-encode':
      return bytesToBase64(new TextEncoder().encode(input))
    case 'base64-decode':
      return new TextDecoder().decode(base64ToBytes(input))
    case 'url-encode':
      return encodeURIComponent(input)
    case 'url-decode':
      return decodeURIComponent(input)
    case 'json-format':
      return JSON.stringify(JSON.parse(input), null, 2)
    case 'json-minify':
      return JSON.stringify(JSON.parse(input))
    case 'gzip-compress':
      return bytesToBase64(gzipSync(strToU8(input)))
    case 'gzip-decompress':
      return strFromU8(gunzipSync(base64ToBytes(input)))
    case 'sha256': {
      if (!crypto?.subtle) throw new Error('SHA-256 需要 HTTPS 或 localhost')
      return bufferToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)))
    }
    case 'uppercase':
      return input.toUpperCase()
    case 'lowercase':
      return input.toLowerCase()
    case 'trim-lines':
      return input
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
    case 'unique-lines':
      return [...new Set(input.split('\n'))].join('\n')
    case 'sort-lines':
      return input
        .split('\n')
        .sort((a, b) => a.localeCompare(b))
        .join('\n')
  }
}

export async function runPipeline(input: string, steps: PipelineStep[]) {
  let output = input
  const stages: Array<{ step: PipelineStep; output: string }> = []
  for (const step of steps) {
    output = await runPipelineStep(output, step.operation)
    stages.push({ step, output })
  }
  return { output, stages }
}

export function encodePipeline(steps: PipelineStep[]) {
  const json = JSON.stringify(steps.map(({ operation }) => operation))
  return bytesToBase64(new TextEncoder().encode(json))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function decodePipeline(value: string): PipelineStep[] {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  const operations = JSON.parse(new TextDecoder().decode(base64ToBytes(base64)))
  if (!Array.isArray(operations) || operations.length > 20) throw new Error('流水线配置无效')
  const valid = new Set(PIPELINE_OPERATIONS.map((item) => item.value))
  return operations.map((operation) => {
    if (!valid.has(operation)) throw new Error('流水线包含未知步骤')
    return { id: crypto.randomUUID(), operation }
  })
}
