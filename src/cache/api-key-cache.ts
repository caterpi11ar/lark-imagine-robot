import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { EncryptedLRUCache } from './encrypted-lru-cache.js'

/**
 * 用户 API Key 缓存服务
 *
 * - 基于用户 open_id 缓存加密后的 API Key
 * - LRU 淘汰 + TTL 过期
 * - 自动定时清理过期条目
 */
class ApiKeyCacheService {
  private readonly cache: EncryptedLRUCache<string>
  private cleanupTimer?: ReturnType<typeof setInterval>

  constructor() {
    this.cache = new EncryptedLRUCache<string>({
      maxSize: config.cache.maxSize,
      ttlMs: config.cache.ttlMinutes * 60 * 1000,
      encryptSecret: config.cache.encryptSecret,
    })

    logger.info(
      `ApiKeyCache initialized: maxSize=${config.cache.maxSize}, ttl=${config.cache.ttlMinutes}min`,
    )
  }

  /**
   * 缓存用户的 API Key
   * @param userId 用户 open_id
   * @param apiKey 明文 API Key (内部加密存储)
   */
  set(userId: string, apiKey: string): void {
    this.cache.set(userId, apiKey)
    const masked = this.maskKey(apiKey)
    logger.info(`API Key cached for user ${userId}: ${masked}`)
  }

  /**
   * 获取缓存的 API Key
   * @param userId 用户 open_id
   * @returns 明文 API Key 或 undefined (未命中/已过期)
   */
  get(userId: string): string | undefined {
    const key = this.cache.get(userId)
    if (key) {
      logger.info(`API Key cache hit for user ${userId}`)
    }
    return key
  }

  /**
   * 检查用户是否有有效的缓存 API Key
   */
  has(userId: string): boolean {
    return this.cache.has(userId)
  }

  /**
   * 使某用户的缓存失效
   */
  invalidate(userId: string): void {
    this.cache.delete(userId)
    logger.info(`API Key cache invalidated for user ${userId}`)
  }

  /**
   * 启动定时清理 (清理过期条目)
   */
  startCleanup(intervalMs = 5 * 60 * 1000): void {
    this.cleanupTimer = setInterval(() => {
      const pruned = this.cache.prune()
      if (pruned > 0) {
        logger.info(
          `API Key cache cleanup: pruned ${pruned} expired entries, remaining ${this.cache.size}`,
        )
      }
    }, intervalMs)
  }

  /**
   * 停止定时清理
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  /** 脱敏显示 API Key */
  private maskKey(key: string): string {
    if (key.length <= 8)
      return '****'
    return `${key.slice(0, 4)}****${key.slice(-4)}`
  }
}

/** 全局单例 */
export const apiKeyCache = new ApiKeyCacheService()
