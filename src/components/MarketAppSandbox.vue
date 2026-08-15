<template>
  <div class="market-sandbox">
    <iframe
      ref="frame"
      class="market-sandbox__frame"
      :src="sandboxSrc"
      :sandbox="sandboxAttr"
      @load="onLoad"
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

// 能力白名单：默认拒绝一切网络。运行时从应用元数据（已安装记录或详情）注入
// 其声明的 allowNetwork，第三方应用必须显式声明域名白名单才会被放行。
const caps: SandboxCapabilities = { allowNetwork: [] }

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
    bootstrap()
    return
  }

  // 沙箱应用「返回」按钮：history.back / go(-1) 被沙箱委托上来，由父站回退路由
  if (msg.kind === 'history-back') {
    router.back()
    return
  }

  handleSandboxMessage(msg, props.appId, caps, (resp) => postToFrame(resp))
}

async function bootstrap() {
  if (bootstrapped) return
  bootstrapped = true

  // 解析联网白名单：优先取本地已安装记录（离线可用），否则实时拉详情。
  // 这一份来自服务端 app 元数据（上传/审核时声明），是受信任真源，非 bundle 自声明。
  let allowNetwork: string[] = []
  const entry = market.installedApps.find((a) => a.id === Number(props.appId))
  if (entry?.allowNetwork?.length) {
    allowNetwork = entry.allowNetwork
  } else {
    const detail = await market.fetchAppDetail(Number(props.appId))
    allowNetwork = detail?.allowNetwork || []
  }
  caps.allowNetwork = allowNetwork

  // 本地无缓存（如跨设备 / 清过 storage / 直接深度链接）时，从服务端按需拉取并缓存
  let code = getStorage<string>(`market-bundle-${props.appId}`, '')
  if (!code) {
    code = (await market.ensureBundle(Number(props.appId))) || ''
  }
  if (!code) {
    postToFrame({ kind: 'error', message: '应用无法加载' })
    return
  }

  collectSandboxStorage(props.appId).then((storage) => {
    postToFrame({
      kind: 'bootstrap',
      appId: props.appId,
      bundle: code,
      storage,
      theme: isDark.value,
      // 供沙箱把回包 postMessage 钉死到父站 origin，避免被无关页面接收
      parentOrigin: window.location.origin,
    })
  })
}

function onLoad() {
  // iframe 脚本就绪后会 post ready，届时触发 bootstrap
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