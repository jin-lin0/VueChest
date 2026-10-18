/** 仅使用非空 Error.message，其余抛出值使用 fallback。 */
export function errorMessage(error: unknown, fallback = '未知错误'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
