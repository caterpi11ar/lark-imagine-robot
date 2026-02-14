import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'

/**
 * 加密 LRU 缓存
 *
 * 特性:
 * - LRU (Least Recently Used) 淘汰策略
 * - TTL (Time-To-Live) 过期机制
 * - AES-256-GCM 加密存储值
 * - 泛型支持，可缓存任意可序列化类型
 */

interface CacheEntry {
  /** AES-256-GCM 加密后的数据 (hex) */
  ciphertext: string
  /** 初始化向量 (hex) */
  iv: string
  /** 认证标签 (hex) */
  authTag: string
  /** 创建时间戳 (ms) */
  createdAt: number
  /** 最后访问时间戳 (ms) */
  lastAccessedAt: number
}

export interface LRUCacheOptions {
  /** 最大缓存条目数 */
  maxSize: number
  /** 缓存有效期 (毫秒) */
  ttlMs: number
  /** AES 加密密钥 (建议 32 字节以上的字符串，内部会 hash 为 256-bit key) */
  encryptSecret: string
}

export class EncryptedLRUCache<T> {
  private readonly store = new Map<string, CacheEntry>()
  private readonly maxSize: number
  private readonly ttlMs: number
  private readonly encryptKey: Buffer

  constructor(options: LRUCacheOptions) {
    this.maxSize = options.maxSize
    this.ttlMs = options.ttlMs
    // 使用 SHA-256 将任意长度密钥派生为 256-bit AES key
    this.encryptKey = crypto
      .createHash('sha256')
      .update(options.encryptSecret)
      .digest()
  }

  // ──────────── 公开 API ────────────

  /** 写入缓存 (加密存储) */
  set(key: string, value: T): void {
    // 如果已存在，先删除 (Map 插入顺序会更新)
    this.store.delete(key)

    // 淘汰超容量的最旧条目 (LRU)
    while (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey)
      }
    }

    const encrypted = this.encrypt(JSON.stringify(value))
    const now = Date.now()

    this.store.set(key, {
      ...encrypted,
      createdAt: now,
      lastAccessedAt: now,
    })
  }

  /** 读取缓存 (解密返回)，未命中或过期返回 undefined */
  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry)
      return undefined

    // 检查 TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(key)
      return undefined
    }

    // 更新 LRU 访问顺序: 删除再插入，使其移到 Map 末尾
    this.store.delete(key)
    entry.lastAccessedAt = Date.now()
    this.store.set(key, entry)

    // 解密
    try {
      const plaintext = this.decrypt(
        entry.ciphertext,
        entry.iv,
        entry.authTag,
      )
      return JSON.parse(plaintext) as T
    }
    catch {
      // 解密失败，删除损坏条目
      this.store.delete(key)
      return undefined
    }
  }

  /** 检查缓存是否存在且未过期 */
  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry)
      return false
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(key)
      return false
    }
    return true
  }

  /** 删除缓存条目 */
  delete(key: string): boolean {
    return this.store.delete(key)
  }

  /** 清空所有缓存 */
  clear(): void {
    this.store.clear()
  }

  /** 当前缓存条目数 */
  get size(): number {
    return this.store.size
  }

  /** 清理所有过期条目 */
  prune(): number {
    const now = Date.now()
    let pruned = 0
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt > this.ttlMs) {
        this.store.delete(key)
        pruned++
      }
    }
    return pruned
  }

  // ──────────── AES-256-GCM 加解密 ────────────

  private encrypt(plaintext: string): {
    ciphertext: string
    iv: string
    authTag: string
  } {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptKey, iv)

    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    }
  }

  private decrypt(
    ciphertext: string,
    ivHex: string,
    authTagHex: string,
  ): string {
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptKey,
      iv,
    )
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }
}
