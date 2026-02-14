import axios from 'axios'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

/**
 * 机器人信息服务
 *
 * 启动时获取机器人自身的 open_id，用于：
 * - 群聊中检测 @本机器人 的 mention
 */
class BotInfoService {
  private _openId = ''

  /** 机器人的 open_id (需先调用 fetch) */
  get openId(): string {
    return this._openId
  }

  /**
   * 获取并缓存机器人的 open_id
   * @see https://open.feishu.cn/document/server-docs/bot-v3/bot-info/get
   */
  async fetch(): Promise<void> {
    try {
      const token = await this.getTenantAccessToken()
      if (!token) {
        logger.error('Failed to get tenant_access_token')
        return
      }

      const resp = await axios.get(
        'https://open.feishu.cn/open-apis/bot/v3/info',
        { headers: { Authorization: `Bearer ${token}` } },
      )

      this._openId = resp.data?.bot?.open_id || ''
      const botName = resp.data?.bot?.app_name || 'unknown'
      logger.info(`Bot info loaded: name="${botName}", open_id="${this._openId}"`)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`Failed to fetch bot info: ${msg}`)
    }
  }

  /**
   * 获取 tenant_access_token (内部应用)
   * @see https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal
   */
  private async getTenantAccessToken(): Promise<string> {
    const resp = await axios.post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        app_id: config.lark.appId,
        app_secret: config.lark.appSecret,
      },
    )
    return resp.data?.tenant_access_token || ''
  }
}

/** 全局单例 */
export const botInfoService = new BotInfoService()
