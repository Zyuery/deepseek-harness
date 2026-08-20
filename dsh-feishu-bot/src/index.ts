import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { createMessageController } from './controller/message-controller.ts'
import { createDshAgentGateway } from './infra/dsh/agent-gateway.ts'
import { createChannel } from './infra/lark/channel.ts'
import type { LarkChannel, LarkChannelConfig } from './infra/lark/channel.ts'
import type { InboundMessage } from './model/inbound-message.ts'

/** Cordis 诊断信息中使用的飞书插件名称。 */
export const name = 'dsh-feishu-bot'

/** 图形化设置页和 Host 端共用的配置命名空间。 */
export const FEISHU_BOT_SETTINGS_NAMESPACE = settingsNamespace('feishu-bot')

/** 飞书 App Secret 在 DSH 凭据服务中的默认引用。 */
export const DEFAULT_APP_SECRET_REF = 'FEISHU_APP_SECRET'

/** 插件必须在 DSH 的设置和凭据服务就绪后启动。 */
export const inject = [
    'settings',
    'credentials',
    'agentDefaultModel',
    'agents',
    'sessionPersistence',
]

/** 飞书机器人的可视化配置。 */
export interface Config {
    /** 是否建立飞书长连接。 */
    enabled?: boolean
    /** 飞书开放平台自建应用的 App ID。 */
    appId?: string
    /** 保存 App Secret 的 DSH 凭据引用。 */
    appSecretEnv?: string
    /** 飞书专用 Agent 使用的模型推理强度。 */
    reasoningEffort?: string
    /** 群聊消息是否必须明确提及机器人。 */
    requireMention?: boolean
}

/** 飞书插件配置的运行时校验规则。 */
export const Config: z<Config> = z.object({
    enabled: z.boolean().default(false),
    appId: z.string(),
    appSecretEnv: z.string().role('credential-ref').default(DEFAULT_APP_SECRET_REF),
    reasoningEffort: z.string().min(1).default('off'),
    requireMention: z.boolean().default(true),
})

/**
 * 拒绝无法启动飞书连接的普通设置。
 *
 * App Secret 由异步凭据服务管理，在真正连接前单独检查。
 *
 * @param config - 经过 Schemastery 处理的飞书配置。
 * @throws 启用插件但 App ID 为空时抛出错误。
 */
export function assertServiceableConfig(config: Config): void {
    if (config.enabled === true && config.appId?.trim().length === 0) {
        throw new Error(`${name}: App ID is required before the plugin can be enabled`)
    }
    if (config.enabled === true && config.appId === undefined) {
        throw new Error(`${name}: App ID is required before the plugin can be enabled`)
    }
}

interface ActiveChannel {
    channel: LarkChannel
    unsubscribe: () => void
    replyAbort: AbortController
    replyTasks: Set<Promise<void>>
    connected: boolean
}

function logInboundMessage(ctx: Context, message: InboundMessage): void {
    ctx.logger.info(
        'received Feishu message %s in chat %s',
        message.messageId,
        message.chatId,
    )
}

async function resolveChannelConfig(ctx: Context, config: Config): Promise<LarkChannelConfig> {
    assertServiceableConfig(config)
    const appSecretRef = credentialRef(config.appSecretEnv ?? DEFAULT_APP_SECRET_REF)
    const resolved = await ctx.credentials.resolve(appSecretRef)
    if (resolved === undefined) {
        throw new Error(
            `${name}: App Secret ${appSecretRef} is not configured; set it on the DSH plugin settings page`,
        )
    }
    return {
        appId: config.appId!.trim(),
        appSecret: resolved.value,
        requireMention: config.requireMention ?? true,
    }
}

/**
 * 注册图形化设置，并仅在配置启用时管理飞书 Channel。
 *
 * @param ctx - 提供设置、凭据和生命周期的 Cordis Context。
 * @param config - `cordis.patch.yml` 提供的基础配置。
 * @returns 初始配置已应用后完成的 Promise。
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
    const settings = ctx.settings.register(FEISHU_BOT_SETTINGS_NAMESPACE, Config, {
        base: config,
        validate: assertServiceableConfig,
    })

    await ctx.effect(async function* () {
        let active: ActiveChannel | undefined
        let generation = 0
        let closed = false
        let tail = Promise.resolve()

        const stop = async (): Promise<void> => {
            const previous = active
            active = undefined
            if (previous === undefined) return
            previous.unsubscribe()
            previous.replyAbort.abort()
            await Promise.allSettled(previous.replyTasks)
            if (previous.connected) await previous.channel.disconnect()
        }

        const replace = async (expectedGeneration: number): Promise<void> => {
            if (closed || expectedGeneration !== generation) return
            await stop()
            if (closed || expectedGeneration !== generation) return

            const current = settings.get()
            if (current.enabled !== true) return
            const channelConfig = await resolveChannelConfig(ctx, current)
            const channel = createChannel(channelConfig)
            const controller = createMessageController(
                createDshAgentGateway(ctx, {
                    sessionNamespace: channelConfig.appId,
                    workspaceRoot: process.cwd(),
                    ...current.reasoningEffort === undefined
                        ? {}
                        : { reasoningEffort: current.reasoningEffort },
                }),
                channel,
            )
            const replyAbort = new AbortController()
            const replyTasks = new Set<Promise<void>>()
            const next: ActiveChannel = {
                channel,
                unsubscribe: channel.onMessage((message) => {
                    logInboundMessage(ctx, message)
                    const task = controller.handle(message, replyAbort.signal)
                    replyTasks.add(task)
                    void task
                        .catch((error: unknown) => {
                            ctx.logger.error(
                                'failed to reply to Feishu message %s: %s',
                                message.messageId,
                                String(error),
                            )
                        })
                        .finally(() => replyTasks.delete(task))
                }),
                replyAbort,
                replyTasks,
                connected: false,
            }
            active = next
            try {
                await channel.connect()
                next.connected = true
                ctx.logger.info('Feishu channel connected')
            } catch (error) {
                if (active === next) await stop()
                throw error
            }

            if (closed || expectedGeneration !== generation) await stop()
        }

        const schedule = (): Promise<void> => {
            const expectedGeneration = ++generation
            const task = tail.then(() => replace(expectedGeneration))
            tail = task.catch(() => {})
            return task
        }

        const unwatch = settings.watch(() => schedule())
        const offCredential = ctx.on('credentials/updated', (ref) => {
            const current = settings.get()
            if (current.enabled !== true) return
            if (ref !== credentialRef(current.appSecretEnv ?? DEFAULT_APP_SECRET_REF)) return
            return schedule()
        })

        yield async () => {
            unwatch()
            offCredential()
            closed = true
            generation += 1
            await tail
            await stop()
        }

        await schedule()
    }, `${name}.channel`)
}
