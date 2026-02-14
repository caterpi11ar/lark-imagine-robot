import type { Buffer } from 'node:buffer'

export interface GenerationRequest {
  /** 文字描述 / prompt (已包含风格前缀) */
  prompt: string
  /** 参考图片 (可选) */
  images?: Buffer[]
  /** 用户提供的 API Key */
  apiKey: string
  /** 图片宽高比 (e.g. "1:1", "16:9") */
  aspectRatio?: string
}

export interface GenerationResult {
  success: boolean
  /** 生成的图片 (成功时) */
  imageBuffer?: Buffer
  /** 错误信息 (失败时) */
  error?: string
}

export interface ImageGenerationService {
  generate: (request: GenerationRequest) => Promise<GenerationResult>
}
