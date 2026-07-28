import { describe, it, expect } from 'vitest'
import {
  parseRadix,
  formatRadix,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  autoType,
  utf8ToBase64,
  base64ToUtf8,
} from '../devtoolbox'

/* ----------------------------- 进制转换 ----------------------------- */
describe('parseRadix / formatRadix', () => {
  it('进制互转等价', () => {
    expect(parseRadix('ff', 16)).toBe(255n)
    expect(parseRadix('1010', 2)).toBe(10n)
    expect(parseRadix('zz', 36)).toBe(35n * 36n + 35n)
    expect(formatRadix(255n, 16)).toBe('ff')
    expect(formatRadix(10n, 2)).toBe('1010')
    expect(formatRadix(255n, 2)).toBe('11111111')
    expect(formatRadix(parseRadix('abcd', 16), 16)).toBe('abcd')
  })

  it('支持负号', () => {
    expect(formatRadix(-255n, 16)).toBe('-ff')
    expect(parseRadix('-ff', 16)).toBe(-255n)
  })

  it('非法输入抛错', () => {
    expect(() => parseRadix('1g', 16)).toThrow(/非法字符/)
    expect(() => parseRadix('', 10)).toThrow(/空输入/)
    expect(() => parseRadix('12', 37)).toThrow(/进制/)
  })
})

/* ----------------------------- 颜色互转 ----------------------------- */
describe('hex ↔ rgb', () => {
  it('3 位 / 6 位 hex 解析 + 非法返回 null', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 })
    expect(hexToRgb('#zzz')).toBeNull()
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
  })
})

describe('rgb ↔ hsl', () => {
  it('已知值互转', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 })
    expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('rgb → hsl → rgb 往返一致', () => {
    const { r, g, b } = hslToRgb(210, 100, 50)
    expect(rgbToHsl(r, g, b)).toEqual({ h: 210, s: 100, l: 50 })
  })
})

/* --------------------------- CSV 类型推断 --------------------------- */
describe('autoType', () => {
  it('保留前导零、其余正常转换', () => {
    expect(autoType('007')).toBe('007')
    expect(autoType('-007')).toBe('-007')
    expect(autoType('123')).toBe(123)
    expect(autoType('0.5')).toBe(0.5)
    expect(autoType('0')).toBe(0)
    expect(autoType('abc')).toBe('abc')
    expect(autoType('1.5e3')).toBe('1.5e3')
  })
})

/* ------------------------ UTF-8 安全 Base64 ------------------------ */
describe('utf8ToBase64 / base64ToUtf8', () => {
  it('ASCII 往返', () => {
    expect(utf8ToBase64('hello')).toBe('aGVsbG8=')
    expect(base64ToUtf8('aGVsbG8=')).toBe('hello')
  })

  it('中文往返', () => {
    expect(utf8ToBase64('你好')).toBe('5L2g5aW9')
    expect(base64ToUtf8('5L2g5aW9')).toBe('你好')
  })

  it('URL-safe 模式', () => {
    expect(utf8ToBase64('a b&c', true)).toBe('YSBiJmM')
    expect(utf8ToBase64('hello', true)).toBe('aGVsbG8')
  })
})
