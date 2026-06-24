export interface Category {
  id: number
  name: string
  description?: string
  Questions?: Array<{ id: number }>
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Question {
  id: number
  title: string
  options: string[] | null
  answer: string
  analysis: string | null
  difficulty: Difficulty
  categoryId: number
  tags: string[]
  createdAt?: string
}

export interface QuestionQueryResult {
  questions: Question[]
  total: number
  page: number
  totalPages: number
}
