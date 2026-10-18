<template>
  <div class="market-sandbox">
    <iframe
      ref="frame"
      class="market-sandbox__frame"
      :src="sandboxSrc"
      :sandbox="sandboxAttr"
      referrerpolicy="no-referrer"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getStorage } from '@/lib/storage'
import { useTheme } from '@/composables/useTheme'
import { useMarketStore } from '@/stores/market'
import {
  collectSandboxStorage,
  handleSandboxMessage,
  type SandboxCapabilities,
} from '@/lib/sandbox-bridge'
import { normalizePermissions, type SandboxPermission } from '@/lib/sandbox-permissions'

defineOptions({ name: 'MarketAppSandbox' })

const props = defineProps<{ appId: number | string }>()

const frame = ref<HTMLIFrameElement | null>(null)
const { isDark } = useTheme()
const market = useMarketStore()
const router = useRouter()

// 沙箱属性：allow-scripts 允许执行 JS；不开启 allow-same-origin，
// 使 iframe 处于 opaque origin，隔离其 cookie / 存储 / 同源访问。
const sandboxAttr = 'allow-scripts allow-forms allow-popups allow-modals'
const sandboxSrc = `${import.meta.env.BASE_URL}sandbox.html`

// 默认拒绝网络和扩展能力；仅采用安装时已确认的应用元数据。
const caps: SandboxCapabilities = { allowNetwork: [], permissions: [] }

let bootstrapped = false

function postToFrame(msg: unknown) {
  frame.value?.contentWindow?.postMessage(msg, '*')
}

const onMessage = (ev: MessageEvent) => {
  // 只接受来自本应用 iframe 的消息，杜绝其他窗口伪造能力请求
  if (ev.source !== frame.value?.contentWindow) return
  const msg = ev.data
  if (!msg || typeof msg !== 'object') return

  if (msg.kind === 'ready') {
    void bootstrap()
    return
  }

  // 沙箱应用「返回」按钮：history.back / go(-1) 被沙箱委托上来，由父站回退路由
  if (msg.kind === 'history-back') {
    router.back()
    return
  }

  void handleSandboxMessage(msg, props.appId, caps, (resp) => postToFrame(resp))
}

async function bootstrap() {
  if (bootstrapped) return
  bootstrapped = true

  try {
    // 解析联网白名单与能力权限：优先取本地已安装记录（离线可用），缺项时实时拉详情。
    // 这两份都来自服务端 app 元数据（上传/审核时声明），是受信任真源，非 bundle 自声明。
    const entry = market.installedApps.find((a) => a.id === Number(props.appId))
    let allowNetwork: string[] = entry?.allowNetwork || []
    let permissions: SandboxPermission[] = normalizePermissions(entry?.permissions)
    // 空权限数组也是有效配置；只有字段缺失时才回源。
    if (!Array.isArray(entry?.allowNetwork) || !Array.isArray(entry?.permissions)) {
      const detail = await market.fetchAppDetail(Number(props.appId))
      if (!Array.isArray(entry?.allowNetwork)) allowNetwork = detail?.allowNetwork || []
      if (!Array.isArray(entry?.permissions)) permissions = normalizePermissions(detail?.permissions)
    }
    caps.allowNetwork = allowNetwork
    caps.permissions = permissions

    // 本地无缓存（如跨设备 / 清过 storage / 直接深度链接）时，从服务端按需拉取并缓存
    let code = getStorage<string>(`market-bundle-${props.appId}`, '')
    if (!code) {
      code = (await market.ensureBundle(Number(props.appId))) || ''
    }
    if (!code) throw new Error('应用包缺失')

    // 读快照会碰 IndexedDB（可能被隐私模式禁用 / 打开失败）。这条一旦 reject，
    // 沙箱就永远等不到 bootstrap —— 所以必须走同一个错误出口，不能只落一条控制台日志。
    const storage = await collectSandboxStorage(props.appId)

    postToFrame({
      kind: 'bootstrap',
      appId: props.appId,
      bundle: code,
      storage,
      permissions,
      theme: isDark.value,
      // 供沙箱把回包 postMessage 钉死到父站 origin，避免被无关页面接收
      parentOrigin: window.location.origin,
    })
  } catch (error) {
    // 任何一个环节失败（取元数据 / 下载应用包 / 读存储快照）都必须显式告诉沙箱，
    // 否则用户只看到一个空白 iframe，既没有解释也没有重试入口。
    console.error('沙箱应用启动失败:', error)
    postToFrame({ kind: 'error', message: '应用无法加载' })
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', onMessage)
})

// 主题切换时推送给沙箱应用
watch(isDark, (v) => {
  postToFrame({ kind: 'theme', isDark: v })
})
</script>

<style scoped>
.market-sandbox {
  height: 100%;
  width: 100%;
}
.market-sandbox__frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: transparent;
}
</style>