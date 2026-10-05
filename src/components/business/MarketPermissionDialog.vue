<script setup lang="ts">
/**
 * 全局唯一的「安装 / 更新权限确认」弹窗。
 *
 * 数据源是 market store 的 `pendingPermissionConsent` —— 权限闸门写在 store 里
 * （见 ensureConsent），所以**任何入口**（市场列表、详情页、工作区模板恢复、
 * 跨设备同步）触发安装 / 更新都会走到这里，不存在漏掉弹窗的入口。
 *
 * 本组件刻意保持「无状态」：不自己判断该不该弹、也不自己发起安装，
 * 只负责把 store 给的请求渲染出来，并把用户的选择回传给 store 的 Promise。
 * 这样弹窗与业务逻辑不会各自演化出第二套判断标准。
 */
import { computed } from 'vue'
import { useMarketStore } from '@/stores/market'
import { permissionDetails } from '@/lib/sandbox-permissions'
import Modal from '@/components/common/Modal.vue'

const market = useMarketStore()

const consent = computed(() => market.pendingPermissionConsent)
const open = computed(() => consent.value !== null)
const isUpdate = computed(() => consent.value?.action === 'update')
const capabilityDetails = computed(() => permissionDetails(consent.value?.capabilities ?? []))

function approve() {
  market.resolvePermissionConsent(true)
}

function reject() {
  market.resolvePermissionConsent(false)
}
</script>

<template>
  <Modal
    :open="open"
    title="确认安装权限"
    width="min(520px, 94vw)"
    close-label="取消"
    @close="reject"
  >
    <div v-if="consent" class="permission-dialog">
      <p class="permission-lead">
        <span class="permission-icon">{{ consent.icon }}</span>
        将{{ isUpdate ? '更新' : '安装' }}
        <strong>{{ consent.appName }}</strong>
        <template v-if="consent.version"> v{{ consent.version }}</template>
      </p>

      <ul class="permission-baseline">
        <li>在隔离的 iframe 沙箱内运行，不能注册宿主路由或读取宿主存储。</li>
        <li>本地数据只写入该应用自己的命名空间。</li>
        <li v-if="consent.network.length">允许访问网络：{{ consent.network.join('、') }}</li>
        <li v-else>不允许访问网络。</li>
        <li>下载完成后核对 SHA-256；不一致会立即终止安装。</li>
      </ul>

      <ul v-if="capabilityDetails.length" class="permission-caps">
        <li v-for="item in capabilityDetails" :key="item.key">
          <strong>{{ item.label }}</strong
          >：{{ item.description }}
        </li>
      </ul>

      <p v-if="consent.addedNetwork.length" class="permission-warning">
        本次新增联网权限：{{ consent.addedNetwork.join('、') }}
      </p>
      <p v-if="consent.addedCapabilities.length" class="permission-warning">
        本次新增能力权限：{{ consent.addedCapabilities.length }} 项，确认后才会生效。
      </p>

      <div class="dialog-actions">
        <button type="button" @click="reject">取消</button>
        <button type="button" class="confirm-btn" @click="approve">确认并继续</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.permission-lead {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  color: var(--text-primary);
}

.permission-icon {
  font-size: var(--font-size-4xl);
  line-height: 1;
}

.permission-baseline,
.permission-caps {
  padding-left: 1.2rem;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
  line-height: 1.8;
}

.permission-caps {
  margin-top: 0.5rem;
  padding: 0.6rem 0.8rem 0.6rem 2rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  font-size: var(--font-size-control);
  line-height: 1.7;
}

.permission-warning {
  margin: 0.6rem 0 0;
  padding: 0.7rem 0.8rem;
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  color: #b45309;
  font-size: var(--font-size-control);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.1rem;
}

.dialog-actions > button {
  padding: 0.55rem 1rem;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: var(--font-size-body);
  cursor: pointer;
}

.dialog-actions > button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dialog-actions .confirm-btn {
  border-color: transparent;
  background: var(--gradient-primary);
  color: #fff;
  font-weight: 600;
}

.dialog-actions .confirm-btn:hover {
  opacity: 0.9;
  color: #fff;
}
</style>
