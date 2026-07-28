/**
 * 开发工具箱共享纯函数（无副作用，可被任意工具复用，便于单测）。
 * 抽取自各工具中重复实现的逻辑：进制转换、颜色互转、CSV 类型推断、UTF-8 安全 Base64。
 */

/* ----------------------------- 进制转换 ----------------------------- */

const RADIX_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 解析某进制（2-36）字符串为整数（BigInt，支持任意大数）。非法字符抛错。 */
export function parseRadix(input: string, base: number): bigint {
  if (base < 2 || base > 36) throw new Error(`进制必须在 2-36 之间，收到 ${base}`)
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^[-+]/, (m) => m)
  const neg = s.startsWith('-')
  const body = neg ? s.slice(1) : s
  if (!body) throw new Error('空输入')
  let acc = 0n
  for (const ch of body) {
    const d = RADIX_DIGITS.indexOf(ch)
    if (d < 0 || d >= base) throw new Error(`非法字符 "${ch}"（进制 ${base}）`)
    acc = acc * BigInt(base) + BigInt(d)
  }
  return neg ? -acc : acc
}

/** 将整数（BigInt / number）格式化为某进制（2-36）字符串。 */
export function formatRadix(value: bigint | number, base: number): string {
  if (base < 2 || base > 36) throw new Error(`进制必须在 2-36 之间，收到 ${base}`)
  let v = typeof value === 'bigint' ? value : BigInt(Math.trunc(value))
  const neg = v < 0n
  v = neg ? -v : v
  if (v === 0n) return '0'
  let out = ''
  while (v > 0n) {
    out = RADIX_DIGITS[Number(v % BigInt(base))] + out
    v = v / BigInt(base)
  }
  return neg ? '-' + out : out
}

/* ----------------------------- 颜色互转 ----------------------------- */

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Hsl {
  h: number
  s: number
  l: number
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/** "#rgb" / "#rrggbb" / "#rrggbbaa" → {r,g,b}（忽略 alpha）。非法返回 null。 */
export function hexToRgb(hex: string): Rgb | null {
  let h = hex.trim().replace(/^#/, '').toLowerCase()
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (h.length === 6 && /^[0-9a-f]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  return null
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => clampByte(n).toString(16).padStart(2, '0')
  return '#' + to(r) + to(g) + to(b)
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = clampByte(r) / 255
  const gn = clampByte(g) / 255
  const bn = clampByte(b) / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = ln - c / 2
  return { r: clampByte((r + m) * 255), g: clampByte((g + m) * 255), b: clampByte((b + m) * 255) }
}

/* --------------------------- CSV 类型推断 --------------------------- */

/**
 * CSV→JSON 时对单格字符串做轻量类型推断。
 * 规则：数字串转 number，但「前导零整数」(如 "007"、邮编) 保留原字符串，避免静默丢数据。
 */
export function autoType(t: string): string | number {
  const trimmed = t.replace(/^-/, '')
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    if (trimmed.length > 1 && trimmed.startsWith('0') && trimmed[1] !== '.') return t
    return Number(t)
  }
  return t
}

/* ------------------------ UTF-8 安全 Base64 ------------------------ */

/** UTF-8 安全 Base64 编码（可选 URL-safe）。 */
export function utf8ToBase64(str: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(str)
  let b64 = btoa(String.fromCharCode(...bytes))
  if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return b64
}

/** UTF-8 安全 Base64 解码（可选 URL-safe）。 */
export function base64ToUtf8(b64: string, urlSafe = false): string {
  let s = b64.trim()
  if (urlSafe) s = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
