import type { AgentGateway } from './agent-gateway.ts'
import type { InboundMessage } from '../model/inbound-message.ts'

/** 归一化入站消息的命令路由与 Agent 投递入口。 */
export interface MessageController {
    /**
     * 忽略空文本，将 `/stop` 路由到停止操作，并将其他消息投递为 follow-up。
     *
     * @param message - 已由飞书适配层归一化的入站消息。
     * @returns 对应 Agent 操作完成后结束的 Promise。
     */
    handle(message: InboundMessage): Promise<void>
}

/**
 * 创建只依赖 Controller 端口的消息编排器。
 *
 * @param gateway - 执行 follow-up 和停止操作的 Agent 端口。
 * @returns 消息编排器。
 */
export function createMessageController(gateway: AgentGateway): MessageController {
    return {
        async handle(message) {
            const text = message.text.trim()
            if (text.length === 0) return
            if (text === '/stop') {
                await gateway.stop(message)
                return
            }
            await gateway.followup(message)
        },
    }
}
