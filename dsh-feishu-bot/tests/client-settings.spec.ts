import { describe, expect, it, vi } from 'vitest'
import {
  canEnable,
  saveFeishuBotSettings,
  type FeishuBotDraft,
} from '../src/client/save-settings.ts'

function draft(values: Partial<FeishuBotDraft> = {}): FeishuBotDraft {
  return {
    enabled: false,
    appId: '',
    appSecret: '',
    reasoningEffort: 'off',
    requireMention: true,
    ...values,
  }
}

function fakeApi(options: { credentialAccepted?: boolean; settingsAccepted?: boolean } = {}) {
  const set = vi.fn(async () => ({
    result: options.credentialAccepted === false
      ? { ok: false }
      : { ok: true, value: {} },
  }))
  const mutate = vi.fn(async () => ({
    result: options.settingsAccepted === false
      ? { ok: false }
      : { ok: true, value: {} },
  }))
  return {
    api: { credentials: { set }, settings: { mutate } } as never,
    set,
    mutate,
  }
}

describe('Feishu graphical settings', () => {
  it('allows enabling only after App ID and an existing or staged secret are present', () => {
    expect(canEnable(draft({ appId: 'cli_test' }), false)).toBe(false)
    expect(canEnable(draft({ appId: 'cli_test', appSecret: 'secret' }), false)).toBe(true)
    expect(canEnable(draft({ appId: 'cli_test' }), true)).toBe(true)
  })

  it('stores App Secret through credentials before ordinary settings', async () => {
    const { api, set, mutate } = fakeApi()
    const result = await saveFeishuBotSettings(
      api,
      'feishu-bot',
      'FEISHU_APP_SECRET',
      7,
      draft({ enabled: true, appId: ' cli_test ', appSecret: ' secret ', requireMention: false }),
      false,
    )

    expect(result).toBe('saved')
    expect(set).toHaveBeenCalledWith({ ref: 'FEISHU_APP_SECRET', value: 'secret' })
    expect(set.mock.invocationCallOrder[0]).toBeLessThan(mutate.mock.invocationCallOrder[0]!)
    expect(mutate).toHaveBeenCalledWith({
      ns: 'feishu-bot',
      expectedRevision: 7,
      ops: [
        { op: 'set', path: ['appId'], value: 'cli_test' },
        { op: 'set', path: ['reasoningEffort'], value: 'off' },
        { op: 'set', path: ['requireMention'], value: false },
        { op: 'set', path: ['enabled'], value: true },
      ],
    })
    expect(JSON.stringify(mutate.mock.calls)).not.toContain('secret')
  })

  it('does not enable the plugin when credential storage fails', async () => {
    const { api, mutate } = fakeApi({ credentialAccepted: false })
    const result = await saveFeishuBotSettings(
      api,
      'feishu-bot',
      'FEISHU_APP_SECRET',
      1,
      draft({ enabled: true, appId: 'cli_test', appSecret: 'secret' }),
      false,
    )

    expect(result).toBe('credential-failed')
    expect(mutate).not.toHaveBeenCalled()
  })

  it('rejects an empty reasoning effort', async () => {
    const { api, mutate } = fakeApi()

    await expect(saveFeishuBotSettings(
      api,
      'feishu-bot',
      'FEISHU_APP_SECRET',
      1,
      draft({ reasoningEffort: ' ' }),
      true,
    )).resolves.toBe('invalid')
    expect(mutate).not.toHaveBeenCalled()
  })
})
