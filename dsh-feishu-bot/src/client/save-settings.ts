import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'

/** 页面中尚未保存的飞书配置。 */
export interface FeishuBotDraft {
    /** 是否启用飞书连接。 */
    enabled: boolean
    /** 飞书 App ID。 */
    appId: string
    /** 只写的 App Secret 输入值。 */
    appSecret: string
    /** 飞书专用 Agent 使用的模型推理强度。 */
    reasoningEffort: string
    /** 群聊是否需要 @ 机器人。 */
    requireMention: boolean
}

/** 保存过程的可识别结果。 */
export type SaveResult = 'saved' | 'invalid' | 'credential-failed' | 'settings-failed'

type SettingsApi = Pick<IApiClient, 'credentials' | 'settings'>

/**
 * 判断当前表单是否已经具备启用条件。
 *
 * @param draft - 当前表单。
 * @param secretConfigured - Host 是否已保存 App Secret。
 * @returns App ID 和现有或新输入的 App Secret 都存在时返回 true。
 */
export function canEnable(draft: FeishuBotDraft, secretConfigured: boolean): boolean {
    return draft.appId.trim().length > 0
        && draft.reasoningEffort.trim().length > 0
        && (secretConfigured || draft.appSecret.trim().length > 0)
}

/**
 * 先写入只写凭据，再原子更新普通设置。
 *
 * @param api - DSH Web 提供的设置和凭据 API。
 * @param namespace - Host 端注册的设置命名空间。
 * @param credentialRef - App Secret 的凭据引用。
 * @param revision - 页面最后读到的设置修订号。
 * @param draft - 要保存的表单。
 * @param secretConfigured - 保存前 Host 报告的凭据状态。
 * @returns 保存结果，不包含凭据字面量。
 */
export async function saveFeishuBotSettings(
    api: SettingsApi,
    namespace: string,
    credentialRef: string,
    revision: number | undefined,
    draft: FeishuBotDraft,
    secretConfigured: boolean,
): Promise<SaveResult> {
    const reasoningEffort = draft.reasoningEffort.trim()
    if (reasoningEffort.length === 0
        || draft.enabled && !canEnable(draft, secretConfigured)) return 'invalid'

    const secret = draft.appSecret.trim()
    if (secret.length > 0) {
        try {
            const response = await api.credentials.set({ ref: credentialRef, value: secret })
            if (!response.result.ok) return 'credential-failed'
        } catch (_credentialWriteFailure) {
            return 'credential-failed'
        }
    }

    const appId = draft.appId.trim()
    try {
        const response = await api.settings.mutate({
            ns: namespace,
            ops: [
                appId.length === 0
                    ? { op: 'unset', path: ['appId'] }
                    : { op: 'set', path: ['appId'], value: appId },
                { op: 'set', path: ['reasoningEffort'], value: reasoningEffort },
                { op: 'set', path: ['requireMention'], value: draft.requireMention },
                { op: 'set', path: ['enabled'], value: draft.enabled },
            ],
            ...(revision === undefined ? {} : { expectedRevision: revision }),
        })
        return response.result.ok ? 'saved' : 'settings-failed'
    } catch (_settingsWriteFailure) {
        return 'settings-failed'
    }
}
