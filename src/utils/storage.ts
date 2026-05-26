/**
 * 本地存储工具函数
 */

/**
 * 设置本地存储
 * @param key 键名
 * @param value 值
 */
export function setStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error('设置本地存储失败:', error)
  }
}

/**
 * 获取本地存储
 * @param key 键名
 * @param defaultValue 默认值
 * @returns 存储的值或默认值
 */
export function getStorage<T>(key: string, defaultValue?: T): T | null {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue || null
  } catch (error) {
    console.error('获取本地存储失败:', error)
    return defaultValue || null
  }
}

/**
 * 删除本地存储
 * @param key 键名
 */
export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error('删除本地存储失败:', error)
  }
}

/**
 * 清空所有本地存储
 */
export function clearStorage(): void {
  try {
    localStorage.clear()
  } catch (error) {
    console.error('清空本地存储失败:', error)
  }
}

/**
 * 检查本地存储中是否存在指定键
 * @param key 键名
 * @returns 是否存在
 */
export function hasStorage(key: string): boolean {
  return localStorage.getItem(key) !== null
}
