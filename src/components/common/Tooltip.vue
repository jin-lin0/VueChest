<template>
  <span class="vc-tooltip" :class="[`is-${placement}`, { 'is-disabled': disabled }]">
    <span class="vc-tooltip-trigger" tabindex="0">
      <slot />
    </span>
    <span class="vc-tooltip-pop" role="tooltip" :style="{ maxWidth }">
      <slot name="content">{{ text }}</slot>
    </span>
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 气泡内容：纯文本/简单字符串；有 #content 插槽时以插槽为准 */
    text?: string
    /** 气泡相对触发元素的位置 */
    placement?: 'top' | 'bottom' | 'left' | 'right'
    /** 禁用后不响应悬停、不显示气泡 */
    disabled?: boolean
    /** 气泡最大宽度（支持 CSS 长度，如 '290px' 或 'min(300px, 88vw)'） */
    maxWidth?: string
  }>(),
  {
    text: '',
    placement: 'top',
    disabled: false,
    maxWidth: '290px',
  },
)

defineOptions({ name: 'VcTooltip' })
</script>

<style scoped>
.vc-tooltip {
  /* 配色用 CSS 变量，优先跟随全局主题 token，缺失时回退暗色浮层 */
  --vc-tooltip-bg: var(--bg-inverse, #1f2937);
  --vc-tooltip-fg: var(--text-inverse, #f9fafb);
  --vc-tooltip-fg-strong: var(--text-inverse-strong, #ffffff);
  --vc-tooltip-link: var(--accent, #93c5fd);

  position: relative;
  display: inline-flex;
  align-items: center;
}

.vc-tooltip-trigger {
  display: inline-flex;
  align-items: center;
  outline: none;
}

.vc-tooltip-pop {
  position: absolute;
  z-index: 1000;
  width: max-content;
  padding: 0.6rem 0.8rem;
  background: var(--vc-tooltip-bg);
  color: var(--vc-tooltip-fg);
  font-size: var(--font-size-small);
  line-height: 1.65;
  font-weight: 400;
  text-align: left;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity var(--transition-fast),
    visibility var(--transition-fast);
}

/* 插槽内容在气泡内的默认排版（b/strong 高亮、a 用主题色） */
.vc-tooltip-pop :slotted(b),
.vc-tooltip-pop :slotted(strong) {
  color: var(--vc-tooltip-fg-strong);
  font-weight: 600;
}
.vc-tooltip-pop :slotted(a) {
  color: var(--vc-tooltip-link);
}

/* 显示：悬停 或 键盘聚焦（focus-within，trigger 可 tab 聚焦） */
.vc-tooltip:not(.is-disabled):hover .vc-tooltip-pop,
.vc-tooltip:not(.is-disabled):focus-within .vc-tooltip-pop {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

/* 禁用态：彻底不响应 */
.vc-tooltip.is-disabled {
  pointer-events: none;
}
.vc-tooltip.is-disabled .vc-tooltip-pop {
  display: none;
}

/* —— 四个方向定位（定位 transform 与淡入动画解耦，避免冲突）—— */
.vc-tooltip.is-top .vc-tooltip-pop {
  bottom: 100%;
  left: 50%;
  margin-bottom: 8px;
  transform: translateX(-50%);
}
.vc-tooltip.is-bottom .vc-tooltip-pop {
  top: 100%;
  left: 50%;
  margin-top: 8px;
  transform: translateX(-50%);
}
.vc-tooltip.is-left .vc-tooltip-pop {
  right: 100%;
  top: 50%;
  margin-right: 8px;
  transform: translateY(-50%);
}
.vc-tooltip.is-right .vc-tooltip-pop {
  left: 100%;
  top: 50%;
  margin-left: 8px;
  transform: translateY(-50%);
}
</style>
