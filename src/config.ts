import process from 'node:process'
import * as z from 'zod'
import 'dotenv/config'

// ────────────────────────────────────────────────────────
// 环境变量 Schema 定义
// ────────────────────────────────────────────────────────

const envSchema = z.object({
  // 飞书应用凭证 (必填)
  LARK_APP_ID: z.string().min(1, 'LARK_APP_ID is required'),
  LARK_APP_SECRET: z.string().min(1, 'LARK_APP_SECRET is required'),

  // 连接模式
  CONNECTION_MODE: z.enum(['websocket', 'webhook']).default('websocket'),

  // 仅 webhook 模式需要
  LARK_VERIFICATION_TOKEN: z.string().default(''),
  LARK_ENCRYPT_KEY: z.string().default(''),

  // 服务端口
  PORT: z
    .string()
    .default('3000')
    .transform(v => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(65535)),

  // 图片生成配置
  DEFAULT_GENERATION_BASE_URL: z
    .url()
    .default('https://api.openai.com/v1'),

  // Gemini 配置
  GEMINI_BASE_URL: z
    .url()
    .default('https://generativelanguage.googleapis.com'),
  GEMINI_MODEL: z.string().default('gemini-3-pro-image-preview'),

  // 自定义机器人 Webhook URL (可选)
  LARK_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),

  // 生成队列配置
  QUEUE_MAX_CONCURRENCY: z
    .string()
    .default('3')
    .transform(v => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(50)),
  QUEUE_MAX_LENGTH: z
    .string()
    .default('20')
    .transform(v => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(500)),

  // API Key 缓存配置
  CACHE_TTL_MINUTES: z
    .string()
    .default('1440')
    .transform(v => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1)),
  CACHE_MAX_SIZE: z
    .string()
    .default('500')
    .transform(v => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1)),
  CACHE_ENCRYPT_SECRET: z
    .string()
    .min(8, 'CACHE_ENCRYPT_SECRET must be at least 8 characters')
    .default('lark-robot-default-secret-change-me'),
})

// ────────────────────────────────────────────────────────
// 解析并校验环境变量
// ────────────────────────────────────────────────────────

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

const env = parsed.data

// ────────────────────────────────────────────────────────
// 导出配置对象
// ────────────────────────────────────────────────────────

export type ConnectionMode = 'websocket' | 'webhook'

export const config = {
  lark: {
    appId: env.LARK_APP_ID,
    appSecret: env.LARK_APP_SECRET,
    /** 仅 webhook 模式需要 */
    verificationToken: env.LARK_VERIFICATION_TOKEN,
    /** 仅 webhook 模式需要 */
    encryptKey: env.LARK_ENCRYPT_KEY,
  },
  /** 连接模式: "websocket" (推荐，无需公网域名) 或 "webhook" */
  connectionMode: env.CONNECTION_MODE as ConnectionMode,
  port: env.PORT,
  defaultGenerationBaseUrl: env.DEFAULT_GENERATION_BASE_URL,
  gemini: {
    baseUrl: env.GEMINI_BASE_URL,
    model: env.GEMINI_MODEL,
  },
  /** 自定义机器人 Webhook URL (可选，用于向群聊推送通知) */
  webhookUrl: env.LARK_WEBHOOK_URL || '',
  /** 生成队列配置 */
  queue: {
    /** 最大并发生成数，默认 3 */
    maxConcurrency: env.QUEUE_MAX_CONCURRENCY,
    /** 最大排队长度，默认 20 */
    maxLength: env.QUEUE_MAX_LENGTH,
  },
  /** API Key 缓存配置 */
  cache: {
    /** 缓存有效期 (分钟)，默认 1440 (24小时) */
    ttlMinutes: env.CACHE_TTL_MINUTES,
    /** 最大缓存用户数 (LRU 淘汰)，默认 500 */
    maxSize: env.CACHE_MAX_SIZE,
    /** 加密密钥 (用于 AES-256-GCM 加密存储 API Key) */
    encryptSecret: env.CACHE_ENCRYPT_SECRET,
  },
}

// ────────────────────────────────────────────────────────
// 模式特定校验
// ────────────────────────────────────────────────────────

if (config.connectionMode === 'webhook' && !config.lark.verificationToken) {
  console.error(
    '❌ Webhook mode requires LARK_VERIFICATION_TOKEN.\n'
    + '   Set CONNECTION_MODE=websocket to use long connection mode instead.',
  )
  process.exit(1)
}
