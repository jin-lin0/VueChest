import type { SelectOption } from '@/components/common/CustomSelect.vue'
export const assertionTypeOptions: SelectOption[] = [
  { value: 'status', label: '状态码等于' },
  { value: 'time', label: '响应耗时小于' },
  { value: 'body-includes', label: '响应包含文本' },
]
export const requestAuthOptions: SelectOption[] = [
  { value: 'none', label: '无鉴权' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api-key', label: 'API Key' },
  { value: 'basic', label: 'Basic Auth' },
]
export const apiKeyLocationOptions: SelectOption[] = [
  { value: 'header', label: 'Header' },
  { value: 'query', label: 'Query 参数' },
]
