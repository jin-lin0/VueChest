/**
 * 由键值对构造 URLSearchParams 查询串，自动忽略空值（'' / undefined / null），
 * 用于统一 interview 内多处分页 / 搜索请求的参数拼装，避免重复构造逻辑。
 */
export const buildQuery = (
  params: Record<string, string | number | null | undefined>,
): string => {
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === '' || value === undefined || value === null) continue
    usp.append(key, String(value))
  }
  return usp.toString()
}
