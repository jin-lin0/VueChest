<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMarketStore } from '@/stores/market'
import type { MarketComment } from '@/stores/market'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ appId: number }>()
const market = useMarketStore()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const comments = ref<MarketComment[]>([])
const ratingSummary = ref<{ average: number | null; count: number }>({
  average: null,
  count: 0,
})
const loading = ref(false)
const error = ref('')
const page = ref(1)
const PAGE_SIZE = 10
const hasMore = computed(() => page.value * PAGE_SIZE < topLevel.value.length)

const newContent = ref('')
const newRating = ref(0)
const hoverRating = ref<number | null>(null)
const submitting = ref(false)

const replyingTo = ref<number | null>(null)
const replyContent = ref('')

const topLevel = computed(() => comments.value.filter((c) => !c.parentId))
const repliesOf = (pid: number) =>
  comments.value
    .filter((c) => c.parentId === pid)
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )

function formatTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = 60_000
  const h = 3_600_000
  const day = 86_400_000
  if (diff < m) return '刚刚'
  if (diff < h) return `${Math.floor(diff / m)} 分钟前`
  if (diff < day) return `${Math.floor(diff / h)} 小时前`
  if (diff < day * 30) return `${Math.floor(diff / day)} 天前`
  return d.toLocaleDateString()
}

function avatarText(name?: string): string {
  return (name || '?').charAt(0).toUpperCase()
}

async function load() {
  loading.value = true
  page.value = 1
  error.value = ''
  try {
    const data = await market.fetchComments(props.appId)
    if (data) {
      comments.value = data.items || []
      ratingSummary.value = data.ratingSummary || { average: null, count: 0 }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '评论加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function goLogin() {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}

async function submit() {
  const text = newContent.value.trim()
  if (!text || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await market.postComment(props.appId, {
      content: text,
      rating: newRating.value || undefined,
    })
    newContent.value = ''
    newRating.value = 0
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '评论发布失败'
  } finally {
    submitting.value = false
  }
}

async function submitReply(parentId: number) {
  const text = replyContent.value.trim()
  if (!text) return
  error.value = ''
  try {
    await market.postComment(props.appId, { content: text, parentId })
    replyContent.value = ''
    replyingTo.value = null
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '回复失败'
  }
}

async function remove(commentId: number) {
  error.value = ''
  try {
    await market.deleteComment(commentId)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

function toggleReply(id: number) {
  replyingTo.value = replyingTo.value === id ? null : id
  replyContent.value = ''
}
</script>

<template>
  <div class="comments-section detail-section">
    <h2>
      用户评论
      <span v-if="ratingSummary.count" class="rating-summary">
        均分 {{ ratingSummary.average }} · {{ ratingSummary.count }} 人评分
      </span>
    </h2>

    <!-- 编辑器 -->
    <div v-if="auth.isAuthenticated" class="comment-editor">
      <div v-if="!replyingTo" class="rating-pick">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          class="star-btn"
          :class="{ active: (hoverRating || newRating) >= n }"
          :aria-label="`${n} 星`"
          @mouseenter="hoverRating = n"
          @mouseleave="hoverRating = null"
          @focus="hoverRating = n"
          @blur="hoverRating = null"
          @click="newRating = n"
        >
          <svg viewBox="0 0 24 24" class="star-svg">
            <path d="M12 2l2.9 6.26 6.83.6-5.18 4.51 1.55 6.66L12 15.9 5.9 20.5l1.55-6.66L2.27 8.86l6.83-.6L12 2z" />
          </svg>
        </button>
        <span class="rating-hint">{{ (hoverRating || newRating) ? `${hoverRating || newRating} 星` : '点击评分（可选）' }}</span>
      </div>
      <textarea
        v-model="newContent"
        class="comment-input"
        rows="3"
        maxlength="1000"
        placeholder="说点什么吧…（≤1000 字）"
      ></textarea>
      <div class="editor-actions">
        <span class="char-count">{{ newContent.length }}/1000</span>
        <button class="submit-btn" :disabled="submitting || !newContent.trim()" @click="submit">
          {{ submitting ? '提交中…' : '发表评论' }}
        </button>
      </div>
    </div>
    <div v-else class="login-tip">
      请 <button class="login-link" @click="goLogin">登录</button> 后参与评论
    </div>

    <p v-if="error" class="comment-error">{{ error }}</p>

    <!-- 列表 -->
    <div v-if="loading" class="loading-state">加载中…</div>
    <div v-else-if="!topLevel.length" class="empty-state">还没有评论，来抢沙发～</div>
    <template v-else>
      <div v-for="c in topLevel.slice(0, page * PAGE_SIZE)" :key="c.id" class="comment-item">
        <img
          v-if="c.author?.avatar"
          class="avatar"
          :src="c.author.avatar"
          :alt="c.author.username"
        />
        <div v-else class="avatar avatar-letter">{{ avatarText(c.author?.username) }}</div>

        <div class="comment-main">
          <div class="comment-head">
            <span class="username">{{ c.author?.username || '用户' }}</span>
            <span v-if="c.rating" class="stars">
              <svg
                v-for="n in 5"
                :key="n"
                viewBox="0 0 24 24"
                class="star-svg small"
                :class="{ active: c.rating >= n }"
              >
                <path d="M12 2l2.9 6.26 6.83.6-5.18 4.51 1.55 6.66L12 15.9 5.9 20.5l1.55-6.66L2.27 8.86l6.83-.6L12 2z" />
              </svg>
            </span>
            <span class="time">{{ formatTime(c.createdAt) }}</span>
          </div>
          <p class="comment-content">{{ c.content }}</p>
          <div class="comment-actions">
            <button v-if="auth.isAuthenticated" class="link-btn" @click="toggleReply(c.id)">
              回复
            </button>
            <button v-if="c.canDelete" class="link-btn danger" @click="remove(c.id)">
              删除
            </button>
          </div>

          <!-- 楼中楼 -->
          <div v-if="repliesOf(c.id).length" class="replies">
            <div v-for="r in repliesOf(c.id)" :key="r.id" class="reply-item">
              <img
                v-if="r.author?.avatar"
                class="avatar small"
                :src="r.author.avatar"
                :alt="r.author.username"
              />
              <div v-else class="avatar small avatar-letter">
                {{ avatarText(r.author?.username) }}
              </div>
              <div class="reply-main">
                <div class="comment-head">
                  <span class="username">{{ r.author?.username || '用户' }}</span>
                  <span class="time">{{ formatTime(r.createdAt) }}</span>
                </div>
                <p class="comment-content">{{ r.content }}</p>
                <button v-if="r.canDelete" class="link-btn danger" @click="remove(r.id)">
                  删除
                </button>
              </div>
            </div>
          </div>

          <!-- 回复框 -->
          <div v-if="replyingTo === c.id" class="reply-editor">
            <textarea
              v-model="replyContent"
              rows="2"
              maxlength="1000"
              class="comment-input"
              :placeholder="`回复 @${c.author?.username || '用户'}`"
            ></textarea>
            <div class="editor-actions">
              <button class="submit-btn" :disabled="!replyContent.trim()" @click="submitReply(c.id)">
                回复
              </button>
              <button class="link-btn" @click="toggleReply(c.id)">取消</button>
            </div>
          </div>
        </div>
      </div>

      <button v-if="hasMore" class="load-more" @click="page++">加载更多</button>
    </template>
  </div>
</template>

<style scoped>
.comments-section {
  margin-top: 1.5rem;
}

.rating-summary {
  font-size: var(--font-size-control);
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 0.5rem;
}

.comment-editor {
  margin-bottom: 1.5rem;
}

.rating-pick {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.6rem;
}

.star-btn {
  display: inline-flex;
  padding: 0;
  margin: 0;
  border: none;
  background: none;
  cursor: pointer;
  line-height: 0;
  transition: transform 0.12s ease;
}

.star-btn:hover {
  transform: scale(1.18);
}

.star-svg {
  width: 1.5rem;
  height: 1.5rem;
  fill: var(--border);
  transition: fill 0.15s ease;
}

.star-svg.active {
  fill: #f5a623;
}

.star-svg.small {
  width: 0.95rem;
  height: 0.95rem;
}

.rating-hint {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
  margin-left: 0.4rem;
}

.comment-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.7rem 0.9rem;
  font-size: var(--font-size-body-lg);
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-card);
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease;
}

.comment-input:focus {
  border-color: var(--accent);
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.8rem;
  margin-top: 0.5rem;
}

.char-count {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
}

.submit-btn {
  padding: 0.5rem 1.4rem;
  background: var(--gradient-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: var(--font-size-body);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.login-tip {
  font-size: var(--font-size-body-lg);
  color: var(--text-secondary);
  padding: 0.8rem 0;
}

.login-link {
  background: none;
  border: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  font-size: inherit;
}

.comment-error {
  color: var(--danger);
  font-size: var(--font-size-body);
  margin: 0.5rem 0;
}

.loading-state,
.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 1.5rem;
  font-size: var(--font-size-body);
}

.comment-item {
  display: flex;
  gap: 0.8rem;
  padding: 1rem 0;
  border-top: 1px solid var(--border);
}

.comment-item:first-child {
  border-top: none;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-subtle);
}

.avatar.small {
  width: 30px;
  height: 30px;
  font-size: var(--font-size-control);
}

.avatar-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--accent);
  background: var(--tag-bg);
}

.comment-main {
  flex: 1;
  min-width: 0;
}

.comment-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.3rem;
  flex-wrap: wrap;
}

.username {
  font-weight: 600;
  color: var(--text-primary);
  font-size: var(--font-size-body);
}

.stars {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.time {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
}

.comment-content {
  font-size: var(--font-size-body-lg);
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0.2rem 0;
}

.comment-actions {
  display: flex;
  gap: 1rem;
  margin-top: 0.3rem;
}

.link-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-control);
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  color: var(--accent);
}

.link-btn.danger:hover {
  color: var(--danger);
}

.replies {
  margin-top: 0.8rem;
  padding-left: 0.8rem;
  border-left: 2px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.reply-item {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
}

.reply-main {
  flex: 1;
  min-width: 0;
}

.reply-editor {
  margin-top: 0.6rem;
}

.load-more {
  display: block;
  margin: 1rem auto 0;
  padding: 0.5rem 1.6rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
  cursor: pointer;
  transition: all 0.2s ease;
}

.load-more:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
