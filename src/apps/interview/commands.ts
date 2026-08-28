import { STORAGE_KEYS } from '@/config'
import { getStorage } from '@/lib/storage'
import { defineAppCommandProvider } from '@/lib/app-command'
import type { InterviewLearningState } from './progress'

export function useInterviewCommandProvider() {
  return defineAppCommandProvider({
    appKey: 'builtin:12',
    appName: '面试题库',
    commands: () => {
      const learning = getStorage<InterviewLearningState | null>(STORAGE_KEYS.INTERVIEW_LEARNING)
      const lastQuestionId = learning?.lastQuestionId || null
      const navigateToPractice =
        (practice: string) =>
        ({ router }: { router: import('vue-router').Router }) => {
          router.push({
            path: '/interview',
            query: { practice, command: String(Date.now()) },
          })
        }

      return [
        {
          id: 'interview-random',
          label: '随机模拟一道面试题',
          description: '从当前题库随机抽取一道题开始口述练习',
          icon: 'Q',
          keywords: ['面试', '随机', '抽题', '练习', 'question'],
          priority: 82,
          execute: navigateToPractice('all'),
        },
        {
          id: 'interview-unpracticed',
          label: '练习一道新题',
          description: '优先从尚未练习的题目中抽取',
          icon: '+',
          keywords: ['面试', '新题', '未练习', '学习'],
          priority: 72,
          execute: navigateToPractice('unpracticed'),
        },
        {
          id: 'interview-review',
          label: '复习一道薄弱题',
          description: '从标记为需要复习的题目中抽取',
          icon: '↻',
          keywords: ['面试', '复习', '薄弱', 'review'],
          priority: 70,
          execute: navigateToPractice('review'),
        },
        {
          id: 'interview-continue',
          label: '继续上次面试练习',
          description: lastQuestionId ? `继续题目 #${lastQuestionId}` : '还没有上次练习记录',
          icon: '▶',
          keywords: ['面试', '继续', '上次', 'resume'],
          priority: 78,
          disabledReason: () => (lastQuestionId ? null : '还没有上次练习记录'),
          execute: navigateToPractice('continue'),
        },
      ]
    },
  })
}
