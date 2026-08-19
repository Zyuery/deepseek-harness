import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionId as SessionIdValue } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { AgentGateway } from '../../controller/agent-gateway.ts'
import type { InboundMessage } from '../../model/inbound-message.ts'

/** DSH Agent 网关的组装配置。 */
export interface DshAgentGatewayConfig {
    /** 隔离不同飞书应用产生的 Session ID。 */
    sessionNamespace: string
    /** 新建或恢复 Agent 时选择的提供方路由。 */
    provider?: string
    /** 新建或恢复 Agent 时选择的模型。 */
    model?: string
}

function sessionScope(message: InboundMessage): string {
    if (message.chatType === 'direct') return `direct:${message.chatId}`
    const topicId = message.threadId ?? message.rootId
    if (topicId !== undefined) return `group:${message.chatId}:topic:${topicId}`
    return `group:${message.chatId}:sender:${message.senderId}`
}

/**
 * 将飞书会话范围映射为稳定的 DSH Session ID。
 *
 * 单聊按 chat 共享，群话题按 thread/root 共享，普通群消息按发送者隔离。
 *
 * @param namespace - 飞书应用或部署命名空间。
 * @param message - 已归一化的入站消息。
 * @returns 可供 `ctx.agents` 和持久化服务共用的 Session ID。
 */
export function sessionIdForInboundMessage(
    namespace: string,
    message: InboundMessage,
): SessionIdValue {
    return SessionId(
        `feishu:${encodeURIComponent(namespace)}:${encodeURIComponent(sessionScope(message))}`,
    )
}

function agentOptions(config: DshAgentGatewayConfig): AgentOptions {
    return {
        ...(config.provider === undefined ? {} : { provider: config.provider }),
        ...(config.model === undefined ? {} : { model: config.model }),
    }
}

/**
 * 创建使用 Harness Agent Registry 和 Session Persistence 的 Controller 端口。
 *
 * @param ctx - 提供 `agents` 和 `sessionPersistence` 的 Cordis Context。
 * @param config - 会话命名空间和可选模型选择。
 * @returns 可投递 follow-up 和取消实时 Agent 的网关。
 */
export function createDshAgentGateway(
    ctx: Context,
    config: DshAgentGatewayConfig,
): AgentGateway {
    const starting = new Map<SessionIdValue, Promise<Agent>>()

    const getOrStartAgent = async (sessionId: SessionIdValue): Promise<Agent> => {
        const live = ctx.agents.get(sessionId)
        if (live !== undefined) return live

        const pending = starting.get(sessionId)
        if (pending !== undefined) return pending

        const start = (async () => {
            const materialized = (await ctx.sessionPersistence.list())
                .some(({ id }) => id === sessionId)
            const options = agentOptions(config)
            const handle = materialized
                ? await ctx.agents.resume({
                    resumeSessionId: sessionId,
                    agentOptions: options,
                })
                : await ctx.agents.create({
                    sessionId,
                    agentOptions: options,
                })
            return handle.agent
        })()
        starting.set(sessionId, start)
        try {
            return await start
        } finally {
            if (starting.get(sessionId) === start) starting.delete(sessionId)
        }
    }

    return {
        async followup(message) {
            const sessionId = sessionIdForInboundMessage(config.sessionNamespace, message)
            const agent = await getOrStartAgent(sessionId)
            agent.followup(createUserMessage({
                content: [{ type: 'text', text: message.text }],
                source: { kind: 'user' },
            }))
        },
        async stop(message) {
            const sessionId = sessionIdForInboundMessage(config.sessionNamespace, message)
            ctx.agents.get(sessionId)?.cancel({ kind: 'user' })
        },
    }
}
