/**
 * 飞书交互卡片模板
 * 使用卡片 JSON v2 schema (body.elements 结构)
 * @see https://open.feishu.cn/document/feishu-cards/card-json-structure
 */

// ────────────────────────────────────────────────────────
// 选项定义 & Prompt 修饰映射
// ────────────────────────────────────────────────────────

/** ① 艺术风格 */
export const ART_STYLE_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: 'watercolor', label: '水彩' },
  { value: 'oil_painting', label: '油画' },
  { value: 'pixel_art', label: '像素风' },
  { value: 'flat_illustration', label: '扁平插画' },
  { value: 'cyberpunk', label: '赛博朋克' },
  { value: 'sketch', label: '素描' },
  { value: '3d_render', label: '3D 渲染' },
] as const

export const ART_STYLE_PROMPT: Record<string, string> = {
  'default': '',
  'realistic': '写实摄影风格',
  'anime': '日式动漫风格',
  'watercolor': '水彩画风格',
  'oil_painting': '经典油画风格',
  'pixel_art': '像素艺术风格',
  'flat_illustration': '扁平矢量插画风格',
  'cyberpunk': '赛博朋克科幻风格',
  'sketch': '铅笔素描风格',
  '3d_render': '3D 渲染风格',
}

/** ② 画面比例 (直接传给 Gemini API imageConfig.aspectRatio) */
export const RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 方形' },
  { value: '16:9', label: '16:9 横屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '4:3', label: '4:3 经典' },
  { value: '3:4', label: '3:4 肖像' },
] as const

/** ③ 亮度调节 */
export const BRIGHTNESS_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'dark', label: '暗调 / 低光' },
  { value: 'normal', label: '自然光' },
  { value: 'bright', label: '明亮' },
  { value: 'high_key', label: '高调 / 过曝' },
] as const

export const BRIGHTNESS_PROMPT: Record<string, string> = {
  default: '',
  dark: '低光暗调氛围',
  normal: '自然柔和光线',
  bright: '明亮充足的光线',
  high_key: '高调过曝光影效果',
}

/** ④ 色调倾向 */
export const COLOR_TONE_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'warm', label: '暖色调' },
  { value: 'cool', label: '冷色调' },
  { value: 'monochrome', label: '单色 / 黑白' },
  { value: 'vintage', label: '复古 / 怀旧' },
  { value: 'vivid', label: '高饱和鲜艳' },
  { value: 'pastel', label: '柔和粉彩' },
] as const

export const COLOR_TONE_PROMPT: Record<string, string> = {
  default: '',
  warm: '暖色调配色',
  cool: '冷色调配色',
  monochrome: '黑白单色',
  vintage: '复古胶片色调',
  vivid: '高饱和度鲜艳配色',
  pastel: '柔和粉彩配色',
}

/** ⑤ 精细度 */
export const DETAIL_LEVEL_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'minimal', label: '简约' },
  { value: 'standard', label: '标准' },
  { value: 'detailed', label: '精细' },
  { value: 'hyper', label: '超精细 / 超写实' },
] as const

export const DETAIL_LEVEL_PROMPT: Record<string, string> = {
  default: '',
  minimal: '简约极简的画面',
  standard: '适中的细节层次',
  detailed: '丰富精细的细节',
  hyper: '超高精细度，超写实级别细节',
}

// ────────────────────────────────────────────────────────
// Prompt 构建工具函数
// ────────────────────────────────────────────────────────

/** 用户在表单中选择的所有生成参数 */
export interface GenerationParams {
  artStyle: string
  aspectRatio: string
  brightness: string
  colorTone: string
  detailLevel: string
  negativePrompt: string
  seed: string
}

/** 默认参数 */
export const DEFAULT_PARAMS: GenerationParams = {
  artStyle: 'default',
  aspectRatio: '1:1',
  brightness: 'default',
  colorTone: 'default',
  detailLevel: 'default',
  negativePrompt: '',
  seed: '',
}

/**
 * 根据用户选择的参数，组装完整的 prompt 修饰文本
 * 返回需要拼接到用户原始 prompt 前/后的内容
 */
export function buildPromptModifiers(params: GenerationParams): {
  prefix: string
  suffix: string
} {
  const parts: string[] = []

  const art = ART_STYLE_PROMPT[params.artStyle]
  if (art)
    parts.push(art)

  const brightness = BRIGHTNESS_PROMPT[params.brightness]
  if (brightness)
    parts.push(brightness)

  const tone = COLOR_TONE_PROMPT[params.colorTone]
  if (tone)
    parts.push(tone)

  const detail = DETAIL_LEVEL_PROMPT[params.detailLevel]
  if (detail)
    parts.push(detail)

  if (params.seed) {
    parts.push(`随机种子: ${params.seed}`)
  }

  const prefix = parts.length > 0 ? `${parts.join('，')}。` : ''

  const suffix = params.negativePrompt
    ? `\n请避免以下元素：${params.negativePrompt}`
    : ''

  return { prefix, suffix }
}

/** 从选项数组中查找 value 对应的 label */
function findLabel(
  options: ReadonlyArray<{ value: string, label: string }>,
  value: string,
): string {
  return options.find(o => o.value === value)?.label || value
}

/**
 * 将 GenerationParams 格式化为可读的参数摘要 (markdown)
 * 只展示非默认的选项
 */
export function formatParamsSummary(params: GenerationParams): string {
  const lines: string[] = []

  lines.push(`**艺术风格：** ${findLabel(ART_STYLE_OPTIONS, params.artStyle)}`)
  lines.push(`**画面比例：** ${params.aspectRatio}`)

  if (params.brightness !== 'default') {
    lines.push(`**亮度：** ${findLabel(BRIGHTNESS_OPTIONS, params.brightness)}`)
  }
  if (params.colorTone !== 'default') {
    lines.push(`**色调：** ${findLabel(COLOR_TONE_OPTIONS, params.colorTone)}`)
  }
  if (params.detailLevel !== 'default') {
    lines.push(`**精细度：** ${findLabel(DETAIL_LEVEL_OPTIONS, params.detailLevel)}`)
  }
  if (params.negativePrompt) {
    lines.push(`**排除词：** ${params.negativePrompt}`)
  }
  if (params.seed) {
    lines.push(`**种子：** ${params.seed}`)
  }

  return lines.join('\n')
}

// ────────────────────────────────────────────────────────
// 辅助：构建 select_static 元素
// ────────────────────────────────────────────────────────
function selectStatic(
  name: string,
  placeholder: string,
  options: ReadonlyArray<{ value: string, label: string }>,
  opts?: { initial?: string, required?: boolean },
) {
  return {
    tag: 'select_static',
    name,
    placeholder: { tag: 'plain_text', content: placeholder },
    ...(opts?.initial ? { initial_option: opts.initial } : {}),
    ...(opts?.required ? { required: true } : {}),
    options: options.map(o => ({
      text: { tag: 'plain_text', content: o.label },
      value: o.value,
    })),
  }
}

// ────────────────────────────────────────────────────────
// 确认卡片
// ────────────────────────────────────────────────────────

/**
 * 确认卡片 - 展示 prompt 摘要 + 所有生成参数选择器 + (可选) API Key 输入
 */
export function buildConfirmCard(
  sessionId: string,
  promptSummary: string,
  hasCachedKey: boolean,
) {
  const formElements: Record<string, unknown>[] = [
    // ── 基础设置 ──
    {
      tag: 'markdown',
      content: '**🖌 艺术风格**　决定画面的整体绘画风格',
    },
    selectStatic('art_style', '选择艺术风格（可选）', ART_STYLE_OPTIONS, { initial: 'default' }),

    {
      tag: 'markdown',
      content: '**📐 画面比例**　输出图片的宽高比',
    },
    selectStatic('aspect_ratio', '选择画面比例（可选）', RATIO_OPTIONS, { initial: '1:1' }),

    // ── 画面调节 (选填，默认值已预设) ──
    {
      tag: 'markdown',
      content: '**☀️ 亮度调节**　控制画面的明暗氛围',
    },
    selectStatic('brightness', '选择亮度（可选）', BRIGHTNESS_OPTIONS, { initial: 'default' }),

    {
      tag: 'markdown',
      content: '**🎨 色调倾向**　设定画面的整体色彩基调',
    },
    selectStatic('color_tone', '选择色调（可选）', COLOR_TONE_OPTIONS, { initial: 'default' }),

    {
      tag: 'markdown',
      content: '**🔍 精细度**　画面细节的丰富程度',
    },
    selectStatic('detail_level', '选择精细度（可选）', DETAIL_LEVEL_OPTIONS, { initial: 'default' }),

    // ── 高级选项 (选填) ──
    {
      tag: 'markdown',
      content: '**⚙️ 高级选项**',
    },

    // 排除词
    {
      tag: 'input',
      name: 'negative_prompt',
      placeholder: { tag: 'plain_text', content: '不希望出现的元素，如: 模糊, 水印, 文字...' },
      label: { tag: 'plain_text', content: '排除词 - 画面中不希望出现的内容（可选）' },
    },

    // 随机种子
    {
      tag: 'input',
      name: 'seed',
      placeholder: { tag: 'plain_text', content: '留空则随机，输入相同数字可复现结果' },
      label: { tag: 'plain_text', content: '随机种子 - 固定数值可复现同一张图（可选）' },
    },
  ]

  // 无缓存时追加 API Key 输入 (必填)
  if (!hasCachedKey) {
    formElements.push({
      tag: 'input',
      name: 'api_key',
      required: true,
      placeholder: { tag: 'plain_text', content: 'sk-...' },
      label: { tag: 'plain_text', content: 'API Key（必填）' },
    })
  }

  // 提交按钮
  formElements.push({
    tag: 'button',
    text: { tag: 'plain_text', content: '确认生成' },
    type: 'primary',
    action_type: 'form_submit',
    name: 'submit_btn',
    value: { session_id: sessionId },
  })

  return {
    schema: '2.0',
    config: { update_multi: true, wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🎨 图片生成确认' },
      template: 'blue',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: `**你的描述：**\n${promptSummary}`,
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content: hasCachedKey
            ? '请选择生成参数后点击确认：'
            : '请选择生成参数并输入 API Key 后点击确认：',
        },
        {
          tag: 'form',
          name: 'confirm_form',
          elements: formElements,
        },
      ],
    },
  }
}

/** 排队中卡片 - 展示排队位置 */
export function buildQueueCard(
  promptSummary: string,
  position: number,
  totalWaiting: number,
) {
  return {
    schema: '2.0',
    config: { update_multi: true, wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🕐 排队中...' },
      template: 'wathet',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: `**你的描述：**\n${promptSummary}`,
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content:
            `**排队位置：** 第 ${position} 位 / 共 ${totalWaiting} 人等待\n\n`
            + '请耐心等待，轮到你时将自动开始生成...',
        },
      ],
    },
  }
}

/** 队列已满卡片 */
export function buildQueueFullCard(promptSummary: string, maxLength: number) {
  return {
    schema: '2.0',
    config: { update_multi: true, wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⚠️ 队列已满' },
      template: 'orange',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: `**你的描述：**\n${promptSummary}`,
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content:
            `当前排队人数已达上限 (${maxLength} 人)，请稍后再试。`,
        },
      ],
    },
  }
}

/** 生成中卡片 */
export function buildProgressCard(promptSummary: string) {
  return {
    schema: '2.0',
    config: { update_multi: true, wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⏳ 图片生成中...' },
      template: 'orange',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: `**你的描述：**\n${promptSummary}`,
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content: '正在努力生成中，请稍候...',
        },
      ],
    },
  }
}

/** 结果卡片 - 展示完整提示词、参数和生成的图片 */
export function buildResultCard(
  promptSummary: string,
  imageKey: string,
  params?: GenerationParams,
  fullPrompt?: string,
) {
  const elements: Record<string, unknown>[] = [
    {
      tag: 'markdown',
      content: `**你的描述：**\n${promptSummary}`,
    },
  ]

  // 展示生成参数 (如有)
  if (params) {
    elements.push({
      tag: 'markdown',
      content: formatParamsSummary(params),
    })
  }

  // 展示完整提示词 (如有且与原始描述不同)
  if (fullPrompt && fullPrompt !== promptSummary) {
    elements.push({
      tag: 'markdown',
      content: `**完整提示词：**\n${fullPrompt}`,
    })
  }

  elements.push({ tag: 'hr' })
  elements.push({
    tag: 'img',
    img_key: imageKey,
    alt: { tag: 'plain_text', content: '生成的图片' },
  })

  return {
    schema: '2.0',
    config: { update_multi: true, wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '✅ 生成完成' },
      template: 'green',
    },
    body: { elements },
  }
}

/** 错误卡片 */
export function buildErrorCard(promptSummary: string, errorMsg: string) {
  return {
    schema: '2.0',
    config: { update_multi: true, wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '❌ 生成失败' },
      template: 'red',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: `**你的描述：**\n${promptSummary}`,
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content: `**错误信息：**\n${errorMsg}`,
        },
      ],
    },
  }
}
