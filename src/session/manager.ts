import { logger } from '../utils/logger.js'

export type SessionStatus
  = | 'waiting_confirm'
    | 'waiting_key'
    | 'generating'
    | 'done'
    | 'error'

export interface Session {
  id: string
  userId: string
  chatId: string
  messageId: string
  cardMessageId?: string
  textContent: string
  imageKeys: string[]
  apiKey?: string

  // ── 用户在确认卡片中选择的生成参数 ──
  /** 艺术风格 (e.g. "realistic", "anime", "default") */
  artStyle?: string
  /** 画面比例 (e.g. "1:1", "16:9") */
  aspectRatio?: string
  /** 亮度调节 (e.g. "dark", "bright", "default") */
  brightness?: string
  /** 色调倾向 (e.g. "warm", "cool", "default") */
  colorTone?: string
  /** 精细度 (e.g. "minimal", "detailed", "default") */
  detailLevel?: string
  /** 排除词 / 负面提示 */
  negativePrompt?: string
  /** 随机种子 */
  seed?: string

  status: SessionStatus
  createdAt: number
}

type SessionUpdates = Partial<Pick<Session, 'cardMessageId' | 'apiKey' | 'status' | 'artStyle' | 'aspectRatio' | 'brightness' | 'colorTone' | 'detailLevel' | 'negativePrompt' | 'seed'>>

/**
 * 会话管理器
 *
 * 管理图片生成请求的完整生命周期:
 * - 创建会话 (接收消息时)
 * - 更新会话 (用户提交参数时)
 * - 获取会话 (执行生成时)
 * - TTL 过期自动清理
 */
class SessionManager {
  private readonly sessions = new Map<string, Session>()
  private readonly ttlMs = 30 * 60 * 1000 // 30 minutes
  private cleanupTimer?: ReturnType<typeof setInterval>

  /** 生成 session ID */
  private generateId(): string {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  /** 创建新会话 */
  create(params: {
    userId: string
    chatId: string
    messageId: string
    textContent: string
    imageKeys: string[]
  }): Session {
    const session: Session = {
      id: this.generateId(),
      ...params,
      status: 'waiting_confirm',
      createdAt: Date.now(),
    }
    this.sessions.set(session.id, session)
    logger.info(`Session created: ${session.id} for user ${session.userId}`)
    return session
  }

  /** 获取会话 */
  get(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  /** 更新会话 */
  update(id: string, updates: SessionUpdates): Session | undefined {
    const session = this.sessions.get(id)
    if (!session)
      return undefined
    Object.assign(session, updates)
    return session
  }

  /** 启动定时清理过期会话 */
  startCleanup(intervalMs = 5 * 60 * 1000): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      let cleaned = 0
      for (const [id, session] of this.sessions) {
        if (now - session.createdAt > this.ttlMs) {
          this.sessions.delete(id)
          cleaned++
        }
      }
      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} expired sessions`)
      }
    }, intervalMs)
  }

  /** 停止定时清理 */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }
}

/** 全局单例 */
export const sessionManager = new SessionManager()
