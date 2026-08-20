import type { Context } from '@deepseek-ai/cordis'
import {
    installModelSelection,
    type Agent,
    type AgentOptions,
    type AgentSetup,
    type ModelSelection,
} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { createHash } from 'node:crypto'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import {
    SessionId,
    type SessionId as SessionIdValue,
    type TurnEndReason,
} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { AgentGateway } from '../../controller/agent-gateway.ts'
import type { InboundMessage } from '../../model/inbound-message.ts'

/** DSH Agent 网关的组装配置。 */
export interface DshAgentGatewayConfig {
    /** 隔离不同飞书应用产生的 Session ID。 */
    sessionNamespace: string
    /** 新建 Session 绑定的 DSH 工作目录。 */
    workspaceRoot: string
    /** 新建或恢复 Agent 时选择的提供方路由。 */
    provider?: string
    /** 新建或恢复 Agent 时选择的模型。 */
    model?: string
    /** 新建或恢复 Agent 时使用的模型推理强度。 */
    reasoningEffort?: string
}

function sessionScope(message: InboundMessage): string {
    if (message.chatType === 'direct') return `direct:${message.chatId}`
    const topicId = message.threadId ?? message.rootId
    if (topicId !== undefined) return `group:${message.chatId}:topic:${topicId}`
    return `group:${message.chatId}:sender:${message.senderId}`
}

function workspaceKey(workspaceRoot: string): string {
    return createHash('sha256').update(workspaceRoot).digest('base64url').slice(0, 16)
}

/**
 * 将飞书会话范围映射为稳定的 DSH Session ID。
 *
 * 单聊按 chat 共享，群话题按 thread/root 共享，普通群消息按发送者隔离。
 *
 * @param namespace - 飞书应用或部署命名空间。
 * @param workspaceRoot - 隔离不同 DSH 工作目录的绝对路径。
 * @param message - 已归一化的入站消息。
 * @returns 可供 `ctx.agents` 和持久化服务共用的 Session ID。
 */
export function sessionIdForInboundMessage(
    namespace: string,
    workspaceRoot: string,
    message: InboundMessage,
): SessionIdValue {
    return SessionId(
        `feishu:${encodeURIComponent(namespace)}:${workspaceKey(workspaceRoot)}:${encodeURIComponent(sessionScope(message))}`,
    )
}

function modelSelection(ctx: Context, config: DshAgentGatewayConfig): ModelSelection {
    const defaults = ctx.agentDefaultModel.currentSelection()
    return {
        provider: config.provider ?? defaults.provider,
        model: config.model ?? defaults.model,
        ...config.reasoningEffort === undefined
            ? defaults.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: defaults.reasoningEffort }
            : { reasoningEffort: ReasoningEffortId(config.reasoningEffort) },
    }
}

function agentOptions(selection: ModelSelection): AgentOptions {
    return { provider: selection.provider, model: selection.model }
}

function installSelection(selection: ModelSelection): AgentSetup {
    return (agentCtx) => {
        installModelSelection(agentCtx, { current: selection, assembled: undefined })
    }
}

function turnEndNotice(reason: TurnEndReason, hasVisibleText: boolean): string | undefined {
    switch (reason.kind) {
        case 'completed':
            return hasVisibleText ? undefined : '> 模型本轮没有产生可见文本，请换一种说法重试。'
        case 'aborted':
            return '\n\n> 已停止生成。'
        case 'blocked':
            return '\n\n> Agent 未接受这条消息。'
        case 'error':
            return '\n\n> DSH 处理消息时发生错误，请查看服务日志。'
        case 'max-tokens':
            return '\n\n> 回复因达到输出长度限制而结束。'
        case 'interrupted':
            return '\n\n> DSH 在处理这条消息时中断。'
        default:
            return '\n\n> DSH 未能完成这次回复。'
    }
}

function textFromAssistantMessage(message: Agent['session']['events'][number] & {
    type: 'assistant/message'
}): string {
    return message.data.message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('')
}

async function streamPromptTurn(
    ctx: Context,
    agent: Agent,
    prompt: ReturnType<typeof createUserMessage>,
    write: (text: string) => Promise<void>,
    signal: AbortSignal,
): Promise<void> {
    if (signal.aborted) return

    let targetTurn: number | undefined
    let settled = false
    let terminalError: Error | undefined
    let writeFailed = false
    let writeError: unknown
    let writeTail = Promise.resolve()
    let hasVisibleText = false
    const streamedSteps = new Set<number>()
    let resolveDone!: () => void
    const done = new Promise<void>((resolve) => { resolveDone = resolve })

    const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        terminalError = error
        resolveDone()
    }
    const queueWrite = (text: string): void => {
        if (text.length === 0 || settled || writeFailed) return
        writeTail = writeTail
            .then(() => write(text))
            .catch((error: unknown) => {
                writeFailed = true
                writeError = error
                finish()
            })
    }

    const offClaimed = ctx.on('agent/inbox/claimed', ({
        agent: claimedAgent,
        message,
        turn,
    }) => {
        if (claimedAgent === agent && message.id === prompt.id) targetTurn = turn
    })
    const offDiscarded = ctx.on('agent/inbox/discarded', ({
        agent: discardedAgent,
        message,
    }) => {
        if (discardedAgent !== agent || message.id !== prompt.id) return
        queueWrite('\n\n> 消息在执行前被取消。')
        finish()
    })
    const offSessionEvent = ctx.on('session/event', (session, event) => {
        if (session.id !== agent.id || targetTurn === undefined) return
        if (event.type === 'assistant/chunk'
            && event.data.turn === targetTurn
            && event.data.chunk.type === 'text-delta') {
            if (event.data.chunk.text.length > 0) {
                streamedSteps.add(event.data.step)
                hasVisibleText = true
            }
            queueWrite(event.data.chunk.text)
            return
        }
        if (event.type === 'assistant/message' && event.data.turn === targetTurn) {
            if (!streamedSteps.has(event.data.step)) {
                const text = textFromAssistantMessage(event)
                if (text.length > 0) hasVisibleText = true
                queueWrite(text)
            }
            return
        }
        if (event.type !== 'turn/end' || event.data.turn !== targetTurn) return
        const notice = turnEndNotice(event.data.reason, hasVisibleText)
        if (notice !== undefined) queueWrite(notice)
        finish()
    })
    const offDisposed = ctx.on('agent/disposed', ({ agent: disposedAgent }) => {
        if (disposedAgent !== agent) return
        finish(new Error(`agent ${agent.id} was disposed before the Feishu reply completed`))
    })
    const onAbort = (): void => { finish() }
    signal.addEventListener('abort', onAbort, { once: true })

    try {
        agent.followup(prompt)
        await done
        await writeTail
        if (writeFailed) throw writeError
        if (terminalError !== undefined) throw terminalError
    } finally {
        signal.removeEventListener('abort', onAbort)
        offClaimed()
        offDiscarded()
        offSessionEvent()
        offDisposed()
    }
}

/**
 * 创建使用 Harness Agent Registry 和 Session Persistence 的 Controller 端口。
 *
 * @param ctx - 提供默认模型、`agents` 和 `sessionPersistence` 的 Cordis Context。
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
            const selection = modelSelection(ctx, config)
            const options = agentOptions(selection)
            const setup = installSelection(selection)
            const handle = materialized
                ? await ctx.agents.resume({
                    resumeSessionId: sessionId,
                    agentOptions: options,
                    setup,
                })
                : await ctx.agents.create({
                    sessionId,
                    meta: { cwd: config.workspaceRoot },
                    agentOptions: options,
                    setup,
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
        async followup(message, write, signal) {
            const sessionId = sessionIdForInboundMessage(
                config.sessionNamespace,
                config.workspaceRoot,
                message,
            )
            const agent = await getOrStartAgent(sessionId)
            if (signal.aborted) return
            const prompt = createUserMessage({
                content: [{ type: 'text', text: message.text }],
                source: { kind: 'user' },
            })
            await streamPromptTurn(ctx, agent, prompt, write, signal)
        },
        async stop(message) {
            const sessionId = sessionIdForInboundMessage(
                config.sessionNamespace,
                config.workspaceRoot,
                message,
            )
            ctx.agents.get(sessionId)?.cancel({ kind: 'user' })
        },
    }
}
