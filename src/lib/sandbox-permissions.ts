/**
 * 沙箱应用「能力权限」清单。
 *
 * 第三方应用在应用包 `meta.permissions` 里声明需要的能力，上传时由服务端解析写入
 * `market_apps.permissions` / 版本记录；安装或更新时若相比已授权集合新增了权限，
 * 需要用户显式确认。
 *
 * 运行时宿主只放行**已声明且已授权**的能力，未授权的能力调用会被沙箱桥直接拒绝。
 *
 * 注意：网络域名白名单（`allowNetwork`）不在这里 —— 它按域名逐个授权，是独立机制。
 */

export interface SandboxPermissionMeta {
  /** 面向用户的短标签 */
  label: string
  /** 面向用户的一句话说明 */
  description: string
  /** 是否要求用户已登录（未登录时调用会返回错误） */
  requiresAuth: boolean
}

export const SANDBOX_PERMISSIONS: Record<string, SandboxPermissionMeta> = {
  notify: {
    label: '显示通知',
    description: '在站内弹出提示消息',
    requiresAuth: false,
  },
  clipboard: {
    label: '剪贴板',
    description: '读取与写入系统剪贴板',
    requiresAuth: false,
  },
  profile: {
    label: '账号信息',
    description: '读取你的用户名与头像',
    requiresAuth: true,
  },
  cloud: {
    label: '云端存储',
    description: '把你的数据同步到云端',
    requiresAuth: true,
  },
  ai: {
    label: 'AI 能力',
    description: '调用站内 AI 模型生成内容',
    requiresAuth: true,
  },
  files: {
    label: '文件上传',
    description: '上传图片或文件到站内存储',
    requiresAuth: true,
  },
}

export type SandboxPermission = keyof typeof SANDBOX_PERMISSIONS

export const SANDBOX_PERMISSION_KEYS = Object.keys(SANDBOX_PERMISSIONS) as SandboxPermission[]

export function isSandboxPermission(value: unknown): value is SandboxPermission {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SANDBOX_PERMISSIONS, value)
}

/** 归一化：去重、去空、剔除未知权限键。服务端与前端共用同一套判定。 */
export function normalizePermissions(input: unknown): SandboxPermission[] {
  const list = Array.isArray(input) ? input : []
  return [...new Set(list.filter(isSandboxPermission))]
}

/** 相对已授权集合，计算**新增**的权限（用于安装 / 更新时的授权确认）。 */
export function addedPermissions(previous: unknown, next: unknown): SandboxPermission[] {
  const approved = new Set(normalizePermissions(previous))
  return normalizePermissions(next).filter((item) => !approved.has(item))
}

/** 把权限键翻译成面向用户的标签，用于授权弹窗文案。 */
export function permissionLabels(keys: unknown): string[] {
  return normalizePermissions(keys).map((key) => SANDBOX_PERMISSIONS[key].label)
}

/** 权限键 → 「标签：说明」，用于逐条展示。 */
export function permissionDetails(keys: unknown): { key: SandboxPermission; label: string; description: string }[] {
  return normalizePermissions(keys).map((key) => ({
    key,
    label: SANDBOX_PERMISSIONS[key].label,
    description: SANDBOX_PERMISSIONS[key].description,
  }))
}
