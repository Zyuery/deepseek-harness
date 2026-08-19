/** Controller 消费的、不依赖飞书 SDK 类型的入站消息。 */
export interface InboundMessage {
  readonly eventId: string
  readonly messageId: string
  readonly tenantKey: string
  readonly chatId: string
  readonly senderId: string
  readonly threadId?: string
  readonly chatType: 'direct' | 'group'
  readonly mentionedBot: boolean
  readonly text: string
}
