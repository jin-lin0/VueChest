<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import DonorsWall from './DonorsWall.vue'

withDefaults(defineProps<{ showWall?: boolean }>(), { showWall: true })

interface DonateConfig {
  wechat?: string
  alipay?: string
}

const config = ref<DonateConfig>({})

const wechat = computed(() => config.value.wechat?.trim() || '')
const alipay = computed(() => config.value.alipay?.trim() || '')

const hasAny = computed(() => !!(wechat.value || alipay.value))

// 收款码配置来自站点静态文件 public/donate-config.json（微信/支付宝填 R2 等图床链接，留空则不展示）
onMounted(async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}donate-config.json`, { cache: 'no-cache' })
    if (res.ok) config.value = (await res.json()) as DonateConfig
  } catch {
    // 配置缺失则全部渠道隐藏
  }
})
</script>

<template>
  <section class="donate-panel">
    <h3 class="donate-panel-title">
      <span>💝</span> 打赏支持
    </h3>
    <p class="donate-panel-hint">
      以下收款方式由站长配置，资金直达站长个人账户，平台不经手。扫码即可支持，感谢你的每一份心意。
    </p>

    <div v-if="!hasAny" class="donate-empty">
      站长尚未配置收款码，敬请期待 🙏
    </div>

    <div v-else class="donate-grid">
      <div v-if="wechat" class="donate-channel">
        <span class="donate-channel-name">微信</span>
        <img class="donate-qr" :src="wechat" alt="微信收款码" />
      </div>
      <div v-if="alipay" class="donate-channel">
        <span class="donate-channel-name">支付宝</span>
        <img class="donate-qr" :src="alipay" alt="支付宝收款码" />
      </div>
    </div>

    <div v-if="showWall" class="donate-wall-wrap">
      <DonorsWall />
    </div>
  </section>
</template>

<style scoped>
.donate-panel {
  margin-top: var(--space-6);
  padding-top: var(--space-6);
  border-top: 1px solid var(--border-light);
}
.donate-panel-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 18px;
  color: var(--text-primary);
  margin: 0 0 var(--space-2);
}
.donate-panel-hint {
  margin: 0 0 var(--space-4);
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
}
.donate-empty {
  padding: var(--space-5);
  text-align: center;
  color: var(--text-muted);
  background: var(--bg-subtle);
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-md);
}
.donate-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.donate-channel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.donate-channel-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}
.donate-qr {
  width: 180px;
  height: 180px;
  object-fit: contain;
  border-radius: var(--radius-sm);
  background: #fff;
  padding: 6px;
  box-shadow: var(--shadow-sm);
}
.donate-wall-wrap {
  margin-top: var(--space-5);
}
</style>
