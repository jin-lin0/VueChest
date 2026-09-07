import { describe, expect, it } from 'vitest'
import {
  calculateLearningStats,
  createLearningState,
  filterQuestionsByLearning,
  getLearningStatus,
  normalizeLearningState,
  setQuestionStatus,
  toggleFavorite,
  updateQuestionProgress,
} from '../progress'

describe('interview progress', () => {
  it('把旧的已练习 ID 迁移为练习中状态', () => {
    const state = normalizeLearningState(null, [2, 7])

    expect(getLearningStatus(state, 2)).toBe('learning')
    expect(getLearningStatus(state, 7)).toBe('learning')
  })

  it('忽略损坏记录并保留合法字段', () => {
    const state = normalizeLearningState({
      records: {
        1: { status: 'mastered', attempts: 2, lastPracticedAt: 100 },
        bad: { status: 'review' },
        3: { status: 'unknown' },
      },
      favorites: [1, 1, -2, 4],
      lastQuestionId: 4,
    })

    expect(state.records).toMatchObject({
      1: { status: 'mastered', attempts: 2, lastPracticedAt: 100 },
    })
    expect(state.favorites).toEqual([1, 4])
    expect(state.lastQuestionId).toBe(4)
  })

  it('更新自评状态并累计练习次数', () => {
    const initial = createLearningState()
    const reviewed = updateQuestionProgress(initial, 9, 'review', 100)
    const secondAttempt = updateQuestionProgress(reviewed, 9, 'review', 200)
    const mastered = setQuestionStatus(secondAttempt, 9, 'mastered', 300)

    expect(mastered.records['9']).toMatchObject({
      status: 'mastered',
      attempts: 2,
      lastPracticedAt: 300,
    })
    expect(mastered.lastQuestionId).toBe(9)
  })

  it('计算互斥学习状态和掌握进度', () => {
    let state = createLearningState([1])
    state = updateQuestionProgress(state, 2, 'review')
    state = updateQuestionProgress(state, 3, 'mastered')
    state = toggleFavorite(state, 2)

    expect(calculateLearningStats(5, state)).toMatchObject({
      practiced: 3,
      learning: 1,
      review: 1,
      mastered: 1,
      unpracticed: 2,
      favorites: 1,
      progress: 20,
    })
  })

  it('按学习状态和收藏筛选题目', () => {
    const questions = [{ id: 1 }, { id: 2 }, { id: 3 }]
    let state = createLearningState()
    state = updateQuestionProgress(state, 1, 'review')
    state = updateQuestionProgress(state, 2, 'mastered')
    state = toggleFavorite(state, 3)

    expect(filterQuestionsByLearning(questions, 'review', state)).toEqual([{ id: 1 }])
    expect(filterQuestionsByLearning(questions, 'unpracticed', state)).toEqual([{ id: 3 }])
    expect(filterQuestionsByLearning(questions, 'favorite', state)).toEqual([{ id: 3 }])
  })
})
