import { describe, expect, it } from 'vitest'
import type { DocSection } from '../types'
import { folderIdsOfSections } from '../tree'

const sections: DocSection[] = [
  {
    id: 'frontend',
    title: '前端开发',
    items: [
      {
        id: 'javascript',
        title: 'JavaScript',
        children: [
          {
            id: 'runtime',
            title: '运行时',
            children: [{ id: 'event-loop', title: '事件循环', content: '# 事件循环' }],
          },
        ],
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI / Agent',
    items: [{ id: 'agent', title: 'Agent', content: '# Agent' }],
  },
]

describe('folderIdsOfSections', () => {
  it('只返回一级分类用于知识库默认展开', () => {
    expect(folderIdsOfSections(sections, 1)).toEqual(['frontend', 'ai'])
  })

  it('按指定目录深度展开', () => {
    expect(folderIdsOfSections(sections, 0)).toEqual([])
    expect(folderIdsOfSections(sections, 2)).toEqual(['frontend', 'ai', 'javascript'])
  })

  it('递归返回全部目录用于帮助中心默认展开', () => {
    expect(folderIdsOfSections(sections, 'all')).toEqual([
      'frontend',
      'ai',
      'javascript',
      'runtime',
    ])
  })
})
