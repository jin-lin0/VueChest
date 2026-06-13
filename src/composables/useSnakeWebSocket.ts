import { ref } from 'vue'

const WS_BASE = import.meta.env.VITE_GAME_WS_URL || 'ws://localhost:3001'
// HTTP 版本的 base URL（fetch 不能用 ws:// 协议）
const HTTP_BASE = WS_BASE.replace(/^ws/, 'http')

export type WSMessage =
  | { type: 'room_list'; rooms: any[] }
  | { type: 'room_joined'; room: any }
  | { type: 'player_joined'; players: any[] }
  | { type: 'player_left'; players: any[] }
  | { type: 'countdown'; count: number }
  | { type: 'game_start'; tickInterval: number }
  | { type: 'game_state'; tick: number; snakes: any[]; items: any[] }
  | { type: 'game_over'; winnerId: number | null; winnerName: string | null; stats: any[]; tickCount: number }
  | { type: 'game_stopped'; reason: string }
  | { type: 'error'; msg: string }

/** 获取大厅 WebSocket URL（房间列表实时更新） */
export function getLobbyUrl(): string {
  return `${WS_BASE}/snake/lobby`
}

/** 获取游戏 WebSocket URL */
export function getGameUrl(type: 'create' | 'join', name: string, roomId?: string): string {
  const encoded = encodeURIComponent(name)
  if (type === 'create') {
    return `${WS_BASE}/snake/create?name=${encoded}`
  }
  return `${WS_BASE}/snake/game/${roomId}?name=${encoded}`
}

/** 获取房间列表（HTTP） */
export async function fetchRoomList(): Promise<WSMessage> {
  const res = await fetch(`${HTTP_BASE}/snake/lobby`)
  return res.json()
}

/**
 * 创建 WebSocket 连接到游戏房间
 * handler: 消息回调，返回清理函数
 */
export function connectGame(
  url: string,
  onMessage: (msg: WSMessage) => void,
  onError?: (err: string) => void,
): () => void {
  const ws = new WebSocket(url)
  let closed = false

  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data))
    } catch { /* ignore */ }
  }

  ws.onerror = () => {
    onError?.('连接异常')
  }

  ws.onclose = () => {
    if (!closed) {
      onError?.('连接已断开')
    }
  }

  return () => {
    closed = true
    ws.close()
  }
}
