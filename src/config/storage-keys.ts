export const STORAGE_KEYS = {
  HOME_APP_ORDER: 'home_app_order',
  HOME_APP_HIDDEN: 'home_app_hidden',
  TODO: 'todos',
  NOTES: 'notes',
  BOOKMARKS: 'bookmarks',
  POMODORO_SETTINGS: 'pomodoro-settings',
  POMODORO_HISTORY: 'pomodoro-history',
  EXPENSES: 'expenses',
  SPECIAL_DAYS: 'special_days',
  AI_CHAT_SESSIONS: 'ai-chat-sessions',
  AI_CHAT_API_KEY: 'ai-chat-api-key',
  AI_CHAT_MODEL: 'ai-chat-model',
  STOCK_FAVORITES: 'stock-favorites',
  MUSIC_VOLUME: 'music-volume',
  MUSIC_SEARCH_HISTORY: 'music-search-history',
  MUSIC_FAVORITES: 'music-favorites',
  MARKET_INSTALLED: 'market_installed_apps',
  MARKET_BUNDLE: 'market-bundle-',
} as const

export type StorageKeyType = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
