// 组件统一导出入口
// 文件按 common（通用 UI，无业务耦合）/ business（平台业务，耦合 store/接口）分层，
// 引用时统一从 '@/components' 命名导入，目录清晰且路径简洁。

// 通用 UI 组件
export { default as CustomSelect } from './common/CustomSelect.vue'
export type { SelectOption } from './common/CustomSelect.vue'
export { default as Tooltip } from './common/Tooltip.vue'
export { default as Toast } from './common/Toast.vue'
export { default as RouteLoadingBar } from './common/RouteLoadingBar.vue'

// 平台业务组件
export { default as LoginDropdown } from './business/LoginDropdown.vue'
export { default as MusicPlayer } from './business/MusicPlayer.vue'
