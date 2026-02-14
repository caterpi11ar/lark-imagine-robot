import { apiKeyCache } from '../cache/api-key-cache.js'
import { buildConfirmCard } from '../cards/templates.js'
import { botInfoService } from '../lark/bot-info.js'
import { larkMessageService } from '../lark/message.js'
import { sessionManager } from '../session/manager.js'
import { logger } from '../utils/logger.js'

/**
 * 消息事件处理器
 *
 * 处理飞书消息事件的完整流程:
 * - 消息去重
 * - 群聊 @机器人 检测
 * - 解析文本/图片/富文本消息
 * - 创建会话并发送确认卡片
 */
export class MessageHandler {
  private readonly processedMessages = new Set<string>()

  /** 处理消息事件，可注册到 EventDispatcher */
  async handle(data: { message: any, sender: any }): Promise<void> {
    logger.info('[Handler] === Message handler invoked ===')
    logger.info(`[Handler] Raw data type: ${typeof data}, keys: ${data ? Object.keys(data).join(', ') : 'null'}`)

    const { message, sender } = data

    logger.info(`[Handler] message_id: ${message?.message_id}, sender: ${sender?.sender_id?.open_id || 'unknown'}`)

    // 消息去重
    if (this.processedMessages.has(message.message_id)) {
      logger.info(`[Handler] Duplicate message, skipping: ${message.message_id}`)
      return
    }
    this.processedMessages.add(message.message_id)
    this.pruneProcessedMessages()

    const chatType = message.chat_type // "p2p" or "group"
    const senderId = sender.sender_id?.open_id || ''

    logger.info(
      `Message received: type=${message.message_type}, chat=${chatType}, sender=${senderId}`,
    )
    logger.debug(`Message content raw: ${message.content}`)

    // 群聊时：只有 @本机器人 才触发
    if (chatType === 'group') {
      const mentions = message.mentions || []
      const botOpenId = botInfoService.openId
      const botMentioned = mentions.some(
        (m: any) => m.id?.open_id === botOpenId,
      )
      logger.info(
        `[Handler] Group message: botOpenId="${botOpenId}", mentions=${JSON.stringify(
          mentions.map((m: any) => ({ key: m.key, open_id: m.id?.open_id, name: m.name })),
        )}, botMentioned=${botMentioned}`,
      )
      if (!botMentioned) {
        logger.info('[Handler] Group message not @bot, skipping')
        return
      }
    }

    // 解析消息内容
    const { textContent, imageKeys } = this.parseMessageContent(
      message.message_type,
      message.content,
    )

    // 群聊消息去掉 @mention 标记
    const cleanedText
      = chatType === 'group'
        ? this.removeMentions(textContent, message.mentions)
        : textContent

    // 至少需要有文字或图片内容
    if (!cleanedText && imageKeys.length === 0) {
      logger.info(
        `Empty message content after parsing, skipping. type=${message.message_type}`,
      )
      return
    }

    logger.info(
      `Parsed message: text="${cleanedText || '(无)'}", images=${imageKeys.length}`,
    )

    // 创建会话
    const session = sessionManager.create({
      userId: senderId,
      chatId: message.chat_id,
      messageId: message.message_id,
      textContent: cleanedText,
      imageKeys,
    })

    // 构建 prompt 摘要 (截断过长的文本)
    const promptSummary
      = cleanedText.length > 100
        ? `${cleanedText.slice(0, 100)}...`
        : cleanedText || `[${imageKeys.length} 张图片]`

    // ── 回复确认卡片：让用户选择风格、比例后再确认生成 ──
    const hasCachedKey = !!apiKeyCache.get(senderId)
    const card = buildConfirmCard(session.id, promptSummary, hasCachedKey)
    const cardMessageId = await larkMessageService.replyCard(message.message_id, card)

    if (cardMessageId) {
      session.cardMessageId = cardMessageId
    }

    logger.info(
      `Confirm card sent for session: ${session.id}, card: ${cardMessageId}, hasCachedKey: ${hasCachedKey}`,
    )
  }

  /** 限制已处理消息集合大小，防止内存泄漏 */
  private pruneProcessedMessages(): void {
    if (this.processedMessages.size > 10000) {
      const entries = [...this.processedMessages]
      entries.slice(0, 5000).forEach(id => this.processedMessages.delete(id))
    }
  }

  /** 从消息 content JSON 中提取文本和图片 key */
  private parseMessageContent(messageType: string, content: string) {
    let textContent = ''
    const imageKeys: string[] = []

    try {
      const parsed = JSON.parse(content)

      switch (messageType) {
        case 'text':
          textContent = parsed.text || ''
          break

        case 'image':
          if (parsed.image_key) {
            imageKeys.push(parsed.image_key)
          }
          break

        case 'post': {
          logger.debug(`Post message raw content: ${content}`)

          let paragraphs: unknown[][] | undefined

          const langContent
            = parsed.zh_cn || parsed.en_us || parsed.ja_jp

          if (langContent && Array.isArray(langContent.content)) {
            paragraphs = langContent.content
            if (langContent.title) {
              textContent += `${langContent.title} `
            }
          }
          else if (Array.isArray(parsed.content)) {
            paragraphs = parsed.content
            if (parsed.title) {
              textContent += `${parsed.title} `
            }
          }
          else {
            for (const val of Object.values(parsed)) {
              if (
                val
                && typeof val === 'object'
                && 'content' in (val as Record<string, unknown>)
                && Array.isArray((val as Record<string, unknown>).content)
              ) {
                paragraphs = (val as Record<string, unknown>).content as unknown[][]
                const title = (val as Record<string, unknown>).title
                if (typeof title === 'string' && title) {
                  textContent += `${title} `
                }
                break
              }
            }
          }

          if (paragraphs) {
            for (const paragraph of paragraphs) {
              if (!Array.isArray(paragraph))
                continue
              for (const element of paragraph) {
                const el = element as Record<string, unknown>
                if (el.tag === 'text' && el.text) {
                  textContent += el.text
                }
                else if (el.tag === 'img' && el.image_key) {
                  imageKeys.push(el.image_key as string)
                }
              }
            }
          }

          logger.debug(
            `Post parsed: text="${textContent}", imageKeys=[${imageKeys.join(', ')}]`,
          )
          break
        }

        case 'file':
          logger.info(`File message received, skipping: ${content}`)
          break

        default:
          logger.warn(`Unsupported message type: ${messageType}, content: ${content}`)
      }
    }
    catch (err) {
      logger.error(`Failed to parse message content: ${err}`)
    }

    return { textContent: textContent.trim(), imageKeys }
  }

  /** 清除消息文本中的 @mention 标记 */
  private removeMentions(
    text: string,
    mentions?: Array<{ key: string, name: string }>,
  ): string {
    if (!mentions || mentions.length === 0)
      return text

    let cleaned = text
    for (const mention of mentions) {
      cleaned = cleaned.replace(mention.key, '')
    }
    return cleaned.trim()
  }
}
