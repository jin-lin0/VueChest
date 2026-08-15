// 集中维护认证相关的 localStorage key，避免 request.ts / auth.ts 各自重复定义、靠约定维持一致
export const TOKEN_KEY = 'auth_token'
export const USER_INFO_KEY = 'auth_user_info'
