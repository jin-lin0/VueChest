/**
 * 从任意抛出物里取一条**能直接给用户看**的文案。
 *
 * 语义固定为「只有真正的 Error 才用它的 message，其余一律回落到 fallback」：
 * 直接用 `String(error)` 会把 `[object Object]`、`undefined`、`null` 之类喂到界面上，
 * 用户看到的是一行比没有提示更让人困惑的东西。
 *
 * 另外，`Error` 的 message 为空串时也走 fallback —— 弹一个空白的红条等于没弹。
 */
export function errorMessage(error: unknown, fallback = '未知错误'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
