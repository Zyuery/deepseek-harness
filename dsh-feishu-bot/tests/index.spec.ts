import { Context, Service } from '@deepseek-ai/cordis'
import {
  CredentialProvider,
  credentialRef,
  type CredentialInfo,
  type CredentialRef,
  type ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as FeishuBot from '../src/index.ts'

const lark = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  disconnect: vi.fn<() => Promise<void>>(),
  unsubscribe: vi.fn<() => void>(),
  onMessage: vi.fn(),
  createChannel: vi.fn(),
}))

vi.mock('../src/infra/lark/channel.ts', () => ({
  createChannel: lark.createChannel,
}))

class MemorySettings extends SettingsProvider {
  readonly writable = true
  private readonly doc: Record<string, unknown>

  constructor(ctx: Context, config: { doc?: Record<string, unknown> } = {}) {
    super(ctx)
    this.doc = structuredClone(config.doc ?? {})
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

class MemoryCredentials extends CredentialProvider {
  private readonly values = new Map<string, string>()

  constructor(ctx: Context, config: { values?: Record<string, string> } = {}) {
    super(ctx)
    for (const [ref, value] of Object.entries(config.values ?? {})) this.values.set(ref, value)
  }

  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'memory' })
  }

  describe(ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({
      configured: this.values.has(ref),
      writable: true,
    })
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
    this.ctx.emit('credentials/updated', ref)
    return Promise.resolve()
  }

  unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
    this.ctx.emit('credentials/updated', ref)
    return Promise.resolve()
  }
}

class AgentsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'agents')
  }
}

class SessionPersistenceService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'sessionPersistence')
  }
}

async function mountAgentServices(ctx: Context): Promise<void> {
  await ctx.plugin(AgentsService)
  await ctx.plugin(SessionPersistenceService)
}

async function boot(options: {
  settings?: Record<string, unknown>
  credentials?: Record<string, string>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(MemorySettings, { doc: options.settings })
  await ctx.plugin(MemoryCredentials, { values: options.credentials })
  await mountAgentServices(ctx)
  const bot = ctx.plugin(FeishuBot, {})
  await bot
  return { ctx, bot }
}

describe('Feishu bot plugin lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lark.connect.mockResolvedValue()
    lark.disconnect.mockResolvedValue()
    lark.onMessage.mockReturnValue(lark.unsubscribe)
    lark.createChannel.mockReturnValue({
      connect: lark.connect,
      disconnect: lark.disconnect,
      onMessage: lark.onMessage,
    })
  })

  it('registers graphical settings without connecting while disabled', async () => {
    const { ctx, bot } = await boot()

    expect(ctx.settings.describe().find(({ ns }) => ns === 'feishu-bot')?.value).toEqual({
      enabled: false,
      appSecretEnv: 'FEISHU_APP_SECRET',
      requireMention: true,
    })
    expect(lark.createChannel).not.toHaveBeenCalled()

    await bot.dispose()
  })

  it('connects only after App ID, App Secret, and enabled are configured', async () => {
    const { ctx, bot } = await boot({
      credentials: { FEISHU_APP_SECRET: 'secret_test' },
    })

    await expect(ctx.settings.update(FeishuBot.FEISHU_BOT_SETTINGS_NAMESPACE, { enabled: true }))
      .rejects.toThrow(/App ID/)
    await ctx.settings.update(FeishuBot.FEISHU_BOT_SETTINGS_NAMESPACE, {
      appId: ' cli_test ',
      enabled: true,
    })
    await vi.waitFor(() => {
      expect(lark.connect).toHaveBeenCalledOnce()
    })

    expect(lark.createChannel).toHaveBeenCalledWith({
      appId: 'cli_test',
      appSecret: 'secret_test',
      requireMention: true,
    })

    await bot.dispose()
    expect(lark.unsubscribe).toHaveBeenCalledOnce()
    expect(lark.disconnect).toHaveBeenCalledOnce()
  })

  it('disconnects when the graphical switch is turned off', async () => {
    const { ctx, bot } = await boot({
      settings: {
        'feishu-bot': { appId: 'cli_test', enabled: true },
      },
      credentials: { FEISHU_APP_SECRET: 'secret_test' },
    })

    expect(lark.connect).toHaveBeenCalledOnce()
    await ctx.settings.update(FeishuBot.FEISHU_BOT_SETTINGS_NAMESPACE, { enabled: false })
    await vi.waitFor(() => {
      expect(lark.disconnect).toHaveBeenCalledOnce()
    })

    expect(lark.unsubscribe).toHaveBeenCalledOnce()
    expect(lark.unsubscribe.mock.invocationCallOrder[0])
      .toBeLessThan(lark.disconnect.mock.invocationCallOrder[0]!)

    await bot.dispose()
  })

  it('replaces the connection when App Secret changes', async () => {
    const { ctx, bot } = await boot({
      settings: {
        'feishu-bot': { appId: 'cli_test', enabled: true },
      },
      credentials: { FEISHU_APP_SECRET: 'secret_test' },
    })

    await ctx.credentials.set(credentialRef('FEISHU_APP_SECRET'), 'secret_rotated')
    await vi.waitFor(() => {
      expect(lark.createChannel).toHaveBeenCalledTimes(2)
    })

    expect(lark.disconnect).toHaveBeenCalledOnce()
    expect(lark.createChannel).toHaveBeenLastCalledWith({
      appId: 'cli_test',
      appSecret: 'secret_rotated',
      requireMention: true,
    })

    await bot.dispose()
    expect(lark.disconnect).toHaveBeenCalledTimes(2)
  })

  it('removes the subscription when the initial connection fails', async () => {
    lark.connect.mockRejectedValueOnce(new Error('handshake failed'))
    const ctx = new Context()
    await ctx.plugin(MemorySettings, {
      doc: { 'feishu-bot': { appId: 'cli_test', enabled: true } },
    })
    await ctx.plugin(MemoryCredentials, {
      values: { FEISHU_APP_SECRET: 'secret_test' },
    })
    await mountAgentServices(ctx)
    const bot = ctx.plugin(FeishuBot, {})

    await expect(bot).rejects.toThrow(/handshake failed/)
    expect(lark.unsubscribe).toHaveBeenCalledOnce()
    expect(lark.disconnect).not.toHaveBeenCalled()
  })
})
