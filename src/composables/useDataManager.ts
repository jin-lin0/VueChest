import { ref } from 'vue'
import { exportAllData, importAllData } from '@/lib/storage'
import { errorMessage } from '@/lib/error-message'

interface DataManagerOptions {
  /** 全局确认框（`useConfirm().confirm`）。 */
  confirm: (message: string) => Promise<boolean>
  /** 成功后的刷新动作，默认整页 reload。 */
  reload?: () => void
}

/** 管理本地数据导出、导入和重置，集中处理写入状态与失败反馈。 */
export function useDataManager({
  confirm,
  reload = () => window.location.reload(),
}: DataManagerOptions) {
  const showDataManager = ref(false)
  const importText = ref('')
  const importStatus = ref('')
  /** 状态是「成功」还是「失败」，显式记录。 */
  const importOk = ref(false)
  /** 从确认开始直到成功刷新前，都不允许再次整表覆盖。 */
  const busy = ref(false)

  const RELOAD_DELAY = 700

  function setStatus(message: string, ok = false) {
    importStatus.value = message
    importOk.value = ok
  }

  function openDataManager() {
    setStatus('')
    showDataManager.value = true
  }

  async function handleExport() {
    const data = await exportAllData()
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `vuechest-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    if (busy.value) return

    // 解析与持久化失败分别提示。
    let parsed: unknown
    try {
      parsed = JSON.parse(importText.value)
    } catch {
      setStatus('JSON 解析失败，请检查文件内容')
      return
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length === 0
    ) {
      setStatus('请选择有效且非空的 VueChest 备份文件')
      return
    }

    busy.value = true
    let succeeded = false
    try {
      await importAllData(parsed as Record<string, unknown>)
      succeeded = true
    } catch (error) {
      // importAllData 是先落盘、后改内存（见 storage.ts），失败时内存与磁盘都没动过。
      setStatus(`导入失败：写入本地数据时出错（${errorMessage(error)}），原有数据未被改动`)
      return
    } finally {
      if (!succeeded) busy.value = false
    }

    setStatus('导入成功，即将刷新页面', true)
    setTimeout(reload, RELOAD_DELAY)
  }

  function handleFileImport(event: Event) {
    if (busy.value) return
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      importText.value = String(reader.result || '')
      void handleImport()
    }
    reader.readAsText(file)
    input.value = ''
  }

  async function handleReset() {
    if (busy.value) return
    busy.value = true
    let succeeded = false
    try {
      const ok = await confirm('确定要重置应用吗？这将清空所有本地数据，且不可恢复。')
      if (!ok) return
      await importAllData({})
      succeeded = true
    } catch (error) {
      // 原先这里没有 try/catch：清库失败时用户看到的是「什么都没发生」——
      // 状态行没更新、页面也没刷新，而 Promise 拒绝只落在控制台里。
      setStatus(`重置失败：${errorMessage(error)}，原有数据未被改动`)
      return
    } finally {
      if (!succeeded) busy.value = false
    }

    setStatus('已重置，即将刷新页面', true)
    setTimeout(reload, RELOAD_DELAY)
  }

  return {
    showDataManager,
    importText,
    importStatus,
    importOk,
    busy,
    openDataManager,
    handleExport,
    handleImport,
    handleFileImport,
    handleReset,
  }
}
