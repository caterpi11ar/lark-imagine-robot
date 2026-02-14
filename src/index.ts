import {
  adaptExpress,
  CardActionHandler,
  EventDispatcher,
  LoggerLevel,
  WSClient,
} from '@larksuiteoapi/node-sdk'
import express from 'express'
import { apiKeyCache } from './cache/api-key-cache.js'
import { CardActionService } from './cards/actions.js'
import { config } from './config.js'
import { MessageHandler } from './events/message-handler.js'
import { GeminiProvider } from './generation/providers/gemini.js'
import { botInfoService } from './lark/bot-info.js'
import { sessionManager } from './session/manager.js'
import { logger } from './utils/logger.js'

// 图片生成服务
const generationService = new GeminiProvider()

// 消息处理器
const messageHandler = new MessageHandler()

// 卡片交互处理器
const cardActionService = new CardActionService(generationService)

// 启动会话清理定时器
sessionManager.startCleanup()

// 启动 API Key 缓存清理定时器
apiKeyCache.startCleanup()

// 打印启动配置，帮助排查连接问题
logger.info('========================================')
logger.info(`App ID: ${config.lark.appId}`)
logger.info(`App Secret: ${config.lark.appSecret.slice(0, 4)}****`)
logger.info(`Connection Mode: ${config.connectionMode}`)
logger.info(`Gemini Base URL: ${config.gemini.baseUrl}`)
logger.info(`Gemini Model: ${config.gemini.model}`)
logger.info('========================================')

// 获取机器人自身信息 (open_id) 后再启动事件监听
botInfoService.fetch().then(() => {
  if (config.connectionMode === 'websocket') {
    startWebSocketMode()
  }
  else {
    startWebhookMode()
  }
})

// ────────────────────────────────────────────────────────
// WebSocket 长连接模式
// 无需公网域名、无需 verificationToken / encryptKey
// ────────────────────────────────────────────────────────
function startWebSocketMode() {
  logger.info('Starting in WebSocket long connection mode...')

  // 消息处理器 (加 try/catch 和入口日志)
  const wrappedMessageHandler = async (data: any) => {
    logger.info('[WS Event] >>> im.message.receive_v1 event arrived <<<')
    logger.info(`[WS Event] Raw data keys: ${Object.keys(data).join(', ')}`)
    try {
      return await messageHandler.handle(data)
    }
    catch (err) {
      logger.error(`[WS Event] Message handler error: ${err}`)
    }
  }

  // 卡片处理器 (加 try/catch 和入口日志)
  const rawCardHandler = cardActionService.createEventHandler()
  const wrappedCardHandler = async (data: any) => {
    logger.info('[WS Event] >>> card.action.trigger event arrived <<<')
    logger.info(`[WS Event] Raw data keys: ${Object.keys(data).join(', ')}`)
    try {
      return await rawCardHandler(data)
    }
    catch (err) {
      logger.error(`[WS Event] Card handler error: ${err}`)
    }
  }

  // 事件分发器 (WebSocket 模式无需加密配置)
  const eventDispatcher = new EventDispatcher({}).register({
    'im.message.receive_v1': wrappedMessageHandler,
    'card.action.trigger': wrappedCardHandler,
  } as any)

  // 创建 WebSocket 长连接客户端 (使用 debug 级别以查看连接状态)
  const wsClient = new WSClient({
    appId: config.lark.appId,
    appSecret: config.lark.appSecret,
    loggerLevel: LoggerLevel.debug,
  })

  // 启动长连接
  wsClient.start({ eventDispatcher })

  logger.info('Lark Robot WebSocket client started')
  logger.info(
    'Waiting for connection... (no public domain or encryption needed)',
  )
}

// ────────────────────────────────────────────────────────
// Webhook 模式 (需要公网域名 + 加密配置)
// ────────────────────────────────────────────────────────
function startWebhookMode() {
  logger.info('Starting in Webhook mode...')

  // 事件分发器
  const eventDispatcher = new EventDispatcher({
    verificationToken: config.lark.verificationToken,
    encryptKey: config.lark.encryptKey || undefined,
  })

  // 注册消息事件处理
  eventDispatcher.register({
    'im.message.receive_v1': (data: any) => messageHandler.handle(data),
  })

  // 卡片交互回调处理
  const cardHandler = new CardActionHandler(
    {
      verificationToken: config.lark.verificationToken,
      encryptKey: config.lark.encryptKey || undefined,
    },
    cardActionService.createCallback() as any,
  )

  // 创建 Express 应用
  const app = express()

  // 事件订阅路由
  app.post(
    '/webhook/event',
    adaptExpress(eventDispatcher, { autoChallenge: true }),
  )

  // 卡片交互回调路由
  app.post(
    '/webhook/card',
    adaptExpress(cardHandler, { autoChallenge: true }),
  )

  // 健康检查
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // 启动服务
  app.listen(config.port, () => {
    logger.info(`Lark Robot started on port ${config.port}`)
    logger.info(`Event webhook: POST /webhook/event`)
    logger.info(`Card callback: POST /webhook/card`)
  })
}
