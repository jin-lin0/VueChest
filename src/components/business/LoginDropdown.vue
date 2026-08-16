<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores'
import { api } from '@/lib/request'
import { Toast } from '@/components'
import { roleText } from '@/utils'

const router = useRouter()
const authStore = useAuthStore()

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const showDropdown = ref(false)

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function closeDropdown() {
  showDropdown.value = false
}

function goToLogin() {
  showDropdown.value = false
  router.push('/login')
}

function getRoleLabel(role?: string) {
  return roleText(role ?? '')
}

function handleLogout() {
  authStore.logout()
  showDropdown.value = false
}

async function uploadAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) return showToast('error', '头像不能超过 2MB')

  try {
    const { data } = await api.post<{ data: { key: string; uploadUrl: string } }>(
      '/api/uploads/presign',
      { kind: 'avatar', contentType: file.type, size: file.size, name: file.name },
    )
    const uploaded = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!uploaded.ok) throw new Error('upload failed')
    await api.post('/api/uploads/complete', { kind: 'avatar', key: data.key })
    await authStore.fetchUserInfo()
    showToast('success', '头像已更新')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '头像上传失败，请稍后重试')
  }
}

// ─── 修改昵称（内联编辑）───────────────────────
const editingName = ref(false)
const nameDraft = ref('')
const savingName = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)

function startEditName() {
  nameDraft.value = authStore.user?.username || ''
  editingName.value = true
  nextTick(() => nameInput.value?.focus())
}

function cancelEditName() {
  editingName.value = false
  nameDraft.value = ''
}

async function saveName() {
  const next = nameDraft.value.trim()
  if (!next) return showToast('warning', '昵称不能为空')
  if (next === authStore.user?.username) return cancelEditName()

  savingName.value = true
  try {
    const result = await authStore.updateProfile({ username: next })
    if (result.success) {
      showToast('success', result.message)
      editingName.value = false
    } else {
      showToast('error', result.message)
    }
  } finally {
    savingName.value = false
  }
}
</script>

<template>
  <div class="login-dropdown" @click.stop>
    <button class="user-btn" @click="toggleDropdown">
      <span class="user-icon">
        <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" alt="用户头像" />
        <span v-else>👤</span>
      </span>
      <span v-if="authStore.isAuthenticated" class="user-name">{{ authStore.user?.username }}</span>
    </button>

    <div v-if="showDropdown" class="dropdown-menu" @click="closeDropdown">
      <template v-if="authStore.isAuthenticated">
        <div class="dropdown-info">
          <div class="profile-row" @click.stop>
            <label class="profile-avatar" title="点击更换头像">
              <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" alt="用户头像" />
              <span v-else>{{ authStore.user?.username?.charAt(0).toUpperCase() }}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                @change="uploadAvatar"
              />
            </label>

            <template v-if="!editingName">
              <div class="profile-meta">
                <span class="profile-name-line">
                  <strong>{{ authStore.user?.username }}</strong>
                  <button class="name-edit-icon" title="修改昵称" @click.stop="startEditName">
                    <svg
                      viewBox="0 0 24 24"
                      width="13"
                      height="13"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                    </svg>
                  </button>
                </span>
                <span class="dropdown-role">{{ getRoleLabel(authStore.user?.role) }}</span>
              </div>
            </template>

            <div v-else class="name-edit">
              <input
                ref="nameInput"
                v-model="nameDraft"
                class="name-input"
                type="text"
                maxlength="20"
                placeholder="请输入新昵称"
                @keyup.enter="saveName"
                @keyup.esc="cancelEditName"
              />
              <div class="name-edit-actions">
                <button class="name-save" :disabled="savingName" @click.stop="saveName">
                  {{ savingName ? '保存中…' : '保存' }}
                </button>
                <button class="name-cancel" @click.stop="cancelEditName">取消</button>
              </div>
            </div>
          </div>
        </div>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item upload-link" @click.stop="$router.push('/market/upload')">
          📤 上传应用
        </button>
        <button v-if="authStore.isAdmin" class="dropdown-item" @click.stop="$router.push('/admin')">
          ⚙️ 管理后台
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item logout" @click.stop="handleLogout">退出登录</button>
      </template>
      <template v-else>
        <button class="dropdown-item" @click.stop="goToLogin">登录</button>
      </template>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.login-dropdown {
  position: relative;
}

.user-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: var(--bg-glass);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.user-btn:hover {
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
}

.user-icon {
  font-size: 1.1rem;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
}

.user-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.profile-avatar {
  position: relative;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  overflow: hidden;
  border-radius: 50%;
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 700;
  cursor: pointer;
  border: 2px solid transparent;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.profile-avatar:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-bg);
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-meta strong {
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-name-line {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}

.name-edit-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.name-edit-icon:hover {
  color: var(--accent);
  background: var(--accent-bg);
}

.user-name {
  color: var(--text-primary);
  font-weight: 600;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  max-width: 260px;
  background: var(--bg-glass);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  animation: dropIn 0.15s ease;
  overflow: hidden;
}

@keyframes dropIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-info {
  padding: 0.8rem 1rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.dropdown-role {
  font-weight: 500;
  white-space: nowrap;
}

/* 内联修改昵称 */
.name-edit {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.name-input {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--accent-light);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 0.85rem;
  outline: none;
}

.name-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-bg);
}

.name-edit-actions {
  display: flex;
  gap: 0.4rem;
}

.name-save,
.name-cancel {
  flex: 1;
  padding: 0.35rem 0;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.name-save {
  background: var(--accent);
  color: #fff;
}

.name-save:hover:not(:disabled) {
  filter: brightness(1.05);
}

.name-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.name-cancel {
  background: transparent;
  border-color: var(--border-light);
  color: var(--text-secondary);
}

.name-cancel:hover {
  background: rgba(0, 0, 0, 0.04);
}

.dropdown-divider {
  height: 1px;
  background: var(--border-light);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-primary);
  transition: background-color 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: rgba(102, 126, 234, 0.06);
}

.dropdown-item.logout {
  color: var(--danger);
}

.upload-link {
  color: var(--accent);
  font-weight: 600;
}
</style>
