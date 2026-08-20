import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { CredentialStatusStore } from './credential-status.ts'
import type { FeishuBotLocaleKey } from './locales.ts'
import {
    canEnable,
    saveFeishuBotSettings,
    type FeishuBotDraft,
    type SaveResult,
} from './save-settings.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

/** 浏览器从 Host 设置分区读取的字段。 */
export interface FeishuBotSettings {
    /** 是否建立飞书长连接。 */
    enabled?: boolean
    /** 飞书自建应用 App ID。 */
    appId?: string
    /** App Secret 在 DSH 凭据服务中的引用。 */
    appSecretEnv?: string
    /** 飞书专用 Agent 使用的模型推理强度。 */
    reasoningEffort?: string
    /** 群聊是否必须 @ 机器人。 */
    requireMention?: boolean
}

/** 设置卡片从注册处获得的能力。 */
export interface FeishuBotCardFace {
    /** 与 Host 命名空间同步的设置作用域。 */
    settings: SettingsScope<FeishuBotSettings>
    /** 只暴露配置状态的凭据 store。 */
    credentials: CredentialStatusStore
    /** 用于保存设置和只写凭据的 Web API。 */
    api: Pick<IApiClient, 'credentials' | 'settings'>
    /** Host 端注册的设置命名空间。 */
    namespace: string
    /** App Secret 的默认凭据引用。 */
    defaultCredentialRef: string
}

/** 渲染器为飞书卡片组装的 Props。 */
export type FeishuBotCardProps =
    PropsRuntime<'settings.plugin.item'>
    & PropsLocale<'settings.feishuBot'>
    & InjectFace<FeishuBotCardFace>

const styles: Record<string, CSSProperties> = {
    card: {
        listStyle: 'none',
        border: '1px solid var(--dsw-alias-border-l2, rgb(0 0 0 / 12%))',
        borderRadius: 12,
        background: 'var(--dsw-alias-bg-layer-1, white)',
        overflow: 'hidden',
    },
    summary: {
        cursor: 'pointer',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    title: { fontWeight: 650, fontSize: 15 },
    description: { opacity: 0.7, fontSize: 13 },
    body: {
        borderTop: '1px solid var(--dsw-alias-border-l2, rgb(0 0 0 / 12%))',
        padding: 18,
        display: 'grid',
        gap: 18,
    },
    field: { display: 'grid', gap: 7 },
    label: { fontSize: 14, fontWeight: 600 },
    hint: { margin: 0, opacity: 0.68, fontSize: 12, lineHeight: 1.5 },
    input: {
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid var(--dsw-alias-border-l2, rgb(0 0 0 / 15%))',
        borderRadius: 8,
        padding: '9px 11px',
        color: 'inherit',
        background: 'var(--dsw-alias-bg-base, white)',
    },
    checkRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
    badge: {
        marginLeft: 8,
        fontSize: 11,
        fontWeight: 500,
        opacity: 0.7,
    },
    footer: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 },
    status: { margin: 0, fontSize: 12 },
    button: {
        border: 0,
        borderRadius: 8,
        padding: '9px 16px',
        fontWeight: 600,
        color: 'var(--dsw-alias-bg-layer-3, white)',
        background: 'var(--dsw-alias-label-primary, #111827)',
        cursor: 'pointer',
    },
    buttonDisabled: { cursor: 'default', opacity: 0.4 },
}

function draftFrom(settings: FeishuBotSettings | undefined): FeishuBotDraft {
    return {
        enabled: settings?.enabled ?? false,
        appId: settings?.appId ?? '',
        appSecret: '',
        reasoningEffort: settings?.reasoningEffort ?? 'off',
        requireMention: settings?.requireMention ?? true,
    }
}

function statusKey(result: SaveResult | undefined): FeishuBotLocaleKey | undefined {
    if (result === undefined) return undefined
    if (result === 'saved') return 'saved'
    if (result === 'invalid') return 'missingConfiguration'
    return 'saveFailed'
}

/**
 * 渲染飞书插件的图形化设置卡片。
 *
 * @param props - 设置作用域、凭据状态、保存 API 和本地化文案。
 * @returns 插件配置页中的一张卡片。
 */
export function FeishuBotCard(props: FeishuBotCardProps) {
    const settings = useSyncExternalStore(
        listener => props.settings.subscribe(listener),
        () => props.settings.getSnapshot(),
    )
    const credential = useSyncExternalStore(
        listener => props.credentials.subscribe(listener),
        () => props.credentials.getSnapshot(),
    )
    const [draft, setDraft] = useState<FeishuBotDraft>(() => draftFrom(settings.value))
    const [saving, setSaving] = useState(false)
    const [result, setResult] = useState<SaveResult>()
    const loadedRevision = useRef<number>()
    const credentialRef = settings.value?.appSecretEnv ?? props.defaultCredentialRef

    useEffect(() => {
        void props.credentials.load(credentialRef)
    }, [credentialRef, props.credentials])

    useEffect(() => {
        if (saving || settings.status !== 'ready') return
        if (loadedRevision.current === settings.revision) return
        loadedRevision.current = settings.revision
        setDraft(draftFrom(settings.value))
    }, [saving, settings.revision, settings.status, settings.value])

    if (settings.status !== 'ready') return null

    const enableReady = canEnable(draft, credential.configured)
    const invalid = draft.enabled && !enableReady
    const disabled = !settings.writable || saving
    const displayedStatus = statusKey(result)

    const save = async (): Promise<void> => {
        setSaving(true)
        setResult(undefined)
        const next = await saveFeishuBotSettings(
            props.api,
            props.namespace,
            credentialRef,
            settings.revision,
            draft,
            credential.configured,
        )
        if (next === 'saved') {
            setDraft(current => ({ ...current, appSecret: '' }))
            await props.credentials.load(credentialRef)
        }
        setResult(next)
        setSaving(false)
    }

    return (
        <li style={styles.card}>
            <details>
                <summary style={styles.summary}>
                    <span style={styles.title}>{props.t('title')}</span>
                    <span style={styles.description}>{props.t('description')}</span>
                </summary>
                <div style={styles.body}>
                    {!settings.writable
                        ? <p style={styles.status} role="status">{props.t('readOnly')}</p>
                        : null}

                    <div style={styles.field}>
                        <label style={styles.label} htmlFor="feishu-bot-app-id">{props.t('appId')}</label>
                        <input
                            id="feishu-bot-app-id"
                            style={styles.input}
                            value={draft.appId}
                            disabled={disabled}
                            onChange={(event) => {
                                setResult(undefined)
                                setDraft(current => ({ ...current, appId: event.target.value }))
                            }}
                        />
                        <p style={styles.hint}>{props.t('appIdHint')}</p>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label} htmlFor="feishu-bot-app-secret">
                            {props.t('appSecret')}
                            <span style={styles.badge}>
                                {props.t(credential.configured ? 'secretConfigured' : 'secretMissing')}
                            </span>
                        </label>
                        <input
                            id="feishu-bot-app-secret"
                            style={styles.input}
                            type="password"
                            autoComplete="off"
                            placeholder={credential.configured ? '********' : undefined}
                            value={draft.appSecret}
                            disabled={disabled || !credential.writable}
                            onChange={(event) => {
                                setResult(undefined)
                                setDraft(current => ({ ...current, appSecret: event.target.value }))
                            }}
                        />
                        <p style={styles.hint}>{props.t('appSecretHint')}</p>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label} htmlFor="feishu-bot-reasoning-effort">
                            {props.t('reasoningEffort')}
                        </label>
                        <input
                            id="feishu-bot-reasoning-effort"
                            style={styles.input}
                            value={draft.reasoningEffort}
                            disabled={disabled}
                            onChange={(event) => {
                                setResult(undefined)
                                setDraft(current => ({ ...current, reasoningEffort: event.target.value }))
                            }}
                        />
                        <p style={styles.hint}>{props.t('reasoningEffortHint')}</p>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.checkRow}>
                            <input
                                type="checkbox"
                                checked={draft.requireMention}
                                disabled={disabled}
                                onChange={(event) => {
                                    setResult(undefined)
                                    setDraft(current => ({ ...current, requireMention: event.target.checked }))
                                }}
                            />
                            <span>
                                <span style={styles.label}>{props.t('requireMention')}</span>
                                <p style={styles.hint}>{props.t('requireMentionHint')}</p>
                            </span>
                        </label>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.checkRow}>
                            <input
                                type="checkbox"
                                checked={draft.enabled}
                                disabled={disabled || (!draft.enabled && !enableReady)}
                                onChange={(event) => {
                                    setResult(undefined)
                                    setDraft(current => ({ ...current, enabled: event.target.checked }))
                                }}
                            />
                            <span>
                                <span style={styles.label}>{props.t('enabled')}</span>
                                <p style={styles.hint}>{props.t('enabledHint')}</p>
                            </span>
                        </label>
                    </div>

                    <div style={styles.footer}>
                        {invalid
                            ? <p style={styles.status} role="alert">{props.t('missingConfiguration')}</p>
                            : displayedStatus === undefined
                                ? null
                                : <p style={styles.status} role="status">{props.t(displayedStatus)}</p>}
                        <button
                            type="button"
                            style={{
                                ...styles.button,
                                ...(disabled || invalid ? styles.buttonDisabled : {}),
                            }}
                            disabled={disabled || invalid}
                            onClick={() => { void save() }}
                        >
                            {props.t(saving ? 'saving' : 'save')}
                        </button>
                    </div>
                </div>
            </details>
        </li>
    )
}
