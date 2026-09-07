export type LearningStatus = 'learning' | 'review' | 'mastered'
export type LearningFilter = '' | 'due' | 'unpracticed' | LearningStatus | 'favorite'

export interface QuestionProgress {
  status: LearningStatus
  attempts: number
  lastPracticedAt: number
  nextReviewAt?: number
  reviewIntervalDays?: number
}

export interface InterviewLearningState {
  version: 1
  records: Record<string, QuestionProgress>
  favorites: number[]
  lastQuestionId: number | null
  dailyGoal?: number
  practiceDays?: Record<string, number[]>
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
    dailyGoal: 10,
    practiceDays: {},
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

  for (const [id, record] of Object.entries(records)) {
    const raw = candidate.records?.[id]
    const interval = raw?.reviewIntervalDays
    record.reviewIntervalDays =
      typeof interval === 'number' && Number.isInteger(interval) && interval >= 1 && interval <= 60
        ? interval
        : defaultReviewDays(record.status)
    record.nextReviewAt =
      typeof raw?.nextReviewAt === 'number' &&
      Number.isFinite(raw.nextReviewAt) &&
      raw.nextReviewAt > 0
        ? raw.nextReviewAt
        : nextReviewTime(record.lastPracticedAt, record.reviewIntervalDays)
  }
  const practiceDays: Record<string, number[]> = {}
  if (candidate.practiceDays && typeof candidate.practiceDays === 'object') {
    for (const [day, ids] of Object.entries(candidate.practiceDays)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 90)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(ids)) continue
      const parsed = new Date(`${day}T12:00:00`)
      if (!Number.isFinite(parsed.getTime()) || practiceDayKey(parsed.getTime()) !== day) continue
      practiceDays[day] = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(
        0,
        1000,
      )
    }
  }
  return {
    version: 1,
    records,
    favorites,
    lastQuestionId,
    dailyGoal: normalizeDailyGoal(candidate.dailyGoal),
    practiceDays,
  }
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
        ...reviewSchedule(status, previous, now),
      },
    },
    lastQuestionId: questionId,
    practiceDays: recordPracticeDay(state.practiceDays || {}, questionId, now),
  }
}

export function setQuestionStatus(
  state: InterviewLearningState,
  questionId: number,
  status: LearningStatus,
  now = Date.now(),
  attemptBase?: QuestionProgress | null,
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
        ...reviewSchedule(status, attemptBase === undefined ? previous : attemptBase, now),
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
  now = Date.now(),
): T[] {
  if (filter === 'due') return getDueQuestions(questions, state, now)
  if (!filter) return questions
  const favorites = new Set(state.favorites)

  return questions.filter((question) => {
    const status = getLearningStatus(state, question.id)
    if (filter === 'unpracticed') return status === null
    if (filter === 'favorite') return favorites.has(question.id)
    return status === filter
  })
}

export function practiceDayKey(now = Date.now()): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function defaultReviewDays(status: LearningStatus) {
  return status === 'review' ? 1 : status === 'learning' ? 3 : 7
}

function nextReviewTime(now: number, days: number) {
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function reviewSchedule(
  status: LearningStatus,
  previous: QuestionProgress | null | undefined,
  now: number,
) {
  const reviewIntervalDays =
    status === 'mastered' && previous?.status === 'mastered'
      ? Math.min(60, (previous.reviewIntervalDays || 7) * 2)
      : defaultReviewDays(status)
  return { reviewIntervalDays, nextReviewAt: nextReviewTime(now, reviewIntervalDays) }
}

export function normalizeDailyGoal(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100
    ? value
    : 10
}

function recordPracticeDay(days: Record<string, number[]>, questionId: number, now: number) {
  const day = practiceDayKey(now)
  const next = { ...days, [day]: [...new Set([...(days[day] || []), questionId])] }
  return Object.fromEntries(
    Object.entries(next)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 90),
  )
}

export function todayPracticeCount(state: InterviewLearningState, now = Date.now()) {
  return new Set(state.practiceDays?.[practiceDayKey(now)] || []).size
}

export function getDueQuestions<T extends QuestionLike>(
  questions: T[],
  state: InterviewLearningState,
  now = Date.now(),
): T[] {
  const dueAt = (id: number) => {
    const record = state.records[String(id)]
    return record
      ? (record.nextReviewAt ??
          nextReviewTime(
            record.lastPracticedAt,
            record.reviewIntervalDays || defaultReviewDays(record.status),
          ))
      : Infinity
  }
  const priority = { review: 0, learning: 1, mastered: 2 }
  return questions
    .filter((question) => dueAt(question.id) <= now)
    .sort(
      (a, b) =>
        dueAt(a.id) - dueAt(b.id) ||
        priority[state.records[String(a.id)].status] -
          priority[state.records[String(b.id)].status] ||
        a.id - b.id,
    )
}
