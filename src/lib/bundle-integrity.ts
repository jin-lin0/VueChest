const SHA256_RE = /^[a-f0-9]{64}$/

export function normalizeSha256(value?: string | null): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return SHA256_RE.test(normalized) ? normalized : null
}

export async function sha256Hex(content: ArrayBuffer | ArrayBufferView): Promise<string> {
  const source = ArrayBuffer.isView(content)
    ? new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
    : new Uint8Array(content)
  const bytes = new Uint8Array(source.byteLength)
  bytes.set(source)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function verifyBundleIntegrity(
  content: ArrayBuffer | ArrayBufferView,
  expected?: string | null,
): Promise<string> {
  const actual = await sha256Hex(content)
  const normalizedExpected = normalizeSha256(expected)
  if (expected && !normalizedExpected) throw new Error('服务端返回的应用包校验值无效')
  if (normalizedExpected && actual !== normalizedExpected) {
    throw new Error('应用包完整性校验失败，已阻止安装')
  }
  return actual
}

export function addedNetworkPermissions(previous?: string[], next?: string[]): string[] {
  const approved = new Set((previous || []).map((item) => item.trim().toLowerCase()))
  return [...new Set((next || []).map((item) => item.trim()).filter(Boolean))].filter(
    (item) => !approved.has(item.toLowerCase()),
  )
}
