import type { Part } from '@google/genai'
import type {
  GenerationRequest,
  GenerationResult,
  ImageGenerationService,
} from '../types.js'
import { Buffer } from 'node:buffer'
import { GoogleGenAI } from '@google/genai'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'

/**
 * Google Gemini 图片生成 Provider
 * 使用 @google/genai SDK，支持 Gemini 原生图片生成能力
 */
export class GeminiProvider implements ImageGenerationService {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    try {
      const ai = new GoogleGenAI({
        apiKey: request.apiKey,
        httpOptions: {
          baseUrl: config.gemini.baseUrl,
        },
      })

      // 构建 parts 数组
      const parts: Part[] = []

      // 添加参考图片 (base64 inline data)
      if (request.images && request.images.length > 0) {
        for (const img of request.images) {
          parts.push({
            inlineData: {
              data: img.toString('base64'),
              mimeType: 'image/png',
            },
          })
        }
      }

      // 添加文字 prompt，明确要求生成图片
      const imagePrompt = request.prompt
        ? `请根据以下描述生成一张图片：${request.prompt}`
        : '请根据提供的参考图片生成一张新的图片。'
      parts.push({ text: imagePrompt })

      const model = config.gemini.model
      const aspectRatio = request.aspectRatio || '1:1'
      logger.info(
        `Calling Gemini image generation API (model: ${model}, baseUrl: ${config.gemini.baseUrl}, aspectRatio: ${aspectRatio})`,
      )
      logger.info(`Prompt: ${imagePrompt}`)

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio,
          },
        },
      })

      // 从响应中提取生成的图片
      const responseParts = response.candidates?.[0]?.content?.parts ?? []

      if (responseParts.length === 0) {
        return { success: false, error: 'Gemini API 返回空结果' }
      }

      // 收集文本和图片
      let textOutput = ''
      for (const part of responseParts) {
        if (part.text) {
          textOutput += part.text
        }
        else if (part.inlineData?.data) {
          logger.info(
            `Gemini returned image (mimeType: ${part.inlineData.mimeType})`,
          )
          return {
            success: true,
            imageBuffer: Buffer.from(part.inlineData.data, 'base64'),
          }
        }
      }

      // 没有找到图片，可能被安全策略过滤
      const reason = textOutput
        ? `Gemini 未返回图片，文本回复: ${textOutput}`
        : 'Gemini API 响应中未找到图片 (可能被安全策略过滤)'
      return { success: false, error: reason }
    }
    catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`Gemini generation failed: ${msg}`)
      return { success: false, error: msg }
    }
  }
}
