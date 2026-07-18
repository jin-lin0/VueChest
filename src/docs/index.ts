import type { DocSection, DocItem } from './types'

import gettingStarted from './getting-started.md?raw'
import account from './account.md?raw'
import marketUpload from './market-upload.md?raw'
import marketSpec from './market-spec.md?raw'
import marketReview from './market-review.md?raw'
import marketInstall from './market-install.md?raw'
import marketNotes from './market-notes.md?raw'
import faq from './faq.md?raw'

/**
 * 文档注册表：按分类组织。
 * 新增文档时，在此追加一项并在上方 import 对应 .md?raw 即可，
 * 侧边栏与路由会自动同步。
 */
export const docSections: DocSection[] = [
  {
    id: 'getting-started',
    title: '开始使用',
    items: [
      { id: 'getting-started', title: '项目简介', content: gettingStarted },
      { id: 'account', title: '账号与登录', content: account },
    ],
  },
  {
    id: 'market',
    title: '应用市场',
    items: [
      { id: 'market-upload', title: '如何上传应用到市场', content: marketUpload },
      { id: 'market-spec', title: '应用包开发规范', content: marketSpec },
      { id: 'market-review', title: '审核与发布流程', content: marketReview },
      { id: 'market-install', title: '安装与使用', content: marketInstall },
      { id: 'market-notes', title: '注意事项', content: marketNotes },
    ],
  },
  {
    id: 'faq',
    title: '常见问题',
    items: [{ id: 'faq', title: '常见问题 FAQ', content: faq }],
  },
]

export const allDocs: DocItem[] = docSections.flatMap((s) => s.items)

export function findDoc(id: string | undefined | null): DocItem | undefined {
  if (!id) return undefined
  return allDocs.find((d) => d.id === id)
}
