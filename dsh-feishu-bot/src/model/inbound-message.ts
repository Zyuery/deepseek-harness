/** Controller 消费的、不依赖飞书 SDK 类型的入站消息。 */
export interface InboundMessage {
  readonly eventId: string // 消息 ID
  readonly messageId: string // 消息 ID
  readonly tenantKey: string // 租户 ID
  readonly chatId: string // 聊天 ID
  readonly senderId: string // 发送者 ID
  readonly threadId?: string // 线程 ID
  readonly chatType: 'direct' | 'group' // 聊天类型
  readonly mentionedBot: boolean // 是否@了机器人
  readonly text: string // 消息内容
}
