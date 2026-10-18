import type { DocSection, DocItem } from '../types'

/**
 * 帮助文档注册表，id 与 Markdown 文件名一致。
 * 正文按需加载，避免目录入口打包全部文档。
 */
const rawLoaders = import.meta.glob('./*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

function loadContent(path: string): () => Promise<string> {
  const loader = rawLoaders[path]
  if (!loader) return async () => `# 文档加载失败\n\n未找到文档模块：${path}`
  return loader
}

export const helpSections: DocSection[] = [
  {
    id: 'getting-started',
    title: '开始使用',
    items: [
      {
        id: 'getting-started',
        title: '项目简介',
        loadContent: loadContent('./getting-started.md'),
      },
      { id: 'account', title: '账号与登录', loadContent: loadContent('./account.md') },
    ],
  },
  {
    id: 'market',
    title: '应用市场',
    items: [
      {
        id: 'market-upload',
        title: '如何上传应用到市场',
        loadContent: loadContent('./market-upload.md'),
      },
      { id: 'market-spec', title: '应用包开发规范', loadContent: loadContent('./market-spec.md') },
      {
        id: 'market-capabilities',
        title: '市场应用可用能力',
        loadContent: loadContent('./market-capabilities.md'),
      },
      { id: 'market-sandbox', title: '沙箱机制', loadContent: loadContent('./market-sandbox.md') },
      {
        id: 'theme-variables',
        title: '主题变量与深色模式',
        loadContent: loadContent('./theme-variables.md'),
      },
      {
        id: 'market-review',
        title: '审核与发布流程',
        loadContent: loadContent('./market-review.md'),
      },
      {
        id: 'market-install',
        title: '安装与使用',
        loadContent: loadContent('./market-install.md'),
      },
      { id: 'market-notes', title: '注意事项', loadContent: loadContent('./market-notes.md') },
    ],
  },
  {
    id: 'faq',
    title: '常见问题',
    items: [{ id: 'faq', title: '常见问题 FAQ', loadContent: loadContent('./faq.md') }],
  },

  {
    id: 'stock',
    title: '股票知识库',
    items: [
      {
        id: 'stock-knowledge',
        title: 'A 股短线交易知识库',
        loadContent: loadContent('./stock-knowledge.md'),
      },
    ],
  },
  {
    id: 'about',
    title: '关于本站',
    items: [
      { id: 'site-donate', title: '给站主打赏', loadContent: loadContent('./site-donate.md') },
    ],
  },
]

export const allHelpDocs: DocItem[] = helpSections.flatMap((s) => s.items)
