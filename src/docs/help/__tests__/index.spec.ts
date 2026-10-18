// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allHelpDocs, helpSections } from '../index'
import { flattenDocs } from '../../tree'

const HELP_DIR = resolve(process.cwd(), 'src/docs/help')

describe('帮助中心文档注册表', () => {
  it('正文一律懒加载，不得内联 content', () => {
    const inlined = allHelpDocs.filter((doc) => doc.content !== undefined).map((doc) => doc.id)
    expect(inlined).toEqual([])

    const missingLoader = allHelpDocs.filter((doc) => !doc.loadContent).map((doc) => doc.id)
    expect(missingLoader).toEqual([])
  })

  it('每个 loader 都能取到与磁盘 .md 逐字节一致的正文', async () => {
    expect(existsSync(HELP_DIR)).toBe(true)
    for (const doc of allHelpDocs) {
      const onDisk = readFileSync(resolve(HELP_DIR, `${doc.id}.md`), 'utf8')
      const loaded = await doc.loadContent?.()
      expect(loaded).toBe(onDisk)
      // 空正文意味着 loader 命中了兜底文案（文件名写错时会这样）
      expect(loaded?.trim().length).toBeGreaterThan(0)
    }
  })

  it('磁盘上的 .md 与注册表一一对应：既不能漏注册，也不能注册了不存在的文件', () => {
    const onDisk = readdirSync(HELP_DIR)
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.replace(/\.md$/, ''))
      .sort()
    const registered = allHelpDocs.map((doc) => doc.id).sort()
    expect(registered).toEqual(onDisk)
  })

  it('侧边栏的分类顺序与标题保持稳定', () => {
    expect(helpSections.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'getting-started', title: '开始使用' },
      { id: 'market', title: '应用市场' },
      { id: 'faq', title: '常见问题' },
      { id: 'stock', title: '股票知识库' },
      { id: 'about', title: '关于本站' },
    ])
    expect(helpSections.flatMap((section) => section.items.map((item) => item.id))).toEqual([
      'getting-started',
      'account',
      'market-upload',
      'market-spec',
      'market-capabilities',
      'market-sandbox',
      'theme-variables',
      'market-review',
      'market-install',
      'market-notes',
      'faq',
      'stock-knowledge',
      'site-donate',
    ])
  })

  it('文档 id 全局唯一，且「有正文」判定对懒加载文档同样成立', () => {
    const ids = flattenDocs(helpSections.flatMap((section) => section.items)).map((doc) => doc.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Docs.vue 的 hasBody 判据：content 或 loadContent 至少有一个
    for (const doc of allHelpDocs) {
      expect(Boolean(doc.content || doc.loadContent)).toBe(true)
    }
  })
})
