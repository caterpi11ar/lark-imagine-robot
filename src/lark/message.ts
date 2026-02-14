import { logger } from '../utils/logger.js'
import { larkClient } from './client.js'

/**
 * 飞书消息服务
 *
 * 封装飞书消息相关的所有操作:
 * - 回复文本/卡片消息
 * - 发送卡片到聊天
 * - 更新已有卡片
 */
class LarkMessageService {
  /** 回复消息 (文本) */
  async replyText(messageId: string, text: string) {
    return larkClient.im.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    })
  }

  /** 回复交互卡片 */
  async replyCard(messageId: string, card: object) {
    const resp = await larkClient.im.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    })
    return resp.data?.message_id
  }

  /** 发送交互卡片到聊天 */
  async sendCard(chatId: string, card: object) {
    const resp = await larkClient.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    })
    return resp.data?.message_id
  }

  /** 更新卡片消息 (PATCH) */
  async updateCard(messageId: string, card: object) {
    try {
      await larkClient.im.message.patch({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify(card),
        },
      })
    }
    catch (err) {
      logger.error('Failed to update card:', err)
      throw err
    }
  }
}

/** 全局单例 */
export const larkMessageService = new LarkMessageService()
