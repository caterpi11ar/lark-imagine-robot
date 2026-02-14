import axios from 'axios'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

/**
 * 自定义机器人 Webhook 服务
 *
 * 通过自定义机器人 Webhook URL 向群聊推送消息
 * @see https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
 */
class WebhookService {
  /** 发送文本消息 */
  async sendText(text: string) {
    return this.send({
      msg_type: 'text',
      content: { text },
    })
  }

  /** 发送富文本消息 */
  async sendPost(title: string, content: unknown[][]) {
    return this.send({
      msg_type: 'post',
      content: {
        post: {
          zh_cn: { title, content },
        },
      },
    })
  }

  /** 发送图片消息 (需要先上传到飞书获取 image_key) */
  async sendImage(imageKey: string) {
    return this.send({
      msg_type: 'image',
      content: { image_key: imageKey },
    })
  }

  /** 发送交互卡片 */
  async sendCard(card: object) {
    return this.send({
      msg_type: 'interactive',
      card,
    })
  }

  /** 底层发送方法 */
  private async send(payload: object) {
    const url = config.webhookUrl
    if (!url) {
      return // 未配置 webhook，静默跳过
    }

    try {
      const resp = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      })

      if (resp.data?.code !== 0) {
        logger.warn(
          `Webhook send failed: code=${resp.data?.code}, msg=${resp.data?.msg}`,
        )
      }
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`Webhook send error: ${msg}`)
    }
  }
}

/** 全局单例 */
export const webhookService = new WebhookService()
