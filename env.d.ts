/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_SILICONFLOW_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
