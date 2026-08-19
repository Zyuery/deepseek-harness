import type { InboundMessage } from '../model/inbound-message.ts'

/** 处理入站消息所需的 Agent 操作。 */
export interface AgentGateway {
    /** 将一条已受理消息作为普通 follow-up 轮次投递。 */
    followup(message: InboundMessage): Promise<void>

    /** 停止该消息所属会话范围内正在执行的任务。 */
    stop(message: InboundMessage): Promise<void>
}
