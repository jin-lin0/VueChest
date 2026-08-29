import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const tokensPath = fileURLToPath(new URL('../../../public/tokens.css', import.meta.url))
const STYLE_EXTENSIONS = new Set(['css', 'scss', 'vue'])

function collectStyleFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return collectStyleFiles(path)
    const extension = entry.name.split('.').pop() || ''
    return STYLE_EXTENSIONS.has(extension) ? [path] : []
  })
}

describe('typography tokens', () => {
  it('defines the global readable caption baseline', () => {
    const tokens = readFileSync(tokensPath, 'utf8')
    expect(tokens).toMatch(/--font-size-2xs:\s*10px/)
    expect(tokens).toMatch(/--font-size-caption:\s*var\(--font-size-2xs\)/)
  })

  it('does not hardcode fixed px/rem font sizes in components', () => {
    const offenders = collectStyleFiles(sourceRoot).flatMap((path) => {
      const content = readFileSync(path, 'utf8')
      const declarations = [
        ...Array.from(content.matchAll(/font-size\s*:[^;{}]+;/g)).filter(
          (match) => /(?:px|rem)\b/.test(match[0]) && !match[0].includes('clamp('),
        ),
        ...Array.from(content.matchAll(/(?:^|[;{]\s*)font(?!-size)\s*:[^;{}]+;/gm)).filter(
          (match) => /(?:px|rem)\b/.test(match[0]),
        ),
        ...content.matchAll(/font-size=["'](?:\d*\.?\d+)["']/g),
      ]
      return declarations.map((match) => `${path.replace(`${sourceRoot}/`, '')}: ${match[0]}`)
    })
    expect(offenders).toEqual([])
  })
})
