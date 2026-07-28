/**
 * 复制文本到剪贴板（跨 app 复用的公共方法）
 *
 * 优先使用 navigator.clipboard.writeText（需安全上下文 + 用户手势），
 * 失败时回退到隐藏 textarea + execCommand('copy')，兼容非 HTTPS / 剪贴板被禁用的场景。
 *
 * @param text 要复制的文本
 * @param onSuccess 复制成功后的回调，用于触发 UI 反馈（如「已复制」状态）。复制失败时不触发。
 * @returns 是否复制成功
 */
export async function copyToClipboard(text: string, onSuccess?: () => void): Promise<boolean> {
  const ok = await writeClipboard(text)
  if (ok) onSuccess?.()
  return ok
}

async function writeClipboard(text: string): Promise<boolean> {
  // 现代异步剪贴板 API
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到下方兜底方案
  }

  // 兜底：隐藏 textarea + execCommand
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
