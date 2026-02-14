import type {
  GenerationRequest,
  GenerationResult,
  ImageGenerationService,
} from '../types.js'
import { Buffer } from 'node:buffer'
import axios from 'axios'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'

/**
 * OpenAI 兼容的图片生成 Provider
 * 支持 DALL-E / GPT-4o image generation / 以及任何兼容 OpenAI API 的服务
 */
export class OpenAIProvider implements ImageGenerationService {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const baseUrl = config.defaultGenerationBaseUrl

    try {
      // 构建消息内容
      const content: Array<Record<string, unknown>> = []

      // 添加文字 prompt
      if (request.prompt) {
        content.push({ type: 'text', text: request.prompt })
      }

      // 添加参考图片 (base64)
      if (request.images && request.images.length > 0) {
        for (const img of request.images) {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${img.toString('base64')}`,
            },
          })
        }
      }

      logger.info(`Calling image generation API at ${baseUrl}`)

      // 调用 OpenAI 兼容 API (chat completions with image generation)
      const resp = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content,
            },
          ],
          modalities: ['text', 'image'],
        },
        {
          headers: {
            'Authorization': `Bearer ${request.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        },
      )

      // 从响应中提取生成的图片
      const choices = resp.data?.choices
      if (!choices || choices.length === 0) {
        return { success: false, error: 'API 返回空结果' }
      }

      const message = choices[0].message

      // 查找图片内容 (支持多种响应格式)
      // 格式1: content 数组中包含 image_url 类型
      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'image_url' && part.image_url?.url) {
            const imageData = part.image_url.url
            // 如果是 base64 data URL
            if (imageData.startsWith('data:')) {
              const base64 = imageData.split(',')[1]
              return {
                success: true,
                imageBuffer: Buffer.from(base64, 'base64'),
              }
            }
            // 如果是普通 URL，下载图片
            const imgResp = await axios.get(imageData, {
              responseType: 'arraybuffer',
            })
            return {
              success: true,
              imageBuffer: Buffer.from(imgResp.data),
            }
          }
        }
      }

      // 格式2: DALL-E 风格响应
      const imageUrl = resp.data?.data?.[0]?.url
      if (imageUrl) {
        const imgResp = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
        })
        return {
          success: true,
          imageBuffer: Buffer.from(imgResp.data),
        }
      }

      return { success: false, error: 'API 响应中未找到图片' }
    }
    catch (err: unknown) {
      const msg
        = axios.isAxiosError(err) && err.response?.data
          ? JSON.stringify(err.response.data)
          : err instanceof Error
            ? err.message
            : String(err)
      logger.error(`Generation failed: ${msg}`)
      return { success: false, error: msg }
    }
  }
}
