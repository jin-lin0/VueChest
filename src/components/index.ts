// 引用时统一从 '@/components' 命名导入。

// 通用 UI 组件
export { default as CustomSelect } from './common/CustomSelect.vue'
export type { SelectOption } from './common/CustomSelect.vue'
export { default as Tooltip } from './common/Tooltip.vue'
export { default as Toast } from './common/Toast.vue'
export { default as RouteLoadingBar } from './common/RouteLoadingBar.vue'
export { default as Skeleton } from './common/Skeleton.vue'
export { default as MarkdownView } from './common/MarkdownView.vue'
export { default as Collapse } from './common/Collapse.vue'
export { default as Drawer } from './common/Drawer.vue'
export { default as Modal } from './common/Modal.vue'
export { default as CopyButton } from './common/CopyButton.vue'
export { default as EmptyState } from './common/EmptyState.vue'
export { default as DocNavTree, DOC_EXPANDED_KEY } from './DocNavTree.vue'

// 平台业务组件
export { default as LoginDropdown } from './business/LoginDropdown.vue'
export { default as MusicPlayer } from './business/MusicPlayer.vue'
export { default as DonatePanel } from './business/DonatePanel.vue'
export { default as DonorsWall } from './business/DonorsWall.vue'
