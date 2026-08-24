<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CarFront,
  ChevronLeft,
  Crosshair,
  Download,
  Flame,
  Gamepad2,
  Gauge,
  Medal,
  Music2,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  Upload,
} from '@lucide/vue'
import { getStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { loadRacingSave } from '@/apps/racing/storage'
import { loadSettings as loadRhythmSettings } from '@/apps/rhythm/core/settings'
import {
  dailyChallenge,
  exportGameArchive,
  importGameArchive,
  isDailyChallengeComplete,
  loadGameProfile,
  type GameCenterProfile,
  type GameId,
} from './profile'

defineOptions({ name: 'GameCenterView' })

interface GameCard {
  id: GameId
  name: string
  route: string
  description: string
  meta: string[]
  tone: string
  icon: typeof CarFront
}

const router = useRouter()
const profile = ref<GameCenterProfile>(loadGameProfile())
const racing = ref(loadRacingSave())
const rhythm = ref(loadRhythmSettings())
const survivorBest = ref(getStorage<number>(STORAGE_KEYS.SURVIVOR_BEST_SCORE, 0) || 0)
const todayChallenge = computed(() => dailyChallenge(new Date()))
const archiveInput = ref<HTMLInputElement | null>(null)
const challengeCompleted = computed(() => isDailyChallengeComplete(profile.value))

const games: GameCard[] = [
  {
    id: 'racing',
    name: '3D 赛车',
    route: '/racing',
    description: '竞速、计时赛、淘汰赛、道具赛与锦标赛',
    meta: ['本地双人', 'AI 对手', '幽灵记录'],
    tone: 'cyan',
    icon: CarFront,
  },
  {
    id: 'neon-survivor',
    name: '星渊幸存者',
    route: '/neon-survivor',
    description: '六分钟双摇杆生存射击与随机强化',
    meta: ['触屏控制', '三阶段 Boss', '随机构筑'],
    tone: 'violet',
    icon: Crosshair,
  },
  {
    id: 'rhythm',
    name: '音游',
    route: '/rhythm',
    description: '分析本地或在线音乐并自动生成谱面',
    meta: ['4 键下落', '自动谱面', '延迟校准'],
    tone: 'pink',
    icon: Music2,
  },
  {
    id: 'snake',
    name: 'PK 贪吃蛇',
    route: '/snake',
    description: '本地双人对战与人机对战',
    meta: ['本地对战', 'AI 对战', '触屏控制'],
    tone: 'lime',
    icon: Gamepad2,
  },
]

const gameMap = new Map(games.map((game) => [game.id, game]))
const racingRecords = computed(() => Object.values(racing.value.records))
const racingGolds = computed(
  () => racingRecords.value.filter((item) => item.medal === 'gold').length,
)
const completedRuns = computed(() => profile.value.results.length)
const recentResults = computed(() =>
  profile.value.results
    .slice(0, 12)
    .map((result) => ({ ...result, game: gameMap.get(result.gameId) })),
)
const recentGames = computed(() =>
  profile.value.recent
    .map((item) => ({ ...item, game: gameMap.get(item.gameId) }))
    .filter((item) => item.game),
)

const achievements = computed(() => [
  {
    id: 'explorer',
    name: '游戏探索者',
    detail: '体验全部四款游戏',
    unlocked: Object.values(profile.value.launches).every((count) => count > 0),
    icon: Gamepad2,
  },
  {
    id: 'racing-medal',
    name: '登上领奖台',
    detail: '在赛车固定赛道获得奖牌',
    unlocked: racingRecords.value.some((item) => item.medal !== 'none'),
    icon: Medal,
  },
  {
    id: 'racing-gold',
    name: '金牌车手',
    detail: '在任意赛车赛道获得金牌',
    unlocked: racingGolds.value > 0,
    icon: Trophy,
  },
  {
    id: 'champion',
    name: '锦标赛冠军',
    detail: '赢得一次三站锦标赛',
    unlocked: racing.value.championshipWins > 0,
    icon: Flame,
  },
  {
    id: 'rhythm-rank',
    name: '节奏高手',
    detail: '音游结算达到 S 或更高评级',
    unlocked: profile.value.results.some(
      (result) => result.gameId === 'rhythm' && ['S', 'SS', 'SSS'].includes(String(result.rank)),
    ),
    icon: Music2,
  },
  {
    id: 'snake-win',
    name: '对战胜利',
    detail: '在贪吃蛇对战中获得胜利',
    unlocked: profile.value.results.some((result) => result.gameId === 'snake' && result.won),
    icon: Gamepad2,
  },
  {
    id: 'survivor',
    name: '高分生存',
    detail: '星渊幸存者最高分达到 50,000',
    unlocked:
      survivorBest.value >= 50_000 ||
      profile.value.results.some(
        (result) => result.gameId === 'neon-survivor' && Number(result.score) >= 50_000,
      ),
    icon: Crosshair,
  },
  {
    id: 'regular',
    name: '常驻玩家',
    detail: '完成并结算 20 局游戏',
    unlocked: completedRuns.value >= 20,
    icon: Sparkles,
  },
])

const unlockedCount = computed(() => achievements.value.filter((item) => item.unlocked).length)

function reloadProfile() {
  profile.value = loadGameProfile()
  racing.value = loadRacingSave()
  rhythm.value = loadRhythmSettings()
  survivorBest.value = getStorage<number>(STORAGE_KEYS.SURVIVOR_BEST_SCORE, 0) || 0
}

function openGame(route: string) {
  router.push(route)
}

function relativeTime(value: number) {
  const minutes = Math.floor((Date.now() - value) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`
  return `${Math.floor(minutes / 1440)} 天前`
}

function exportArchive() {
  const archive = exportGameArchive()
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `vuechest-games-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function importArchive(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      importGameArchive(JSON.parse(String(reader.result || '{}')))
      reloadProfile()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '存档导入失败')
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function resultSummary(result: (typeof recentResults.value)[number]) {
  if (result.gameId === 'rhythm')
    return `${result.rank || '--'} · ${Number(result.score || 0).toLocaleString()} 分`
  if (result.gameId === 'racing')
    return `第 ${result.rank || '--'} 名 · ${Number(result.score || 0).toLocaleString()} 分`
  if (result.gameId === 'snake') return result.won ? '胜利' : '对局完成'
  return `${Number(result.score || 0).toLocaleString()} 分`
}

onMounted(reloadProfile)
onActivated(reloadProfile)
</script>

<template>
  <div class="game-center">
    <div class="game-grid-bg" aria-hidden="true"></div>
    <header class="center-header">
      <div class="header-left">
        <button type="button" aria-label="返回工作台" @click="router.push('/')">
          <ChevronLeft :size="20" />
        </button>
        <span class="header-mark"><Gamepad2 :size="22" /></span>
        <span><strong>游戏中心</strong><small>本机记录与挑战</small></span>
      </div>
      <div class="header-tools">
        <button type="button" @click="exportArchive"><Download :size="15" />导出存档</button>
        <button type="button" @click="archiveInput?.click()"><Upload :size="15" />导入存档</button>
        <button class="refresh-button" type="button" @click="reloadProfile">
          <RefreshCw :size="15" />刷新记录
        </button>
        <input
          ref="archiveInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="importArchive"
        />
      </div>
    </header>

    <main class="center-shell">
      <section class="overview-strip" aria-label="游戏数据概览">
        <article>
          <span><Play :size="17" /></span>
          <div>
            <small>完成局数</small><strong>{{ completedRuns }}</strong>
          </div>
        </article>
        <article>
          <span><Medal :size="17" /></span>
          <div>
            <small>连续挑战</small><strong>{{ profile.streak.current }} 天</strong>
          </div>
        </article>
        <article>
          <span><Trophy :size="17" /></span>
          <div>
            <small>已解锁成就</small><strong>{{ unlockedCount }}/{{ achievements.length }}</strong>
          </div>
        </article>
        <article>
          <span><Crosshair :size="17" /></span>
          <div>
            <small>幸存者最高分</small><strong>{{ survivorBest.toLocaleString() }}</strong>
          </div>
        </article>
      </section>

      <div class="center-layout">
        <section class="game-library">
          <div class="section-heading">
            <div>
              <h1>游戏</h1>
              <small>{{ games.length }} 款本地游戏</small>
            </div>
          </div>
          <div class="game-cards">
            <article v-for="game in games" :key="game.id" :class="['game-card', game.tone]">
              <div class="card-visual">
                <component :is="game.icon" :size="48" :stroke-width="1.35" />
                <i></i><i></i>
              </div>
              <div class="card-body">
                <div class="card-title">
                  <span
                    ><strong>{{ game.name }}</strong
                    ><small>启动 {{ profile.launches[game.id] }} 次</small></span
                  ><Gauge :size="18" />
                </div>
                <p>{{ game.description }}</p>
                <div class="game-tags">
                  <span v-for="tag in game.meta" :key="tag">{{ tag }}</span>
                </div>
                <button type="button" @click="openGame(game.route)">
                  <Play :size="15" fill="currentColor" />开始游戏
                </button>
              </div>
            </article>
          </div>
        </section>

        <aside class="center-sidebar">
          <section class="side-card challenge-card" :class="{ completed: challengeCompleted }">
            <header>
              <span><Target :size="18" /></span>
              <div>
                <strong>每日挑战</strong><small>{{ new Date().toLocaleDateString('zh-CN') }}</small>
              </div>
            </header>
            <h2>{{ todayChallenge.title }}</h2>
            <p>{{ todayChallenge.detail }}</p>
            <button
              v-if="!challengeCompleted"
              type="button"
              @click="openGame(todayChallenge.route)"
            >
              打开游戏 <Play :size="13" fill="currentColor" />
            </button>
            <strong v-else class="challenge-done"
              >✓ 今日已完成 · 最佳连续 {{ profile.streak.best }} 天</strong
            >
          </section>

          <section class="side-card record-card">
            <header>
              <span><CarFront :size="18" /></span>
              <div><strong>赛车档案</strong><small>本机存档</small></div>
            </header>
            <div class="record-grid">
              <span
                ><small>金牌</small><strong>{{ racingGolds }}</strong></span
              >
              <span
                ><small>锦标赛冠军</small><strong>{{ racing.championshipWins }}</strong></span
              >
              <span
                ><small>已解锁涂装</small
                ><strong>{{ racing.unlockedLiveries.length }}</strong></span
              >
              <span
                ><small>最佳记录</small><strong>{{ racingRecords.length }}</strong></span
              >
            </div>
            <button class="text-link" @click="openGame('/racing')">
              查看赛车 <Play :size="12" />
            </button>
          </section>

          <section v-if="recentGames.length" class="side-card recent-card">
            <header>
              <span><Gauge :size="18" /></span>
              <div>
                <strong>最近游戏</strong><small>{{ recentGames.length }} 条</small>
              </div>
            </header>
            <button
              v-for="item in recentGames.slice(0, 4)"
              :key="item.gameId"
              @click="openGame(item.game!.route)"
            >
              <component :is="item.game!.icon" :size="16" /><span
                ><strong>{{ item.game!.name }}</strong
                ><small>{{ relativeTime(item.openedAt) }}</small></span
              ><Play :size="12" />
            </button>
          </section>
        </aside>
      </div>

      <section class="achievement-section">
        <div class="section-heading">
          <div>
            <h2>本机成就</h2>
            <small>根据现有游戏记录自动计算</small>
          </div>
        </div>
        <div class="achievement-grid">
          <article
            v-for="achievement in achievements"
            :key="achievement.id"
            :class="{ unlocked: achievement.unlocked }"
          >
            <span><component :is="achievement.icon" :size="20" /></span>
            <div>
              <strong>{{ achievement.name }}</strong
              ><small>{{ achievement.detail }}</small>
            </div>
            <b>{{ achievement.unlocked ? '已解锁' : '未解锁' }}</b>
          </article>
        </div>
      </section>

      <section class="result-history-section">
        <div class="section-heading">
          <div>
            <h2>最近结算</h2>
            <small>保留最近 200 局真实游戏结果</small>
          </div>
        </div>
        <div v-if="recentResults.length" class="result-history-grid">
          <article v-for="result in recentResults" :key="result.id">
            <span><component :is="result.game?.icon || Gamepad2" :size="17" /></span>
            <div>
              <strong>{{ result.game?.name || result.gameId }}</strong
              ><small>{{ relativeTime(result.playedAt) }}</small>
            </div>
            <b :class="{ win: result.won }">{{ resultSummary(result) }}</b>
          </article>
        </div>
        <div v-else class="result-history-empty">完成一局游戏后，结算会记录在这里。</div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.game-center {
  position: relative;
  min-height: 100%;
  overflow: hidden;
  background: #0c1019;
  color: #edf3ff;
}
.game-grid-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.35;
  background-image:
    linear-gradient(rgba(104, 125, 162, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(104, 125, 162, 0.08) 1px, transparent 1px),
    radial-gradient(circle at 75% 10%, rgba(61, 200, 255, 0.16), transparent 28%),
    radial-gradient(circle at 5% 85%, rgba(137, 91, 255, 0.14), transparent 28%);
  background-size:
    36px 36px,
    36px 36px,
    100% 100%,
    100% 100%;
}
.center-header,
.center-shell {
  position: relative;
  z-index: 1;
  width: min(1380px, calc(100% - 40px));
  margin-inline: auto;
}
.center-header {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-left > button,
.refresh-button,
.header-tools > button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #dfe8f7;
  cursor: pointer;
}
.header-tools {
  display: flex;
  align-items: center;
  gap: 7px;
}
.header-tools > button {
  padding: 8px 10px;
  font-size: 11px;
}
.header-left > button {
  width: 38px;
  height: 38px;
}
.header-mark {
  display: grid;
  width: 39px;
  height: 39px;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(135deg, #178fc4, #6753d8);
  box-shadow: 0 8px 26px rgba(23, 143, 196, 0.25);
}
.header-left > span:last-child {
  display: flex;
  flex-direction: column;
}
.header-left strong {
  font-size: 18px;
}
.header-left small {
  color: #75849e;
  font-size: 10px;
}
.refresh-button {
  padding: 8px 11px;
}
.center-shell {
  padding: 18px 0 48px;
}
.overview-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.overview-strip article {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(17, 23, 36, 0.8);
}
.overview-strip article > span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: rgba(74, 160, 255, 0.12);
  color: #6bc8ff;
}
.overview-strip div {
  display: flex;
  flex-direction: column;
}
.overview-strip small {
  color: #75849e;
  font-size: 9px;
}
.overview-strip strong {
  font-size: 20px;
}
.center-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  margin-top: 22px;
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-heading h1,
.section-heading h2 {
  margin: 0;
  font-size: 20px;
}
.section-heading small {
  color: #75849e;
}
.game-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.game-card {
  display: grid;
  grid-template-columns: 155px minmax(0, 1fr);
  min-height: 220px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  background: rgba(17, 23, 36, 0.86);
  transition: 0.22s ease;
}
.game-card:hover {
  transform: translateY(-3px);
  border-color: rgba(107, 200, 255, 0.28);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.25);
}
.card-visual {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #fff;
}
.card-visual::before {
  position: absolute;
  inset: 0;
  content: '';
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.17), transparent 50%);
}
.card-visual > svg {
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 12px 22px rgba(0, 0, 0, 0.28));
}
.card-visual i {
  position: absolute;
  width: 130px;
  height: 130px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
}
.card-visual i:last-child {
  width: 78px;
  height: 78px;
}
.game-card.cyan .card-visual {
  background: linear-gradient(145deg, #075985, #0e7490);
}
.game-card.violet .card-visual {
  background: linear-gradient(145deg, #4c1d95, #6d28d9);
}
.game-card.pink .card-visual {
  background: linear-gradient(145deg, #9d174d, #be185d);
}
.game-card.lime .card-visual {
  background: linear-gradient(145deg, #3f6212, #4d7c0f);
}
.card-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 18px;
}
.card-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.card-title > span {
  display: flex;
  flex-direction: column;
}
.card-title strong {
  font-size: 18px;
}
.card-title small,
.card-body p {
  color: #8795aa;
}
.card-title small {
  margin-top: 2px;
  font-size: 9px;
}
.card-body p {
  margin: 13px 0;
  font-size: 11px;
  line-height: 1.6;
}
.game-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.game-tags span {
  padding: 4px 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #91a0b7;
  font-size: 9px;
}
.card-body > button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 112px;
  margin-top: auto;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: #eaf2ff;
  color: #111827;
  cursor: pointer;
  font-weight: 800;
}
.center-sidebar {
  display: grid;
  align-content: start;
  gap: 12px;
}
.side-card {
  padding: 17px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(17, 23, 36, 0.86);
}
.side-card header {
  display: flex;
  align-items: center;
  gap: 9px;
}
.side-card header > span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: rgba(107, 200, 255, 0.11);
  color: #6bc8ff;
}
.side-card header > div {
  display: flex;
  flex-direction: column;
}
.side-card header small {
  color: #75849e;
  font-size: 9px;
}
.challenge-card h2 {
  margin: 18px 0 5px;
  font-size: 22px;
}
.challenge-card > p {
  color: #8795aa;
  font-size: 11px;
}
.challenge-card > button,
.text-link {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 15px;
  border: 0;
  background: transparent;
  color: #6bc8ff;
  cursor: pointer;
  font-weight: 800;
}
.challenge-card.completed {
  border-color: rgba(107, 200, 255, 0.34);
  background: rgba(35, 93, 118, 0.2);
}
.challenge-done {
  display: block;
  margin-top: 15px;
  color: #6bc8ff;
  font-size: 11px;
}
.record-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 7px;
  margin-top: 14px;
}
.record-grid span {
  display: flex;
  flex-direction: column;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}
.record-grid small {
  color: #75849e;
  font-size: 9px;
}
.record-grid strong {
  margin-top: 3px;
}
.recent-card > button {
  width: 100%;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
  color: #dfe8f7;
  cursor: pointer;
  text-align: left;
}
.recent-card > button span {
  display: flex;
  flex-direction: column;
}
.recent-card > button small {
  color: #75849e;
  font-size: 9px;
}
.achievement-section {
  margin-top: 24px;
}
.achievement-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
}
.achievement-grid article {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 13px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 13px;
  background: rgba(17, 23, 36, 0.7);
  opacity: 0.48;
}
.achievement-grid article.unlocked {
  border-color: rgba(107, 200, 255, 0.22);
  opacity: 1;
}
.achievement-grid article > span {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: #75849e;
}
.achievement-grid article.unlocked > span {
  background: rgba(107, 200, 255, 0.11);
  color: #6bc8ff;
}
.achievement-grid article > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.achievement-grid small {
  color: #75849e;
  font-size: 9px;
}
.achievement-grid b {
  color: #75849e;
  font-size: 9px;
}
.achievement-grid .unlocked b {
  color: #6bc8ff;
}
.result-history-section {
  margin-top: 24px;
}
.result-history-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.result-history-grid article {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 11px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 11px;
  background: rgba(17, 23, 36, 0.72);
}
.result-history-grid article > span {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  background: rgba(107, 200, 255, 0.09);
  color: #6bc8ff;
}
.result-history-grid article > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.result-history-grid small {
  color: #75849e;
  font-size: 9px;
}
.result-history-grid b {
  color: #91a0b7;
  font-size: 10px;
}
.result-history-grid b.win {
  color: #6bc8ff;
}
.result-history-empty {
  padding: 28px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: #75849e;
  text-align: center;
}
@media (max-width: 1100px) {
  .center-layout {
    grid-template-columns: 1fr;
  }
  .center-sidebar {
    grid-template-columns: repeat(3, 1fr);
  }
  .achievement-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .result-history-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .center-header,
  .center-shell {
    width: calc(100% - 24px);
  }
  .overview-strip {
    grid-template-columns: repeat(2, 1fr);
  }
  .game-cards {
    grid-template-columns: 1fr;
  }
  .center-sidebar {
    grid-template-columns: 1fr;
  }
  .achievement-grid {
    grid-template-columns: 1fr;
  }
  .game-card {
    grid-template-columns: 120px 1fr;
  }
  .refresh-button,
  .header-tools > button {
    font-size: 0;
  }
  .refresh-button svg,
  .header-tools > button svg {
    font-size: initial;
  }
  .result-history-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 480px) {
  .game-card {
    grid-template-columns: 1fr;
  }
  .card-visual {
    min-height: 130px;
  }
  .overview-strip article {
    padding: 11px;
  }
  .overview-strip strong {
    font-size: 16px;
  }
}
</style>
