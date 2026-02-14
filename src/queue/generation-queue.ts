import type { ImageGenerationService } from '../generation/types.js'
import { buildProgressCard, buildQueueCard } from '../cards/templates.js'
import { config } from '../config.js'
import { generationExecutor } from '../generation/executor.js'
import { larkMessageService } from '../lark/message.js'
import { sessionManager } from '../session/manager.js'
import { logger } from '../utils/logger.js'

/**
 * 队列中的任务项
 */
interface QueueItem {
  sessionId: string
  service: ImageGenerationService
  enqueuedAt: number
}

/**
 * 入队结果
 */
export type EnqueueResult
  = | { accepted: true, position: number }
    | { accepted: false, reason: string }

/**
 * 图片生成任务队列
 *
 * 特性:
 * - 可配置最大并发数，防止同时请求过多导致服务崩溃
 * - 可配置队列长度限制，超出时拒绝新请求
 * - 入队时反馈用户排队位置
 * - 任务开始执行时更新卡片为 "生成中"
 * - FIFO (先进先出) 调度
 */
class GenerationQueue {
  private readonly maxConcurrency: number
  private readonly maxQueueLength: number
  private running = 0
  private readonly waiting: QueueItem[] = []

  constructor() {
    this.maxConcurrency = config.queue.maxConcurrency
    this.maxQueueLength = config.queue.maxLength
    logger.info(
      `GenerationQueue initialized: maxConcurrency=${this.maxConcurrency}, maxQueueLength=${this.maxQueueLength}`,
    )
  }

  /**
   * 将生成任务入队
   *
   * @returns 入队结果: accepted=true 包含排队位置, accepted=false 包含拒绝原因
   */
  enqueue(
    sessionId: string,
    service: ImageGenerationService,
  ): EnqueueResult {
    // 可以直接执行 (有空闲并发槽)
    if (this.running < this.maxConcurrency && this.waiting.length === 0) {
      this.run({ sessionId, service, enqueuedAt: Date.now() })
      return { accepted: true, position: 0 }
    }

    // 队列已满
    if (this.waiting.length >= this.maxQueueLength) {
      logger.warn(
        `Queue full (${this.waiting.length}/${this.maxQueueLength}), rejecting session ${sessionId}`,
      )
      return {
        accepted: false,
        reason: `当前排队人数已达上限 (${this.maxQueueLength})，请稍后再试`,
      }
    }

    // 入队等待
    const item: QueueItem = { sessionId, service, enqueuedAt: Date.now() }
    this.waiting.push(item)
    const position = this.waiting.length

    logger.info(
      `Session ${sessionId} queued at position ${position}, running=${this.running}, waiting=${this.waiting.length}`,
    )

    return { accepted: true, position }
  }

  /**
   * 获取当前队列状态
   */
  get status() {
    return {
      running: this.running,
      waiting: this.waiting.length,
      maxConcurrency: this.maxConcurrency,
      maxQueueLength: this.maxQueueLength,
    }
  }

  /**
   * 执行任务
   */
  private run(item: QueueItem): void {
    this.running++
    logger.info(
      `Starting generation for session ${item.sessionId}, running=${this.running}, waiting=${this.waiting.length}`,
    )

    // 更新卡片为 "生成中" (如果之前是排队卡片)
    this.updateToProgress(item.sessionId)

    // 执行生成，完成后处理下一个
    generationExecutor.execute(item.sessionId, item.service)
      .catch((err) => {
        logger.error(
          `Unexpected error in queued generation for ${item.sessionId}:`,
          err,
        )
      })
      .finally(() => {
        this.running--
        logger.info(
          `Generation slot freed, running=${this.running}, waiting=${this.waiting.length}`,
        )
        this.processNext()
      })
  }

  /**
   * 处理队列中的下一个任务
   */
  private processNext(): void {
    while (this.running < this.maxConcurrency && this.waiting.length > 0) {
      const next = this.waiting.shift()!
      this.run(next)

      // 更新剩余排队任务的卡片位置
      this.notifyQueuePositions()
    }
  }

  /**
   * 通知所有排队中的用户他们的新位置
   */
  private notifyQueuePositions(): void {
    for (let i = 0; i < this.waiting.length; i++) {
      const item = this.waiting[i]
      const session = sessionManager.get(item.sessionId)
      if (!session?.cardMessageId)
        continue

      const promptSummary = session.textContent || '(仅图片输入)'
      const newPosition = i + 1

      larkMessageService.updateCard(
        session.cardMessageId,
        buildQueueCard(promptSummary, newPosition, this.waiting.length),
      ).catch((err) => {
        logger.warn(`Failed to update queue position for ${item.sessionId}:`, err)
      })
    }
  }

  /**
   * 当任务从排队变为执行时，更新卡片
   */
  private updateToProgress(sessionId: string): void {
    const session = sessionManager.get(sessionId)
    if (!session?.cardMessageId)
      return

    const promptSummary = session.textContent || '(仅图片输入)'
    larkMessageService.updateCard(session.cardMessageId, buildProgressCard(promptSummary)).catch(
      (err) => {
        logger.warn(`Failed to update progress card for ${sessionId}:`, err)
      },
    )
  }
}

/** 全局单例 */
export const generationQueue = new GenerationQueue()
