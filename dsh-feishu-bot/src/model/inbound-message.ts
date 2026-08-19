/** Controller 消费的、不依赖飞书 SDK 类型的入站消息。 */
export interface InboundMessage {
    /** 飞书消息 ID，也是首版的去重标识。 */
    readonly messageId: string
    /** 飞书会话 ID。 */
    readonly chatId: string
    /** 消息发送者的 Open ID。 */
    readonly senderId: string
    /** 话题根消息 ID。 */
    readonly rootId?: string
    /** 飞书话题 ID。 */
    readonly threadId?: string
    /** 归一化后的会话类型。 */
    readonly chatType: 'direct' | 'group'
    /** 消息是否明确提及机器人。 */
    readonly mentionedBot: boolean
    /** 归一化后的文本内容。 */
    readonly text: string
}
