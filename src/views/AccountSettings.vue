<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, useWorkspaceStore } from '@/stores'
import type { WorkspaceCloudConfig } from '@/stores/workspace'
import { useConfirm } from '@/composables/useConfirm'

const router = useRouter()
const auth = useAuthStore()
const workspace = useWorkspaceStore()
const { confirm } = useConfirm()

const cloud = ref<WorkspaceCloudConfig | null>(null)
const message = ref('')
const loading = ref(true)

async function refresh() {
  loading.value = true
  try {
    const [, remote] = await Promise.all([auth.fetchSessions(), workspace.fetchCloudWorkspace()])
    cloud.value = remote
  } catch (error) {
    message.value = error instanceof Error ? error.message : '加载账户设置失败'
  } finally {
    loading.value = false
  }
}

async function revoke(id: string, isCurrent: boolean) {
  const ok = await confirm(isCurrent ? '撤销当前设备后需要重新登录，确定继续吗？' : '确定退出这个设备吗？')
  if (!ok) return
  try {
    await auth.revokeSession(id)
    if (!auth.isAuthenticated) router.push('/login')
  } catch (error) {
    message.value = error instanceof Error ? error.message : '设备退出失败'
  }
}

async function revokeOthers() {
  const ok = await confirm('确定退出除当前设备外的所有登录设备吗？')
  if (!ok) return
  try {
    await auth.revokeOtherSessions()
    message.value = '其他设备已退出登录'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '其他设备退出失败'
  }
}

async function uploadCloud() {
  try {
    const uploaded = await workspace.pushToServer()
    if (!uploaded) throw new Error('云端上传失败，请稍后重试')
    cloud.value = await workspace.fetchCloudWorkspace()
    message.value = '当前工作区布局已上传'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '上传失败'
  }
}

async function downloadCloud() {
  const ok = await confirm('云端布局将覆盖本机的工作区结构，设备显示偏好不受影响。确定下载吗？')
  if (!ok) return
  try {
    await workspace.downloadCloudWorkspace()
    message.value = '云端布局已下载到本机'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '下载失败'
  }
}

async function deleteCloud() {
  const ok = await confirm('确定删除云端工作区布局吗？本机布局不会删除。')
  if (!ok) return
  try {
    await workspace.deleteCloudWorkspace()
    cloud.value = null
    message.value = '云端布局已删除'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除失败'
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div class="account-page">
    <header>
      <button class="back-btn" @click="router.push('/')">← 返回首页</button>
      <h1>设备与云端</h1>
      <p>管理登录设备和云端工作区布局。</p>
    </header>

    <p v-if="message" class="message">{{ message }}</p>
    <p v-if="loading" class="loading">加载中...</p>

    <template v-else>
      <section class="settings-card">
        <div class="section-head">
          <div>
            <h2>登录设备</h2>
            <p>撤销后对应设备的令牌会立即失效。</p>
          </div>
          <button v-if="auth.sessions.length > 1" @click="revokeOthers">退出其他设备</button>
        </div>
        <div class="session-list">
          <div v-for="session in auth.sessions" :key="session.id" class="session-item">
            <div>
              <strong>{{ session.deviceName }}</strong>
              <span v-if="session.isCurrent" class="current-tag">当前设备</span>
              <small>
                {{ session.ip || '未知 IP' }} · 最近活跃
                {{ new Date(session.lastActiveAt).toLocaleString() }}
              </small>
            </div>
            <button class="danger" @click="revoke(session.id, session.isCurrent)">退出</button>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="section-head">
          <div>
            <h2>云端工作区</h2>
            <p>只同步工作区结构和应用顺序，不上传设备显示偏好和最近使用。</p>
          </div>
        </div>
        <div v-if="cloud" class="cloud-summary">
          <strong>{{ cloud.workspaces.length }} 个工作区</strong>
          <span>{{ cloud.workspaces.map((item) => item.name).join('、') }}</span>
          <small>
            布局时间：{{ cloud.updatedAt > 0 ? new Date(cloud.updatedAt).toLocaleString() : '未记录' }}
          </small>
        </div>
        <p v-else class="empty-cloud">云端暂无工作区布局</p>
        <div class="cloud-actions">
          <button class="primary" @click="uploadCloud">上传本机布局</button>
          <button :disabled="!cloud" @click="downloadCloud">下载云端布局</button>
          <button class="danger" :disabled="!cloud" @click="deleteCloud">删除云端布局</button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.account-page {
  width: min(820px, calc(100% - 40px));
  min-height: 100%;
  margin: 0 auto;
  padding: 1.5rem 0 2rem;
}

header h1 {
  margin: 0.8rem 0 0;
  color: var(--text-primary);
  font-size: 1.7rem;
}

header p,
.section-head p,
.session-item small,
.cloud-summary span,
.cloud-summary small,
.empty-cloud {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.back-btn,
.section-head button,
.session-item button,
.cloud-actions button {
  padding: 0.48rem 0.78rem;
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  border-radius: 8px;
  background: var(--bg-glass);
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

.message {
  margin: 1rem 0;
  color: var(--accent);
}

.loading {
  padding: 3rem;
  color: var(--text-secondary);
  text-align: center;
}

.settings-card {
  margin-top: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
}

.section-head,
.session-item,
.cloud-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.section-head h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1rem;
}

.session-list {
  margin-top: 0.8rem;
}

.session-item {
  padding: 0.75rem 0;
  border-top: 1px solid var(--border-light);
}

.session-item > div,
.cloud-summary {
  display: flex;
  flex-direction: column;
}

.current-tag {
  width: fit-content;
  margin-top: 0.2rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--success-bg);
  color: var(--success);
  font-size: 0.68rem;
}

.cloud-summary {
  gap: 0.25rem;
  margin: 0.9rem 0;
  padding: 0.8rem;
  border-radius: 10px;
  background: var(--bg-card);
}

.cloud-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.cloud-actions .primary {
  border: 0;
  background: var(--gradient-primary);
  color: white;
}

.danger {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .account-page {
    width: calc(100% - 24px);
    padding-top: 1rem;
  }

  .session-item {
    align-items: flex-start;
  }
}
</style>
