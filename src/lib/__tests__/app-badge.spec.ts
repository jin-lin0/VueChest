import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FAVICON, buildBadgedFavicon, syncDocumentBadge } from '../app-badge'

function decode(uri: string): string {
  return decodeURIComponent(uri.replace(/^data:image\/svg\+xml,/, ''))
}

describe('buildBadgedFavicon', () => {
  it('returns the plain default icon when nothing is unread', () => {
    expect(buildBadgedFavicon(0)).toBe(DEFAULT_FAVICON)
    expect(buildBadgedFavicon(-2)).toBe(DEFAULT_FAVICON)
    expect(buildBadgedFavicon(Number.NaN)).toBe(DEFAULT_FAVICON)
  })

  it('embeds the unread count as a badge on top of the default icon', () => {
    const svg = decode(buildBadgedFavicon(7))
    expect(svg).toContain('⚡')
    expect(svg).toContain('>7</text>')
    expect(svg).toContain('#e5484d')
  })

  it('caps the label at 99+ and shrinks the font for longer labels', () => {
    const svg = decode(buildBadgedFavicon(1234))
    expect(svg).toContain('>99+</text>')
    expect(svg).toContain('font-size="46"')
  })

  it('produces a decodable svg data uri', () => {
    const uri = buildBadgedFavicon(3)
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
    expect(decode(uri).startsWith('<svg')).toBe(true)
    // 默认图标同样必须是可解码的 data uri，否则 favicon 会直接失效
    expect(decode(DEFAULT_FAVICON).startsWith('<svg')).toBe(true)
  })
})

describe('syncDocumentBadge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is a safe no-op outside the browser', () => {
    expect(typeof document).toBe('undefined')
    expect(() => syncDocumentBadge(5)).not.toThrow()
    expect(() => syncDocumentBadge(0)).not.toThrow()
  })

  it('writes the favicon and forwards the count to the Badging API', () => {
    const link = { rel: 'icon', href: 'old' }
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', {
      querySelector: () => link,
      createElement: () => ({ rel: '', href: '' }),
      head: { appendChild: vi.fn() },
    })
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })

    syncDocumentBadge(4)
    expect(link.href).toBe(buildBadgedFavicon(4))
    expect(setAppBadge).toHaveBeenCalledWith(4)

    syncDocumentBadge(0)
    expect(link.href).toBe(DEFAULT_FAVICON)
    expect(clearAppBadge).toHaveBeenCalled()
  })
})
