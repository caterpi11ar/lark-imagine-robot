import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { logger } from '../utils/logger.js'
import { larkClient } from './client.js'

/**
 * 飞书图片服务
 *
 * 封装飞书图片相关的所有操作:
 * - 从消息中下载图片
 * - 上传图片到飞书
 */
class LarkImageService {
  /** 从用户消息中下载图片，返回 Buffer */
  async download(messageId: string, imageKey: string): Promise<Buffer> {
    const resp = await larkClient.im.messageResource.get({
      path: { message_id: messageId, file_key: imageKey },
      params: { type: 'image' },
    })

    const stream = resp.getReadableStream() as Readable
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  /** 上传图片到飞书，返回 image_key */
  async upload(imageBuffer: Buffer): Promise<string> {
    const resp = await larkClient.im.image.create({
      data: {
        image_type: 'message',
        image: imageBuffer,
      },
    })

    const imageKey = resp?.image_key
    if (!imageKey) {
      throw new Error('Failed to upload image: no image_key returned')
    }
    logger.info(`Image uploaded: ${imageKey}`)
    return imageKey
  }
}

/** 全局单例 */
export const larkImageService = new LarkImageService()
