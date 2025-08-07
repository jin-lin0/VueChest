/**
 * 验证工具函数
 */

/**
 * 验证邮箱格式
 * @param email 邮箱地址
 * @returns 是否为有效邮箱
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 验证手机号格式（中国大陆）
 * @param phone 手机号
 * @returns 是否为有效手机号
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$/
  return phoneRegex.test(phone)
}

/**
 * 验证身份证号格式（中国大陆）
 * @param idCard 身份证号
 * @returns 是否为有效身份证号
 */
export function isValidIdCard(idCard: string): boolean {
  const idCardRegex = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/
  return idCardRegex.test(idCard)
}

/**
 * 验证URL格式
 * @param url URL地址
 * @returns 是否为有效URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 验证密码强度
 * @param password 密码
 * @returns 密码强度等级：0-弱，1-中，2-强
 */
export function getPasswordStrength(password: string): number {
  let strength = 0

  // 长度检查
  if (password.length >= 8) strength++

  // 包含数字
  if (/\d/.test(password)) strength++

  // 包含小写字母
  if (/[a-z]/.test(password)) strength++

  // 包含大写字母
  if (/[A-Z]/.test(password)) strength++

  // 包含特殊字符
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++

  return Math.min(strength, 2)
}

/**
 * 验证是否为数字
 * @param value 要验证的值
 * @returns 是否为数字
 */
export function isNumber(value: any): boolean {
  return typeof value === 'number' && !isNaN(value)
}

/**
 * 验证是否为空
 * @param value 要验证的值
 * @returns 是否为空
 */
export function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}
