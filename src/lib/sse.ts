/** 按 SSE 事件读取 data，正确处理跨网络分块的 UTF-8 字符和换行。 */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  const checkAborted = () => {
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
  }
  const cancel = () => {
    void reader.cancel().catch(() => {})
  }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    checkAborted()
    while (true) {
      const { done, value } = await reader.read()
      checkAborted()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let end: number
      while ((end = buffer.search(/[\r\n]/)) >= 0) {
        if (!done && buffer[end] === '\r' && end === buffer.length - 1) break
        const line = buffer.slice(0, end)
        const separatorLength = buffer[end] === '\r' && buffer[end + 1] === '\n' ? 2 : 1
        buffer = buffer.slice(end + separatorLength)
        checkAborted()
        if (!line) {
          if (data.length) yield data.join('\n')
          data = []
        } else if (line === 'data' || line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''))
        }
      }
      // 连接关闭时，缺少空行结束符的事件不能算作完整消息。
      if (done) break
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
    try {
      await reader.cancel()
    } catch {}
    reader.releaseLock()
  }
}
