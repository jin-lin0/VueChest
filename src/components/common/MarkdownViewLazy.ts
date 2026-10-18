import { defineAsyncComponent } from 'vue'

/**
 * 供交互后才出现正文的视图使用；首次渲染时加载 Markdown 依赖。
 * 首帧需要正文的页面应直接导入 MarkdownView。
 */
export default defineAsyncComponent(() => import('./MarkdownView.vue'))
