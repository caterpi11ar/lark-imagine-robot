import { Client, Domain, LoggerLevel } from '@larksuiteoapi/node-sdk'
import { config } from '../config.js'

export const larkClient = new Client({
  appId: config.lark.appId,
  appSecret: config.lark.appSecret,
  domain: Domain.Feishu,
  loggerLevel: LoggerLevel.info,
})
