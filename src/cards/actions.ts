import type { ImageGenerationService } from '../generation/types.js'
import { apiKeyCache } from '../cache/api-key-cache.js'
import { config } from '../config.js'
import { generationQueue } from '../queue/generation-queue.js'
import { sessionManager } from '../session/manager.js'
import { logger } from '../utils/logger.js'
import { buildProgressCard, buildQueueCard, buildQueueFullCard } from './templates.js'

/** Webhook 模式的卡片回调事件类型 */
interface CardActionEvent {
  open_id: string
  user_id?: string
  tenant_key: string
  open_message_id: string
  token: string
  action: {
    value: Record<string, unknown>
    tag: string
    option?: string
    form_value?: Record<string, string>
    name?: string
  }
}

/** WebSocket 模式下 EventDispatcher 解析后的卡片回调数据 */
interface WSCardActionEvent {
  operator?: { open_id?: string, user_id?: string }
  context?: { open_message_id?: string, open_chat_id?: string }
  tenant_key?: string
  token?: string
  action: {
    value: Record<string, unknown>
    tag: string
    option?: string
    form_value?: Record<string, string>
    name?: string
  }
}

/**
 * 卡片交互回调服务
 *
 * 处理用户在确认卡片中的表单提交:
 * - 提取生成参数 (艺术风格、画面比例、亮度等)
 * - 管理 API Key (表单输入/缓存)
 * - 更新会话并入队生成任务
 */
export class CardActionService {
  constructor(private readonly service: ImageGenerationService) {}

  /**
   * 创建 Webhook 模式的卡片回调处理函数
   * 用于 CardActionHandler 构造函数
   */
  createCallback() {
    return async (data: CardActionEvent) => {
      return this.handleCardAction(data)
    }
  }

  /**
   * 创建 WebSocket 模式的卡片事件处理函数
   * 用于注册到 EventDispatcher 的 card.action.trigger 事件
   */
  createEventHandler() {
    return async (data: WSCardActionEvent) => {
      return this.handleCardAction(data)
    }
  }

  /** 从回调数据中提取统一字段 */
  private normalizeCardAction(data: CardActionEvent | WSCardActionEvent) {
    const openId
      = (data as CardActionEvent).open_id
        || (data as WSCardActionEvent).operator?.open_id
        || 'unknown'
    const openMessageId
      = (data as CardActionEvent).open_message_id
        || (data as WSCardActionEvent).context?.open_message_id
        || ''

    return { openId, openMessageId, action: data.action }
  }

  /** 统一的卡片回调处理逻辑 */
  private async handleCardAction(data: CardActionEvent | WSCardActionEvent) {
    const { openId, openMessageId, action } = this.normalizeCardAction(data)

    logger.info(`Card action received from user: ${openId}`)
    logger.debug(`Card action raw data keys: ${Object.keys(data).join(', ')}`)
    logger.debug(
      `Card action.action keys: ${data.action ? Object.keys(data.action).join(', ') : 'N/A'}`,
    )
    logger.debug(
      `Card action.form_value: ${JSON.stringify(data.action?.form_value)}`,
    )

    const sessionId = action.value?.session_id as string
    if (!sessionId) {
      logger.warn('Card action missing session_id')
      return
    }

    const session = sessionManager.get(sessionId)
    if (!session) {
      logger.warn(`Session not found: ${sessionId}`)
      return
    }

    // ── 提取表单字段 ──
    const formValue = action.form_value || {}
    const artStyle = formValue.art_style || 'default'
    const aspectRatio = formValue.aspect_ratio || '1:1'
    const brightness = formValue.brightness || 'default'
    const colorTone = formValue.color_tone || 'default'
    const detailLevel = formValue.detail_level || 'default'
    const negativePrompt = formValue.negative_prompt || ''
    const seed = formValue.seed || ''
    const apiKeyFromForm = formValue.api_key

    logger.info(
      `Form submitted: artStyle=${artStyle}, ratio=${aspectRatio}, brightness=${brightness}, `
      + `tone=${colorTone}, detail=${detailLevel}, `
      + `negativePrompt="${negativePrompt}", seed="${seed}"`,
    )

    // ── 确定 API Key: 优先表单输入，其次缓存 ──
    let apiKey: string | undefined = apiKeyFromForm
      ? apiKeyFromForm.replace(/^[\s"'`]+|[\s"'`,;]+$/g, '')
      : undefined
    if (apiKey) {
      logger.info(`API Key cleaned: raw_length=${apiKeyFromForm!.length}, cleaned_length=${apiKey.length}`)
    }
    if (!apiKey) {
      apiKey = apiKeyCache.get(openId)
    }
    if (!apiKey) {
      logger.warn('No API Key found: neither in form nor in cache')
      logger.warn(`action.form_value: ${JSON.stringify(formValue)}`)
      return
    }

    const masked = apiKey.length > 8
      ? `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
      : '****'
    logger.info(`API Key resolved: ${masked} (length: ${apiKey.length})`)

    // 缓存用户的 API Key (加密存储)
    apiKeyCache.set(openId, apiKey)

    // 更新 session
    sessionManager.update(sessionId, {
      apiKey,
      artStyle,
      aspectRatio,
      brightness,
      colorTone,
      detailLevel,
      negativePrompt,
      seed,
      cardMessageId: openMessageId,
    })

    const promptSummary = session.textContent || '(仅图片输入)'

    // 通过队列执行生成
    const result = generationQueue.enqueue(sessionId, this.service)

    if (!result.accepted) {
      return buildQueueFullCard(promptSummary, config.queue.maxLength)
    }

    if (result.position > 0) {
      const { status } = generationQueue
      return buildQueueCard(promptSummary, result.position, status.waiting)
    }

    // 直接开始生成
    return buildProgressCard(promptSummary)
  }
}
