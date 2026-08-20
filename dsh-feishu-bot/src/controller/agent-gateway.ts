import type { InboundMessage } from '../model/inbound-message.ts'

/** 处理入站消息所需的 Agent 操作。 */
export interface AgentGateway {
    /**
     * 将消息投递为普通 follow-up，并按顺序写出该消息所属 Turn 的可见文本。
     *
     * @param message - 已受理的飞书消息。
     * @param write - 按顺序接收回复文本片段的异步写入器。
     * @param signal - 飞书连接关闭时停止观察输出的信号；不会取消 DSH Turn。
     * @returns 目标 Turn 结束、消息被丢弃或观察被停止后完成的 Promise。
     */
    followup(
        message: InboundMessage,
        write: (text: string) => Promise<void>,
        signal: AbortSignal,
    ): Promise<void>

    /** 停止该消息所属会话范围内正在执行的任务。 */
    stop(message: InboundMessage): Promise<void>
}
