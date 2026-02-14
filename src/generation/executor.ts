import type { Buffer } from 'node:buffer'
import type { GenerationParams } from '../cards/templates.js'
import type { ImageGenerationService } from './types.js'
import {
  buildErrorCard,
  buildProgressCard,
  buildPromptModifiers,
  buildResultCard,
  DEFAULT_PARAMS,
} from '../cards/templates.js'
import { larkImageService } from '../lark/image.js'
import { larkMessageService } from '../lark/message.js'
import { webhookService } from '../lark/webhook.js'
import { sessionManager } from '../session/manager.js'
import { logger } from '../utils/logger.js'

/**
 * 图片生成执行器
 *
 * 负责执行图片生成的完整流程:
 * 1. 更新卡片为 "生成中"
 * 2. 下载用户发送的参考图片 (如有)
 * 3. 构建完整 prompt (包含风格/亮度等修饰)
 * 4. 调用图片生成服务
 * 5. 上传生成的图片到飞书
 * 6. 更新卡片为结果卡片
 */
class GenerationExecutor {
  /** 执行图片生成 */
  async execute(
    sessionId: string,
    service: ImageGenerationService,
  ): Promise<void> {
    const session = sessionManager.get(sessionId)
    if (!session || !session.apiKey || !session.cardMessageId) {
      logger.error(`Invalid session for generation: ${sessionId}`)
      return
    }

    const promptSummary = session.textContent || '(仅图片输入)'

    try {
      // 1. 更新卡片为 "生成中"
      sessionManager.update(sessionId, { status: 'generating' })
      await larkMessageService.updateCard(
        session.cardMessageId,
        buildProgressCard(promptSummary),
      )

      // 2. 下载用户发送的参考图片
      const images: Buffer[] = []
      for (const imageKey of session.imageKeys) {
        try {
          const buf = await larkImageService.download(session.messageId, imageKey)
          images.push(buf)
          logger.info(`Downloaded image: ${imageKey}`)
        }
        catch (err) {
          logger.warn(`Failed to download image ${imageKey}:`, err)
        }
      }

      // 3. 构建完整 prompt
      const params: GenerationParams = {
        artStyle: session.artStyle || DEFAULT_PARAMS.artStyle,
        aspectRatio: session.aspectRatio || DEFAULT_PARAMS.aspectRatio,
        brightness: session.brightness || DEFAULT_PARAMS.brightness,
        colorTone: session.colorTone || DEFAULT_PARAMS.colorTone,
        detailLevel: session.detailLevel || DEFAULT_PARAMS.detailLevel,
        negativePrompt: session.negativePrompt || DEFAULT_PARAMS.negativePrompt,
        seed: session.seed || DEFAULT_PARAMS.seed,
      }

      const { prefix, suffix } = buildPromptModifiers(params)
      const prompt = prefix + session.textContent + suffix

      logger.info(`Generation params: ${JSON.stringify(params)}`)
      logger.info(`Final prompt: "${prompt}"`)

      // 4. 调用图片生成服务
      const result = await service.generate({
        prompt,
        images: images.length > 0 ? images : undefined,
        apiKey: session.apiKey,
        aspectRatio: session.aspectRatio,
      })

      if (!result.success || !result.imageBuffer) {
        throw new Error(result.error || '生成失败：未返回图片')
      }

      // 5. 上传生成的图片到飞书
      const imageKey = await larkImageService.upload(result.imageBuffer)

      // 6. 构建并更新结果卡片
      const resultCard = buildResultCard(promptSummary, imageKey, params, prompt)
      await larkMessageService.updateCard(session.cardMessageId, resultCard)
      sessionManager.update(sessionId, { status: 'done' })
      logger.info(`Generation completed for session: ${sessionId}`)

      // 7. 通过 Webhook 推送相同的结果卡片 (如已配置)
      await webhookService.sendCard(resultCard)
    }
    catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error(`Generation failed for session ${sessionId}: ${errorMsg}`)

      sessionManager.update(sessionId, { status: 'error' })
      try {
        await larkMessageService.updateCard(
          session.cardMessageId,
          buildErrorCard(promptSummary, errorMsg),
        )
      }
      catch (updateErr) {
        logger.error('Failed to update error card:', updateErr)
      }
    }
  }
}

/** 全局单例 */
export const generationExecutor = new GenerationExecutor()
