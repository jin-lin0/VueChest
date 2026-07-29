<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted, onBeforeUnmount, provide } from 'vue'
import type { Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Drawer } from '@/components'

import TextTransformTool from './components/TextTransformTool.vue'
import Base64Tool from './components/Base64Tool.vue'
import TimestampTool from './components/TimestampTool.vue'
import UrlTool from './components/UrlTool.vue'
import HtmlEntityTool from './components/HtmlEntityTool.vue'
import UnicodeTool from './components/UnicodeTool.vue'
import JwtTool from './components/JwtTool.vue'
import TimezoneTool from './components/TimezoneTool.vue'
import CronTool from './components/CronTool.vue'
import DurationTool from './components/DurationTool.vue'
import JsonTool from './components/JsonTool.vue'
import JsonCsvTool from './components/JsonCsvTool.vue'
import YamlTool from './components/YamlTool.vue'
import XmlTool from './components/XmlTool.vue'
import MarkdownTool from './components/MarkdownTool.vue'
import RadixTool from './components/RadixTool.vue'
import NamingTool from './components/NamingTool.vue'
import HashTool from './components/HashTool.vue'
import GeneratorTool from './components/GeneratorTool.vue'
import TextStatsTool from './components/TextStatsTool.vue'
import LinesTool from './components/LinesTool.vue'
import CaseTool from './components/CaseTool.vue'
import DiffTool from './components/DiffTool.vue'
import ColorTool from './components/ColorTool.vue'
import QueryTool from './components/QueryTool.vue'
import UaTool from './components/UaTool.vue'
import QrTool from './components/QrTool.vue'
import RegexTool from './components/RegexTool.vue'
// 第二批新增工具
import TomlTool from './components/TomlTool.vue'
import IniTool from './components/IniTool.vue'
import QueryJsonTool from './components/QueryJsonTool.vue'
import FormDataTool from './components/FormDataTool.vue'
import CurlTool from './components/CurlTool.vue'
import JsonSchemaTool from './components/JsonSchemaTool.vue'
import PunycodeTool from './components/PunycodeTool.vue'
import HexDumpTool from './components/HexDumpTool.vue'
import GzipTool from './components/GzipTool.vue'
import ImageBase64Tool from './components/ImageBase64Tool.vue'
import PaletteTool from './components/PaletteTool.vue'
import ToolList from './components/ToolList.vue'
import { REALTIME_KEY, REGISTER_KEY } from './composables/useRealtime'

defineOptions({ name: 'DevToolboxView' })

const router = useRouter()
const route = useRoute()

/* ---------- 全局「实时转换」开关 ---------- */
const REALTIME_STORE_KEY = 'dev-toolbox:realtime'
const realtimeEnabled = ref(localStorage.getItem(REALTIME_STORE_KEY) !== '0')
const activeConverter = ref<(() => void) | null>(null)

// 下发开关给各工具；并提供一个注册入口，让外壳「立即转换」按钮能调用当前工具的转换函数
provide(REALTIME_KEY, realtimeEnabled)
provide(REGISTER_KEY, (fn: (() => void) | null) => {
  activeConverter.value = fn
})

watch(realtimeEnabled, (v) => localStorage.setItem(REALTIME_STORE_KEY, v ? '1' : '0'))

interface ToolDef {
  id: string
  name: string
  icon: string
  desc: string
  component: Component
  group: string
}

/* 新增工具只需在此登记一项即可出现在左侧导航（按 group 自动分组） */
const tools: ToolDef[] = [
  {
    id: 'text-transform',
    name: '文本转换',
    icon: '🔧',
    group: '文本处理',
    desc: '粘贴文本 / JSON，写 JS 转换代码，规则存本地',
    component: TextTransformTool,
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    icon: '🔤',
    group: '编码解码',
    desc: 'UTF-8 安全的 Base64 编码 / 解码，支持 URL-safe',
    component: Base64Tool,
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    icon: '🕒',
    group: '时间日期',
    desc: '时间戳与日期互转，支持秒 / 毫秒与本地 / UTC',
    component: TimestampTool,
  },
  {
    id: 'url',
    name: 'URL 编解码',
    icon: '🔗',
    group: '编码解码',
    desc: '编码 / 解码 URL 参数，区分全编码与组件编码',
    component: UrlTool,
  },
  {
    id: 'html-entity',
    name: 'HTML 实体',
    icon: '🧩',
    group: '编码解码',
    desc: 'HTML 实体编解码（防 XSS 预览）',
    component: HtmlEntityTool,
  },
  {
    id: 'unicode',
    name: 'Unicode 查看',
    icon: '🔣',
    group: '编码解码',
    desc: '字符→码点 / UTF-8 字节，支持输入码点查字符',
    component: UnicodeTool,
  },
  {
    id: 'jwt',
    name: 'JWT 解析',
    icon: '🪪',
    group: '编码解码',
    desc: '拆分三段 base64url 解码，格式化 header / payload 并提示过期',
    component: JwtTool,
  },
  {
    id: 'timezone',
    name: '时区转换',
    icon: '🌐',
    group: '时间日期',
    desc: '同一时刻多时区对照，列出常用时区',
    component: TimezoneTool,
  },
  {
    id: 'cron',
    name: 'Cron 解析',
    icon: '⏰',
    group: '时间日期',
    desc: '解析表达式，计算最近 5 次执行时间',
    component: CronTool,
  },
  {
    id: 'duration',
    name: '时长计算',
    icon: '⏱️',
    group: '时间日期',
    desc: '两时间差算天 / 时 / 分 / 秒，支持倒计时',
    component: DurationTool,
  },
  {
    id: 'json',
    name: 'JSON 工具',
    icon: '🧾',
    group: '格式化转换',
    desc: 'JSON 格式化 / 压缩 / 转义（复用 CodeEditor）',
    component: JsonTool,
  },
  {
    id: 'json-csv',
    name: 'JSON↔CSV',
    icon: '📊',
    group: '格式化转换',
    desc: 'JSON 数组与 CSV 互转',
    component: JsonCsvTool,
  },
  {
    id: 'yaml',
    name: 'YAML 转换',
    icon: '📄',
    group: '格式化转换',
    desc: 'YAML ↔ JSON',
    component: YamlTool,
  },
  {
    id: 'xml',
    name: 'XML 转换',
    icon: '📰',
    group: '格式化转换',
    desc: 'XML ↔ JSON',
    component: XmlTool,
  },
  {
    id: 'markdown',
    name: 'MD 转换',
    icon: '📝',
    group: '格式化转换',
    desc: 'Markdown ↔ HTML',
    component: MarkdownTool,
  },
  {
    id: 'radix',
    name: '进制转换',
    icon: '🔢',
    group: '格式化转换',
    desc: '2 / 8 / 10 / 16 进制互转',
    component: RadixTool,
  },
  {
    id: 'naming',
    name: '命名转换',
    icon: '🆎',
    group: '格式化转换',
    desc: 'camel / snake / kebab / Pascal 互转',
    component: NamingTool,
  },
  {
    id: 'toml',
    name: 'TOML 转换',
    icon: '🗂️',
    group: '格式化转换',
    desc: 'TOML ↔ JSON',
    component: TomlTool,
  },
  {
    id: 'ini',
    name: 'INI 转换',
    icon: '⚙️',
    group: '格式化转换',
    desc: 'INI / .properties ↔ JSON',
    component: IniTool,
  },
  {
    id: 'query-json',
    name: 'Query↔JSON',
    icon: '🔎',
    group: '格式化转换',
    desc: 'URL 查询串与 JSON 互转',
    component: QueryJsonTool,
  },
  {
    id: 'form-data',
    name: 'FormData↔JSON',
    icon: '📨',
    group: '格式化转换',
    desc: 'multipart / x-www-form-urlencoded 与 JSON 互转',
    component: FormDataTool,
  },
  {
    id: 'hash',
    name: '哈希/HMAC',
    icon: '🔐',
    group: '加密生成',
    desc: 'MD5 / SHA1 / 256 / 512 与 HMAC，输入即算',
    component: HashTool,
  },
  {
    id: 'generator',
    name: '生成器',
    icon: '🎲',
    group: '加密生成',
    desc: 'UUID / 随机密码 / 随机数 / 抽奖',
    component: GeneratorTool,
  },
  {
    id: 'text-stats',
    name: '文本统计',
    icon: '🔤',
    group: '文本处理',
    desc: '字数 / 字符 / 行数 / 字节统计',
    component: TextStatsTool,
  },
  {
    id: 'lines',
    name: '行处理',
    icon: '📋',
    group: '文本处理',
    desc: '行去重 / 排序 / 过滤 / 去空行',
    component: LinesTool,
  },
  {
    id: 'case',
    name: '大小写',
    icon: '🔠',
    group: '文本处理',
    desc: '大小写 / 全半角转换',
    component: CaseTool,
  },
  {
    id: 'diff',
    name: '文本对比',
    icon: '➿',
    group: '文本处理',
    desc: '左右两栏差异对比（diff 库）',
    component: DiffTool,
  },
  {
    id: 'color',
    name: '颜色转换',
    icon: '🎨',
    group: '前端网络',
    desc: 'HEX / RGB / HSL 互转 + 预览',
    component: ColorTool,
  },
  {
    id: 'query',
    name: 'Query 解析',
    icon: '🔍',
    group: '前端网络',
    desc: 'URL 查询参数解析 / 拼接为表格',
    component: QueryTool,
  },
  {
    id: 'ua',
    name: 'UA 解析',
    icon: '🕵️',
    group: '前端网络',
    desc: '解析 User-Agent 的浏览器 / 系统 / 设备',
    component: UaTool,
  },
  {
    id: 'qrcode',
    name: '二维码',
    icon: '📱',
    group: '前端网络',
    desc: '文本 / URL 生成二维码图片',
    component: QrTool,
  },
  {
    id: 'regex',
    name: '正则测试',
    icon: '🧬',
    group: '前端网络',
    desc: '输入文本 + 正则，列出所有匹配项',
    component: RegexTool,
  },
  {
    id: 'curl',
    name: 'Curl↔Fetch',
    icon: '🌀',
    group: '前端网络',
    desc: 'Curl 命令与 Fetch / axios 互转',
    component: CurlTool,
  },
  {
    id: 'json-schema',
    name: 'JSON Schema',
    icon: '📐',
    group: '前端网络',
    desc: '用 JSON Schema 校验 JSON 数据',
    component: JsonSchemaTool,
  },
  {
    id: 'punycode',
    name: 'Punycode/IDN',
    icon: '🌍',
    group: '编码解码',
    desc: '国际化域名与 Punycode 互转',
    component: PunycodeTool,
  },
  {
    id: 'hexdump',
    name: 'Hex 转储',
    icon: '🧱',
    group: '编码解码',
    desc: '文本 / 字节的十六进制转储与还原',
    component: HexDumpTool,
  },
  {
    id: 'gzip',
    name: 'Gzip 编解码',
    icon: '🗜️',
    group: '编码解码',
    desc: 'Gzip 压缩为 Base64 / 解压还原',
    component: GzipTool,
  },
  {
    id: 'image-base64',
    name: '图片→Base64',
    icon: '🖼️',
    group: '图片媒体',
    desc: '本地图片转 DataURL / Base64',
    component: ImageBase64Tool,
  },
  {
    id: 'palette',
    name: '主色调提取',
    icon: '🎭',
    group: '图片媒体',
    desc: '从图片提取主要颜色调色板',
    component: PaletteTool,
  },
]

const GROUP_ORDER = [
  '文本处理',
  '编码解码',
  '时间日期',
  '格式化转换',
  '加密生成',
  '前端网络',
  '图片媒体',
]

const ACTIVE_KEY = 'dev-toolbox:active'
const PIN_KEY = 'dev-toolbox:pinned'
const COLLAPSE_KEY = 'dev-toolbox:collapsed'

const activeId = ref('text-transform')
const pinnedIds = ref<string[]>([])
const collapsedGroups = reactive<Set<string>>(new Set())
const search = ref('')
// 移动端：侧边栏以抽屉形式滑出，drawerOpen 控制显隐
const drawerOpen = ref(false)

const toolExists = (id: string | null | undefined) => !!id && tools.some((t) => t.id === id)

function loadCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (raw) JSON.parse(raw).forEach((g: string) => collapsedGroups.add(g))
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  const saved = localStorage.getItem(ACTIVE_KEY)
  if (saved && toolExists(saved)) activeId.value = saved

  try {
    const raw = localStorage.getItem(PIN_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) pinnedIds.value = arr.filter(toolExists)
    }
  } catch {
    pinnedIds.value = []
  }
  loadCollapsed()
  document.addEventListener('click', closeMenu)
  document.addEventListener('keydown', onKey)

  // 深链：?tool=xxx 优先于本地缓存
  const qTool = typeof route.query.tool === 'string' ? route.query.tool : undefined
  if (toolExists(qTool)) selectTool(qTool!, { syncRoute: false })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenu)
  document.removeEventListener('keydown', onKey)
})

function selectTool(id: string, opts: { syncRoute?: boolean } = {}) {
  if (!toolExists(id)) return
  activeId.value = id
  localStorage.setItem(ACTIVE_KEY, id)
  if (opts.syncRoute !== false) {
    const next = { ...route.query, tool: id }
    router.replace({ query: next }).catch(() => {})
  }
}

// 外部改变 ?tool= 时同步切换
watch(
  () => route.query.tool,
  (v) => {
    const id = typeof v === 'string' ? v : undefined
    if (toolExists(id) && id !== activeId.value) selectTool(id!, { syncRoute: false })
  },
)

const pinnedSet = computed(() => new Set(pinnedIds.value))

const orderedTools = computed<ToolDef[]>(() => {
  const pinned = pinnedIds.value
    .map((id) => tools.find((t) => t.id === id))
    .filter((t): t is ToolDef => Boolean(t))
  const rest = tools.filter((t) => !pinnedSet.value.has(t.id))
  return [...pinned, ...rest]
})

const q = computed(() => search.value.trim().toLowerCase())
const filteredTools = computed(() => {
  if (!q.value) return tools
  return tools.filter(
    (t) =>
      t.name.toLowerCase().includes(q.value) ||
      t.desc.toLowerCase().includes(q.value) ||
      t.id.includes(q.value),
  )
})

const sidebarSections = computed(() => {
  const sections: {
    key: string
    title: string
    items: ToolDef[]
    collapsible?: boolean
    collapsed?: boolean
  }[] = []

  if (q.value) {
    sections.push({
      key: '__search',
      title: `🔍 搜索 "${search.value}"`,
      items: filteredTools.value,
    })
    return sections
  }

  const ordered = orderedTools.value

  // 置顶
  const pinned = ordered.filter((t) => pinnedSet.value.has(t.id))
  if (pinned.length) sections.push({ key: '__pinned', title: '📌 置顶', items: pinned })

  // 分组（支持折叠）
  for (const g of GROUP_ORDER) {
    const items = ordered.filter((t) => !pinnedSet.value.has(t.id) && t.group === g)
    if (!items.length) continue
    const collapsed = collapsedGroups.has(g)
    sections.push({ key: g, title: g, items: collapsed ? [] : items, collapsible: true, collapsed })
  }
  return sections
})

const activeTool = computed(() => tools.find((t) => t.id === activeId.value) ?? tools[0])

/* ---------- 分组折叠 ---------- */
function toggleCollapse(key: string) {
  if (collapsedGroups.has(key)) collapsedGroups.delete(key)
  else collapsedGroups.add(key)
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedGroups]))
}

/* ---------- 右键置顶菜单 ---------- */
const menu = reactive<{ visible: boolean; x: number; y: number; toolId: string | null }>({
  visible: false,
  x: 0,
  y: 0,
  toolId: null,
})

function openMenu(e: MouseEvent, id: string) {
  e.preventDefault()
  menu.toolId = id
  menu.x = e.clientX
  menu.y = e.clientY
  menu.visible = true
}

function closeMenu() {
  menu.visible = false
  menu.toolId = null
}

function closeDrawer() {
  drawerOpen.value = false
}

function onToolClick(id: string) {
  selectTool(id)
  closeDrawer()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeMenu()
    closeDrawer()
  }
}

function isPinned(id: string) {
  return pinnedSet.value.has(id)
}

function pinTool() {
  if (!menu.toolId || isPinned(menu.toolId)) return
  pinnedIds.value = [menu.toolId, ...pinnedIds.value.filter((x) => x !== menu.toolId)]
  localStorage.setItem(PIN_KEY, JSON.stringify(pinnedIds.value))
  closeMenu()
}

function unpinTool() {
  if (!menu.toolId || !isPinned(menu.toolId)) return
  pinnedIds.value = pinnedIds.value.filter((x) => x !== menu.toolId)
  localStorage.setItem(PIN_KEY, JSON.stringify(pinnedIds.value))
  closeMenu()
}

function resetPins() {
  pinnedIds.value = []
  localStorage.removeItem(PIN_KEY)
  closeMenu()
}
</script>

<template>
  <div class="tb-app">
    <header class="tb-header">
      <button class="tb-menu-btn" aria-label="打开工具列表" @click="drawerOpen = true">☰</button>
      <button class="back-btn" @click="router.push('/')">
        ← <span class="back-label">返回</span>
      </button>
      <div class="tb-title">
        <h1>🧰 开发工具箱</h1>
        <p class="tb-sub">{{ activeTool.desc }}</p>
      </div>

      <div class="tb-realtime">
        <label
          class="rt-switch"
          :title="realtimeEnabled ? '输入即实时转换' : '关闭后需点「立即转换」'"
        >
          <input type="checkbox" v-model="realtimeEnabled" />
          <span class="rt-track"><span class="rt-thumb"></span></span>
          <span class="rt-text">实时转换</span>
        </label>
        <button
          v-if="!realtimeEnabled && activeConverter"
          class="rt-run"
          @click="activeConverter?.()"
        >
          ⚡ 立即转换
        </button>
      </div>
    </header>

    <div class="tb-body">
      <nav class="tb-sidebar vc-scrollbar vc-scrollbar--thin" @scroll="closeMenu">
        <ToolList
          v-model:search="search"
          :sections="sidebarSections"
          :active-id="activeId"
          :pinned-ids="pinnedIds"
          :empty="!!(q && !filteredTools.length)"
          @select="onToolClick"
          @ctxmenu="openMenu"
          @toggle="toggleCollapse"
        />
      </nav>

      <main class="tb-content">
        <component :is="activeTool.component" />
      </main>
    </div>

    <!-- 移动端抽屉：与桌面侧栏共用 ToolList -->
    <Drawer :open="drawerOpen" @close="closeDrawer">
      <ToolList
        v-model:search="search"
        :sections="sidebarSections"
        :active-id="activeId"
        :pinned-ids="pinnedIds"
        :empty="!!(q && !filteredTools.length)"
        @select="onToolClick"
        @ctxmenu="openMenu"
        @toggle="toggleCollapse"
      />
    </Drawer>

    <!-- 右键菜单 -->
    <div
      v-if="menu.visible"
      class="tb-ctx-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      @click.stop
    >
      <button
        class="tb-ctx-item"
        :disabled="menu.toolId ? isPinned(menu.toolId) : true"
        @click="pinTool"
      >
        📌 置顶
      </button>
      <button
        class="tb-ctx-item"
        :disabled="menu.toolId ? !isPinned(menu.toolId) : true"
        @click="unpinTool"
      >
        ↩️ 取消置顶
      </button>
      <div class="tb-ctx-sep"></div>
      <button class="tb-ctx-item" @click="resetPins">🔄 重置置顶</button>
    </div>
  </div>
</template>

<style scoped>
.tb-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-body);
}
.tb-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid var(--border-light);
}
.tb-title h1 {
  margin: 0;
  font-size: 1.4rem;
  color: var(--text-primary);
}
.tb-sub {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.back-btn {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
}
.back-btn:hover {
  color: var(--text-primary);
}
.back-label {
  display: inline;
}
.tb-menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
}
.tb-menu-btn:hover {
  color: var(--text-primary);
}

/* 全局「实时转换」开关 */
.tb-realtime {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.rt-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
.rt-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.rt-track {
  position: relative;
  width: 38px;
  height: 20px;
  border-radius: 999px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);
  flex: none;
}
.rt-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-muted);
  transition:
    transform var(--transition-fast),
    background var(--transition-fast);
}
.rt-switch input:checked + .rt-track {
  background: var(--accent);
  border-color: var(--accent);
}
.rt-switch input:checked + .rt-track .rt-thumb {
  transform: translateX(18px);
  background: var(--accent-contrast);
}
.rt-switch input:focus-visible + .rt-track {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.rt-text {
  font-weight: 500;
}
.rt-run {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border: none;
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}
.rt-run:hover {
  filter: brightness(1.05);
}

.tb-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.tb-sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-light);
  padding: 0.6rem 0.6rem 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.tb-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 让直接子组件（各工具根节点）填充内容区，避免由 flex 撑出的高度上 height:100% 塌陷留白 */
.tb-content > :deep(*) {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}

/* 右键菜单 */
.tb-ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 132px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md, var(--shadow-sm));
  padding: 0.3rem;
}
.tb-ctx-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.45rem 0.7rem;
  border: none;
  background: transparent;
  color: var(--text-body);
  cursor: pointer;
  border-radius: var(--radius-xs);
  font-size: 0.85rem;
}
.tb-ctx-item:hover:not(:disabled) {
  background: var(--bg-subtle);
  color: var(--text-primary);
}
.tb-ctx-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tb-ctx-sep {
  height: 1px;
  margin: 0.25rem 0.3rem;
  background: var(--border-light);
}

@media (max-width: 720px) {
  /* 顶栏：换行紧凑、隐藏副标题与「返回」文字、显示汉堡按钮 */
  .tb-header {
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    padding: 0.8rem 1rem 0.7rem;
  }
  .tb-menu-btn {
    display: inline-flex;
  }
  .back-btn {
    padding: 0.4rem 0.6rem;
  }
  .back-label {
    display: none;
  }
  .tb-title {
    flex: 1;
    min-width: 0;
  }
  .tb-title h1 {
    font-size: 1.15rem;
  }
  .tb-sub {
    display: none;
  }
  .tb-realtime {
    margin-left: 0;
    gap: 0.4rem;
  }

  /* 侧边栏改为抽屉：隐藏桌面 nav，改用 Drawer */
  .tb-sidebar {
    display: none;
  }
}

@media (max-width: 420px) {
  /* 极窄屏：实时开关只留开关本身，省空间 */
  .rt-text {
    display: none;
  }
}
</style>
