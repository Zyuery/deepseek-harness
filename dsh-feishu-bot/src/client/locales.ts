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
    | 'reasoningEffort'
    | 'reasoningEffortHint'
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
    appSecretHint: '星号表示密钥已配置；输入新值可以替换。密钥不会写入普通设置。',
    secretConfigured: '已配置',
    secretMissing: '未配置',
    reasoningEffort: '模型推理强度',
    reasoningEffortHint: '默认使用 off，让模型直接生成飞书可见的正文；其他值由当前模型提供方定义。',
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
    appSecretHint: 'Asterisks mean a secret is configured; enter a new value to replace it. The secret is never stored in ordinary settings.',
    secretConfigured: 'Configured',
    secretMissing: 'Not configured',
    reasoningEffort: 'Model reasoning effort',
    reasoningEffortHint: 'The default is off so the model emits Feishu-visible text directly; other values are provider-defined.',
    requireMention: 'Require @mention in group chats',
    requireMentionHint: 'When enabled, ordinary group messages do not trigger DSH.',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved.',
    saveFailed: 'Save failed. Check the values and try again.',
    missingConfiguration: 'Enter App ID and App Secret before enabling.',
    readOnly: 'This DSH settings document is read-only.',
}
