export type LearningStatus = 'learning' | 'review' | 'mastered'
export type LearningFilter = '' | 'unpracticed' | LearningStatus | 'favorite'

export interface QuestionProgress {
  status: LearningStatus
  attempts: number
  lastPracticedAt: number
}

export interface InterviewLearningState {
  version: 1
  records: Record<string, QuestionProgress>
  favorites: number[]
  lastQuestionId: number | null
}

export interface LearningStats {
  practiced: number
  learning: number
  review: number
  mastered: number
  unpracticed: number
  favorites: number
  progress: number
}

type QuestionLike = { id: number }

const STATUS_SET = new Set<LearningStatus>(['learning', 'review', 'mastered'])

export function createLearningState(legacyPracticedIds: number[] = []): InterviewLearningState {
  const now = Date.now()
  const records: Record<string, QuestionProgress> = Object.fromEntries(
    legacyPracticedIds
      .filter((id) => Number.isInteger(id) && id > 0)
      .map((id) => [
        String(id),
        { status: 'learning' as const, attempts: 1, lastPracticedAt: now },
      ]),
  )

  return {
    version: 1,
    records,
    favorites: [],
    lastQuestionId: null,
  }
}

export function normalizeLearningState(
  value: unknown,
  legacyPracticedIds: number[] = [],
): InterviewLearningState {
  const fallback = createLearningState(legacyPracticedIds)
  if (!value || typeof value !== 'object') return fallback

  const candidate = value as Partial<InterviewLearningState>
  const records: Record<string, QuestionProgress> = { ...fallback.records }

  if (candidate.records && typeof candidate.records === 'object') {
    for (const [key, recordValue] of Object.entries(candidate.records)) {
      const id = Number(key)
      if (!Number.isInteger(id) || id <= 0 || !recordValue || typeof recordValue !== 'object') {
        continue
      }

      const record = recordValue as Partial<QuestionProgress>
      if (!record.status || !STATUS_SET.has(record.status)) continue

      records[String(id)] = {
        status: record.status,
        attempts:
          Number.isInteger(record.attempts) && Number(record.attempts) > 0
            ? Number(record.attempts)
            : 1,
        lastPracticedAt:
          typeof record.lastPracticedAt === 'number' && Number.isFinite(record.lastPracticedAt)
            ? record.lastPracticedAt
            : Date.now(),
      }
    }
  }

  const favorites = Array.isArray(candidate.favorites)
    ? [
        ...new Set(
          candidate.favorites.filter((id) => Number.isInteger(id) && Number(id) > 0).map(Number),
        ),
      ]
    : []
  const lastQuestionId =
    Number.isInteger(candidate.lastQuestionId) && Number(candidate.lastQuestionId) > 0
      ? Number(candidate.lastQuestionId)
      : null

  return { version: 1, records, favorites, lastQuestionId }
}

export function getLearningStatus(
  state: InterviewLearningState,
  questionId: number,
): LearningStatus | null {
  return state.records[String(questionId)]?.status ?? null
}

export function updateQuestionProgress(
  state: InterviewLearningState,
  questionId: number,
  status: LearningStatus,
  now = Date.now(),
): InterviewLearningState {
  const previous = state.records[String(questionId)]
  return {
    ...state,
    records: {
      ...state.records,
      [String(questionId)]: {
        status,
        attempts: (previous?.attempts ?? 0) + 1,
        lastPracticedAt: now,
      },
    },
    lastQuestionId: questionId,
  }
}

export function setQuestionStatus(
  state: InterviewLearningState,
  questionId: number,
  status: LearningStatus,
  now = Date.now(),
): InterviewLearningState {
  const previous = state.records[String(questionId)]
  return {
    ...state,
    records: {
      ...state.records,
      [String(questionId)]: {
        status,
        attempts: Math.max(1, previous?.attempts ?? 0),
        lastPracticedAt: now,
      },
    },
    lastQuestionId: questionId,
  }
}

export function toggleFavorite(
  state: InterviewLearningState,
  questionId: number,
): InterviewLearningState {
  const favorites = new Set(state.favorites)
  if (favorites.has(questionId)) favorites.delete(questionId)
  else favorites.add(questionId)
  return { ...state, favorites: [...favorites] }
}

export function setLastQuestion(
  state: InterviewLearningState,
  questionId: number,
): InterviewLearningState {
  return { ...state, lastQuestionId: questionId }
}

export function calculateLearningStats(
  totalQuestions: number,
  state: InterviewLearningState,
): LearningStats {
  const records = Object.values(state.records)
  const learning = records.filter((record) => record.status === 'learning').length
  const review = records.filter((record) => record.status === 'review').length
  const mastered = records.filter((record) => record.status === 'mastered').length
  const practiced = records.length
  const safeTotal = Math.max(0, totalQuestions)

  return {
    practiced,
    learning,
    review,
    mastered,
    unpracticed: Math.max(0, safeTotal - practiced),
    favorites: state.favorites.length,
    progress: safeTotal ? Math.min(100, Math.round((mastered / safeTotal) * 100)) : 0,
  }
}

export function filterQuestionsByLearning<T extends QuestionLike>(
  questions: T[],
  filter: LearningFilter,
  state: InterviewLearningState,
): T[] {
  if (!filter) return questions
  const favorites = new Set(state.favorites)

  return questions.filter((question) => {
    const status = getLearningStatus(state, question.id)
    if (filter === 'unpracticed') return status === null
    if (filter === 'favorite') return favorites.has(question.id)
    return status === filter
  })
}
