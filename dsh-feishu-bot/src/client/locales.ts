/** 飞书设置卡片使用的文案键。 */
export type FeishuBotLocaleKey =
    | 'title'
    | 'description'
    | 'enabled'
    | 'enabledHint'
    | 'appId'
    | 'appIdHint'
    | 'appSecret'
    | 'appSecretHint'
    | 'secretConfigured'
    | 'secretMissing'
    | 'requireMention'
    | 'requireMentionHint'
    | 'save'
    | 'saving'
    | 'saved'
    | 'saveFailed'
    | 'missingConfiguration'
    | 'readOnly'

/** 简体中文文案。 */
export const zh: Record<FeishuBotLocaleKey, string> = {
    title: '飞书机器人',
    description: '连接飞书自建应用与 DSH 会话。',
    enabled: '启用飞书机器人',
    enabledHint: '仅在 App ID 和 App Secret 都已配置时才能开启。',
    appId: 'App ID',
    appIdHint: '飞书开放平台自建应用的 App ID。',
    appSecret: 'App Secret',
    appSecretHint: '密钥单独存入 DSH 凭据服务，不会写入普通设置。留空保留当前密钥。',
    secretConfigured: '已配置',
    secretMissing: '未配置',
    requireMention: '群聊中必须 @ 机器人',
    requireMentionHint: '开启后，群里的普通消息不会触发 DSH。',
    save: '保存',
    saving: '保存中…',
    saved: '已保存。',
    saveFailed: '保存失败，请检查配置后重试。',
    missingConfiguration: '先填写 App ID 和 App Secret，再开启。',
    readOnly: '当前 DSH 设置为只读。',
}

/** 英文文案。 */
export const en: Record<FeishuBotLocaleKey, string> = {
    title: 'Feishu bot',
    description: 'Connect a Feishu custom app to DSH conversations.',
    enabled: 'Enable Feishu bot',
    enabledHint: 'The bot can be enabled only after both App ID and App Secret are configured.',
    appId: 'App ID',
    appIdHint: 'The App ID of the custom app in Feishu Open Platform.',
    appSecret: 'App Secret',
    appSecretHint: 'Stored separately by DSH credentials, never in ordinary settings. Leave blank to keep the current secret.',
    secretConfigured: 'Configured',
    secretMissing: 'Not configured',
    requireMention: 'Require @mention in group chats',
    requireMentionHint: 'When enabled, ordinary group messages do not trigger DSH.',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved.',
    saveFailed: 'Save failed. Check the values and try again.',
    missingConfiguration: 'Enter App ID and App Secret before enabling.',
    readOnly: 'This DSH settings document is read-only.',
}
