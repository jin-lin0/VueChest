import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** 验证语义文字与背景组合的对比度，覆盖浅色、深色及局部主题。 */

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const tokensPath = fileURLToPath(new URL('../../../public/tokens.css', import.meta.url))
const AA_NORMAL = 4.5

/** 取出 tokens.css 中某个块内的 `--name: value` 声明。 */
function readBlock(css: string, header: RegExp): Record<string, string> {
  const match = header.exec(css)
  if (!match) throw new Error(`tokens.css 缺少块：${header}`)
  const start = css.indexOf('{', match.index)
  const end = css.indexOf('\n}', start)
  const declarations = css.slice(start + 1, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)
  return Object.fromEntries(
    Array.from(declarations, (item) => [item[1], item[2].trim().split(/\s+\/\*/)[0].trim()]),
  )
}

function luminance(color: string): number {
  const hex = color.trim()
  const digits =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((char) => char + char)
          .join('')
      : hex.slice(1)
  const value = Number.parseInt(digits, 16)
  const channel = (part: number) => {
    const scaled = part / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  )
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const tokens = readFileSync(tokensPath, 'utf8')
const light = readBlock(tokens, /:root\s*\{/)
const dark = readBlock(tokens, /:root\.dark,\s*\.vc-dark\s*\{/)

const THEMES = [
  {
    name: '浅色',
    block: light,
    text: [
      '--text-primary',
      '--text-body',
      '--text-secondary',
      '--text-muted',
      '--text-dim',
      '--accent-text',
      '--success-text',
      '--warning-text',
      '--danger-text',
      '--info-text',
    ],
    surfaces: ['--bg-card', '--bg-page', '--bg-hover', '--bg-subtle', '--accent-bg'],
  },
  {
    name: '深色',
    block: dark,
    text: [
      '--text-primary',
      '--text-body',
      '--text-secondary',
      '--text-muted',
      '--text-dim',
      '--accent-text',
      '--success-text',
      '--warning-text',
      '--danger-text',
      '--info-text',
    ],
    surfaces: ['--bg-card', '--bg-page', '--bg-hover', '--bg-subtle'],
  },
]

describe('文字对比度 token', () => {
  it.each(THEMES)('$name主题：语义文字在各语义背景上都达到 AA 4.5:1', ({ block, text, surfaces }) => {
    const failures: string[] = []
    for (const textToken of text) {
      for (const surfaceToken of surfaces) {
        const color = block[textToken]
        const background = block[surfaceToken]
        expect(color, `缺 token ${textToken}`).toBeTruthy()
        expect(background, `缺 token ${surfaceToken}`).toBeTruthy()
        const ratio = contrast(color, background)
        if (ratio < AA_NORMAL) {
          failures.push(`${textToken}(${color}) on ${surfaceToken}(${background}) = ${ratio.toFixed(2)}`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('浅色与深色都定义了 --accent-text，且都朝提高对比度的方向取值', () => {
    expect(light['--accent-text']).toBeTruthy()
    expect(dark['--accent-text']).toBeTruthy()
    expect(light['--accent-text']).not.toEqual(dark['--accent-text'])
    // --accent 只在 :root 声明，:root.dark 不覆盖它（靠级联继承），所以深色比的是同一个填充色
    const fill = light['--accent']
    expect(fill, '缺 token --accent').toBeTruthy()
    // 浅色底要更深、深色底要更亮，否则说明方向搞反了
    expect(luminance(light['--accent-text'])).toBeLessThan(luminance(fill))
    expect(luminance(dark['--accent-text'])).toBeGreaterThan(luminance(fill))
  })

  it('被当文字用的 token 必须在两个主题下都达到 AA', () => {
    // 按各主题的有效变量值计算，未覆盖的变量沿用根节点值。
    const ON_FILL = new Set(['--text-inverse', '--accent-contrast', '--accent-light'])
    const DECORATIVE = new Set(['--border'])
    const referenced = new Set<string>()
    for (const path of collectStyleFiles(sourceRoot)) {
      for (const match of readFileSync(path, 'utf8').matchAll(TEXT_COLOR_DECLARATION)) {
        const token = /^var\((--[\w-]+)\)$/.exec(match[1].trim())
        if (token) referenced.add(token[1])
      }
    }

    const offenders: string[] = []
    for (const token of referenced) {
      const value = light[token]
      // 只检查 tokens.css 里声明过的 hex 色：主题岛自带的名字由「主题岛」那组用例负责
      if (!value || !/^#[0-9a-f]{3,8}$/i.test(value)) continue
      // 压在深色/品牌填充上的文字、以及纯装饰符号，不适用「压页面底色」这把尺子
      if (ON_FILL.has(token) || DECORATIVE.has(token)) continue
      for (const theme of THEMES) {
        const effective = theme.block[token] ?? value
        for (const surface of theme.surfaces) {
          const ratio = contrast(effective, theme.block[surface])
          if (ratio < AA_NORMAL) {
            offenders.push(
              `${theme.name}主题：${token}(${effective}) on ${surface}(${theme.block[surface]}) = ${ratio.toFixed(2)}` +
                (theme.block[token] ? '' : '（深色块未覆盖此 token）'),
            )
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it.each(THEMES)('$name主题：语义「文字档」在自己的 --*-bg 上也达到 AA', ({ name, block }) => {
    // 最常见的用法就是「同色染色底 + 同色文字」（如 --danger-bg + --danger-text），
    // 这条单独锁住，因为配对里的背景比通用表面更饱和。
    const pairs = ['success', 'warning', 'danger']
    const failures: string[] = []
    for (const family of pairs) {
      const color = block[`--${family}-text`]
      const background = block[`--${family}-bg`]
      expect(color, `${name} 缺 --${family}-text`).toBeTruthy()
      expect(background, `${name} 缺 --${family}-bg`).toBeTruthy()
      const ratio = contrast(color, background)
      if (ratio < AA_NORMAL) {
        failures.push(`--${family}-text(${color}) on --${family}-bg(${background}) = ${ratio.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('语义色文字档在浅色与深色下取值不同（否则会有一侧看不清）', () => {
    for (const family of ['success', 'warning', 'danger', 'info']) {
      const token = `--${family}-text`
      expect(light[token], `缺 ${token}`).toBeTruthy()
      expect(dark[token], `深色主题缺 ${token}（会沿用浅色档，在深底上不达标）`).toBeTruthy()
      expect(light[token], `${token} 两主题取值相同，说明有一侧没有按底调整`).not.toEqual(dark[token])
    }
  })
})

const STYLE_EXTENSIONS = new Set(['css', 'scss', 'vue'])
const BRAND_LITERAL = /#667eea|rgb\(\s*102[\s,]+126[\s,]+234\s*\)/i
/** 只匹配文字色，跳过 border-color / background-color / -webkit-text-fill-color。 */
const TEXT_COLOR_DECLARATION = /(?:^|[;{])[^\S\n]*color\s*:\s*([^;}]+)/gm

/** 只能当填充 / 描边、不能当文字色的 token。 */
const FILL_TOKENS = new Set(['--accent', '--success', '--warning', '--danger', '--info'])

/** 提取单个 var() 引用的变量名，允许字面量 fallback；嵌套表达式返回 null。 */
function tokenNameOf(value: string): string | null {
  const match = /^var\(\s*(--[\w-]+)\s*(?:,[\s\S]*)?\)$/.exec(value.trim())
  return match ? match[1] : null
}

/** 按变量名识别填充色被用作文字色，包含带 fallback 的声明。 */
function findFillTokenTextColors(css: string): string[] {
  return Array.from(css.matchAll(TEXT_COLOR_DECLARATION))
    .filter((match) => {
      const token = tokenNameOf(match[1])
      return token !== null && FILL_TOKENS.has(token)
    })
    .map((match) => match[1].trim())
}

function collectStyleFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return collectStyleFiles(path)
    return STYLE_EXTENSIONS.has(entry.name.split('.').pop() || '') ? [path] : []
  })
}

const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/g
/** 取一个文件里真正是 CSS 的部分：.vue 只取 <style> 内容，.css 取全文件。 */
function cssOf(path: string): string {
  const source = readFileSync(path, 'utf8')
  if (!path.endsWith('.vue')) return source
  return Array.from(source.matchAll(STYLE_BLOCK), (match) => match[1]).join('\n')
}

const RULE = /([^{}]+)\{([^{}]*)\}/g
/** 判定「主题岛」的标志：重定义了全局主题层的变量。 */
const PALETTE_KEY = /(?<![\w-])--(?:bg|bg-page|accent|text)\s*:/

/** 自带背景的局部主题需提供匹配的文字色，或通过 .vc-dark 继承暗色变量。 */
function findThemeIslands() {
  return collectStyleFiles(sourceRoot).flatMap((path) =>
    Array.from(cssOf(path).matchAll(RULE))
      .map((match) => ({ file: path.replace(`${sourceRoot}/`, ''), selector: match[1].split('\n').pop()!.trim(), body: match[2] }))
      .filter((rule) => PALETTE_KEY.test(rule.body) && !rule.selector.includes('vc-dark')),
  )
}

describe('主题岛必须自带品牌文字档位', () => {
  it('自带配色的子树都声明了 --accent-text', () => {
    const missing = findThemeIslands()
      .filter((island) => !/--accent-text\s*:/.test(island.body))
      .map((island) => `${island.file}: ${island.selector}`)
    expect(missing).toEqual([])
  })

  it('主题岛声明的 --accent-text 在本主题的所有语义背景上达到 AA', () => {
    const failures: string[] = []
    for (const island of findThemeIslands()) {
      const declared = island.body.match(/--accent-text\s*:\s*(#[0-9a-f]{3,8})/i)
      if (!declared) continue
      // 用该岛自己的 --text 亮度判断它是暗色岛还是浅色岛
      const ownText = island.body.match(/(?<![\w-])--text\s*:\s*(#[0-9a-f]{3,8})/i)
      const isDark = ownText ? luminance(ownText[1]) > 0.5 : false
      const surfaces = isDark
        ? ['--bg-card', '--bg-page', '--bg-hover', '--bg-subtle']
        : ['--bg-card', '--bg-page', '--bg-hover', '--bg-subtle', '--accent-bg']
      const block = isDark ? dark : light
      for (const surface of surfaces) {
        const ratio = contrast(declared[1], block[surface])
        if (ratio < AA_NORMAL) {
          failures.push(`${island.file} ${island.selector}: ${declared[1]} on ${surface}(${block[surface]}) = ${ratio.toFixed(2)}`)
        }
      }
    }
    expect(failures).toEqual([])
  })
})

describe('品牌色文字必须走语义 token', () => {
  it('样式里不再用 #667eea / rgb(102,126,234) 直接写文字色', () => {
    const offenders = collectStyleFiles(sourceRoot).flatMap((path) =>
      Array.from(readFileSync(path, 'utf8').matchAll(TEXT_COLOR_DECLARATION))
        .filter((match) => BRAND_LITERAL.test(match[1]))
        .map((match) => `${path.replace(`${sourceRoot}/`, '')}: color: ${match[1].trim()}`),
    )
    expect(offenders).toEqual([])
  })

  it('填充色 token 不能直接当文字色，必须走对应的 -text 档', () => {
    const offenders = collectStyleFiles(sourceRoot).flatMap((path) =>
      findFillTokenTextColors(cssOf(path)).map(
        (value) => `${path.replace(`${sourceRoot}/`, '')}: color: ${value}`,
      ),
    )
    expect(offenders).toEqual([])
  })

  it('识别器本身必须能看穿 fallback 参数（否则全部修完后门禁会被悄悄改回去）', () => {
    // 用合成 CSS 验证 fallback 语法，避免真实违规清空后规则回退却测试仍通过。
    expect(findFillTokenTextColors('.err { color: var(--danger, #ef4444); }')).toEqual([
      'var(--danger, #ef4444)',
    ])
    expect(findFillTokenTextColors('.err { color: var(--success, #22c55e); }')).toEqual([
      'var(--success, #22c55e)',
    ])
    expect(findFillTokenTextColors('a { color: var(--danger); }')).toEqual(['var(--danger)'])

    // 不该误伤的：-text 档（带不带 fallback 都不算）、字面量、嵌套 fallback、
    // 以及非文字用途的 border-color / background-color。
    expect(findFillTokenTextColors('.e { color: var(--danger-text); }')).toEqual([])
    expect(findFillTokenTextColors('.e { color: var(--accent-text, #4d61cb); }')).toEqual([])
    expect(findFillTokenTextColors('.e { color: #dc2626; }')).toEqual([])
    expect(findFillTokenTextColors('.e { border-color: var(--danger, #ef4444); }')).toEqual([])
    expect(findFillTokenTextColors('.e { background: var(--danger, #ef4444); }')).toEqual([])
  })
})
