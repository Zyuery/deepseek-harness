import type { InboundMessage } from '../model/inbound-message.ts'

/** Controller 用于创建飞书流式回复的出站端口。 */
export interface ReplyGateway {
    /**
     * 回复原消息，并把生产器写出的文本更新到同一条流式卡片。
     *
     * @param message - 回复所对应的入站消息。
     * @param produce - 在卡片有效期间按顺序生产 Markdown 文本片段。
     * @returns 卡片结束流式状态后完成的 Promise。
     */
    streamReply(
        message: InboundMessage,
        produce: (write: (text: string) => Promise<void>) => Promise<void>,
    ): Promise<void>
}
