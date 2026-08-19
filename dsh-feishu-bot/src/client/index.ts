import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-credentials/types'
import { CredentialStatusStore } from './credential-status.ts'
import { FeishuBotCard } from './FeishuBotCard.tsx'
import type { FeishuBotSettings } from './FeishuBotCard.tsx'
import { en, zh, type FeishuBotLocaleKey } from './locales.ts'

/** Host 和浏览器卡片用于关联的设置命名空间。 */
const SETTINGS_NAMESPACE = 'feishu-bot'

/** App Secret 在 DSH 凭据服务中的默认引用。 */
const DEFAULT_CREDENTIAL_REF = 'FEISHU_APP_SECRET'

/** 飞书设置卡片自有的文案命名空间。 */
const LOCALE_NAMESPACE = 'settings.feishuBot'

declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** 飞书机器人设置卡片的文案键。 */
        'settings.feishuBot': FeishuBotLocaleKey
    }
}

/** 浏览器端需要的 Cordis 服务。 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * 在 DSH Web 的“插件配置”页注册飞书机器人卡片。
 *
 * @param ctx - DSH 浏览器端 Cordis Context。
 */
export function apply(ctx: ClientContext): void {
    const { api } = ctx.get('connection') as ConnectionHandle
    const settings = ctx.settingsScope.bind<FeishuBotSettings>({ namespace: SETTINGS_NAMESPACE })
    const credentials = new CredentialStatusStore(api)

    ctx.effect(
        () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
        'dsh-feishu-bot: settings dictionaries',
    )
    ctx.effect(
        () => ctx.remote.$on('credentials/updated', ref => credentials.refresh(ref)),
        'dsh-feishu-bot: credential state updates',
    )
    ctx.effect(
        () => () => credentials.dispose(),
        'dsh-feishu-bot: credential state store',
    )

    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: SETTINGS_NAMESPACE,
        locale: LOCALE_NAMESPACE,
        inject: () => ({
            settings,
            credentials,
            api,
            namespace: SETTINGS_NAMESPACE,
            defaultCredentialRef: DEFAULT_CREDENTIAL_REF,
        }),
    }, FeishuBotCard))
}

export type { FeishuBotSettings } from './FeishuBotCard.tsx'
export type { FeishuBotDraft, SaveResult } from './save-settings.ts'
export { canEnable, saveFeishuBotSettings } from './save-settings.ts'
