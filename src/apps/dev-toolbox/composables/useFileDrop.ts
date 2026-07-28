import { ref, type Ref } from 'vue'

export interface UseFileDropOptions {
  /** 逗号分隔的 accept，如 "image/*"；支持通配 image/*、扩展名 .png、精确 MIME text/csv */
  accept?: string
  /** 校验通过后的回调，接收已选中的文件 */
  onLoad: (file: File) => void
  /** 校验失败时的回调（如类型不符） */
  onError?: (message: string) => void
}

function matchAccept(file: File, accept: string): boolean {
  if (!accept) return true
  return accept
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((p) => {
      if (p.endsWith('/*')) return file.type.startsWith(p.slice(0, -1))
      if (p.startsWith('.')) return file.name.toLowerCase().endsWith(p.toLowerCase())
      return file.type === p
    })
}

/**
 * 统一的「点击 / 拖拽选文件」交互：
 * - 隐藏原生 input（避免浏览器自带「选择文件」按钮与文案重复）
 * - 提供 dragging 状态供高亮
 * - 统一校验 accept，校验失败走 onError
 * - 每次选择后复位 input.value，允许重复选同一文件
 *
 * 模板用法：
 *   <input ref="inputRef" type="file" accept="image/*" class="hidden-input" @change="onFile" />
 *   <div class="drop" :class="{ dragging }" role="button" tabindex="0"
 *        @click="openPicker" @keydown.enter.prevent="openPicker"
 *        @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
 *     点击选择文件，或拖入文件
 *   </div>
 */
export function useFileDrop(options: UseFileDropOptions) {
  const dragging = ref(false)
  const inputRef = ref<HTMLInputElement | null>(null)

  function pick(file: File | undefined) {
    if (!file) return
    if (options.accept && !matchAccept(file, options.accept)) {
      options.onError?.(`请选择文件（要求：${options.accept}）`)
      return
    }
    options.onLoad(file)
  }

  function onFile(e: Event) {
    const input = e.target as HTMLInputElement
    pick(input.files?.[0])
    input.value = '' // 复位，允许重复选择同一文件
  }

  function onDragOver() {
    dragging.value = true
  }

  function onDragLeave() {
    dragging.value = false
  }

  function onDrop(e: DragEvent) {
    dragging.value = false
    pick(e.dataTransfer?.files?.[0])
  }

  function openPicker() {
    inputRef.value?.click()
  }

  return { dragging, inputRef, onFile, onDragOver, onDragLeave, onDrop, openPicker }
}
