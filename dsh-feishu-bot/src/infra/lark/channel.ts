/** 飞书官方 Channel 的连接生命周期适配器。 */

import { createLarkChannel as createSdkChannel } from '@larksuiteoapi/node-sdk'
import type { InboundMessage } from '../../model/inbound-message.ts'

/** 创建飞书连接所需的凭据和消息策略。 */
export interface LarkChannelConfig {
    /** 飞书自建应用的 App ID。 */
    appId: string
    /** 飞书自建应用的 App Secret。 */
    appSecret: string
    /** 群聊消息是否必须明确提及机器人。 */
    requireMention: boolean
}

/** 插件入口负责管理的飞书连接生命周期。 */
export interface LarkChannel {
    connect(): Promise<void>

    disconnect(): Promise<void>

    onMessage(
        handler: (message: InboundMessage) => void | Promise<void>,
    ): () => void
}

/**
 * 创建由飞书官方 SDK 驱动的 Channel。
 *
 * @param config - 飞书凭据和入站消息策略。
 * @returns 可由 Cordis 生命周期管理的飞书连接。
 */
export function createChannel(config: LarkChannelConfig): LarkChannel {
    const sdkChannel = createSdkChannel({
        appId: config.appId,
        appSecret: config.appSecret,
        policy: {
            requireMention: config.requireMention,
        },
        source: 'dsh-feishu-bot',
    })

    return {
        connect: () => sdkChannel.connect(),
        disconnect: () => sdkChannel.disconnect(),
        onMessage(handler) {
            return sdkChannel.on('message', (message) => {
                return handler({
                    messageId: message.messageId,
                    chatId: message.chatId,
                    senderId: message.senderId,
                    chatType: message.chatType === 'p2p' ? 'direct' : 'group',
                    mentionedBot: message.mentionedBot,
                    text: message.content,
                    ...(message.rootId === undefined
                        ? {}
                        : { rootId: message.rootId }),
                    ...(message.threadId === undefined
                        ? {}
                        : { threadId: message.threadId }),
                })
            })
        },
    }
}
