import { describe, expect, it } from 'vitest'
import {
  createLearningState,
  getDueQuestions,
  normalizeLearningState,
  practiceDayKey,
  setQuestionStatus,
  todayPracticeCount,
  updateQuestionProgress,
} from '../progress'

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).getTime()
describe('daily review schedule', () => {
  it('orders due questions by date and weakness, excluding future and removed questions', () => {
    const state = createLearningState()
    state.records = {
      1: { status: 'mastered', attempts: 2, lastPracticedAt: at(1), nextReviewAt: at(5) },
      2: { status: 'review', attempts: 1, lastPracticedAt: at(1), nextReviewAt: at(5) },
      3: { status: 'review', attempts: 1, lastPracticedAt: at(5), nextReviewAt: at(8) },
      999: { status: 'review', attempts: 1, lastPracticedAt: at(1), nextReviewAt: at(2) },
    }
    expect(
      getDueQuestions([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], state, at(7)).map(
        (item) => item.id,
      ),
    ).toEqual([2, 1])
  })

  it('counts distinct questions each local day and survives a serialized reload', () => {
    let state = createLearningState()
    state = updateQuestionProgress(state, 1, 'learning', at(7, 23))
    state = updateQuestionProgress(state, 1, 'learning', at(7, 23))
    state = updateQuestionProgress(state, 2, 'review', at(7, 23))
    state = normalizeLearningState(JSON.parse(JSON.stringify(state)))
    expect(todayPracticeCount(state, at(7, 23))).toBe(2)
    expect(todayPracticeCount(state, at(8, 0))).toBe(0)
    state = updateQuestionProgress(state, 1, 'mastered', at(8, 0))
    expect(todayPracticeCount(state, at(8))).toBe(1)
    expect(state.practiceDays?.[practiceDayKey(at(7))]).toEqual([1, 2])
  })

  it('uses one-day, three-day and seven-day starts and does not double a single attempt twice', () => {
    let state = createLearningState()
    state = updateQuestionProgress(state, 1, 'review', at(7))
    state = updateQuestionProgress(state, 2, 'learning', at(7))
    state = updateQuestionProgress(state, 3, 'mastered', at(7))
    expect(state.records['1'].nextReviewAt).toBe(at(8, 0))
    expect(state.records['2'].nextReviewAt).toBe(at(10, 0))
    expect(state.records['3'].nextReviewAt).toBe(at(14, 0))
    const base = { ...state.records['3'] }
    state = updateQuestionProgress(state, 3, 'mastered', at(14))
    state = setQuestionStatus(state, 3, 'mastered', at(14), base)
    state = setQuestionStatus(state, 3, 'mastered', at(14), base)
    expect(state.records['3'].reviewIntervalDays).toBe(14)
    expect(state.records['3'].attempts).toBe(2)
    state = setQuestionStatus(state, 3, 'review', at(14), base)
    expect(state.records['3'].reviewIntervalDays).toBe(1)
  })

  it('upgrades old progress without inventing daily activity and sanitizes invalid dates', () => {
    const state = normalizeLearningState({
      records: { 1: { status: 'review', attempts: 5, lastPracticedAt: at(1) } },
      dailyGoal: -1,
      practiceDays: { '2026-02-31': [1], '2026-09-06': [1, 1, -2] },
    })
    expect(state.records['1'].nextReviewAt).toBe(at(2, 0))
    expect(state.records['1'].attempts).toBe(5)
    expect(state.dailyGoal).toBe(10)
    expect(state.practiceDays).toEqual({ '2026-09-06': [1] })
    expect(todayPracticeCount(state, at(7))).toBe(0)
  })

  it('keeps review boundaries at local midnight and caps long-term intervals', () => {
    let state = createLearningState()
    state = updateQuestionProgress(state, 1, 'mastered', new Date(2026, 2, 7, 23, 30).getTime())
    for (let i = 0; i < 10; i++)
      state = updateQuestionProgress(state, 1, 'mastered', state.records['1'].nextReviewAt!)
    expect(state.records['1'].reviewIntervalDays).toBe(60)
    const due = new Date(state.records['1'].nextReviewAt!)
    expect([due.getHours(), due.getMinutes()]).toEqual([0, 0])
  })
})
