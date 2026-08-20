import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChannel } from '../src/infra/lark/channel'

const sdk = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  disconnect: vi.fn<() => Promise<void>>(),
  on: vi.fn(),
  stream: vi.fn(),
  createChannel: vi.fn(),
}))

vi.mock('@larksuiteoapi/node-sdk', () => ({
  createLarkChannel: sdk.createChannel,
}))

describe('LarkChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sdk.connect.mockResolvedValue()
    sdk.disconnect.mockResolvedValue()
    sdk.on.mockReturnValue(vi.fn())
    sdk.stream.mockResolvedValue({ messageId: 'om_reply' })
    sdk.createChannel.mockReturnValue({
      connect: sdk.connect,
      disconnect: sdk.disconnect,
      on: sdk.on,
      stream: sdk.stream,
    })
  })

  it('connects through the Feishu SDK', async () => {
    const channel = createChannel({
      appId: 'cli_test',
      appSecret: 'secret_test',
      requireMention: true,
    })

    await channel.connect()

    expect(sdk.connect).toHaveBeenCalledOnce()
  })

  it('converts Feishu messages before delivery', async () => {
    const channel = createChannel({
      appId: 'cli_test',
      appSecret: 'secret_test',
      requireMention: true,
    })
    const handler = vi.fn()

    channel.onMessage(handler)

    const sdkHandler = sdk.on.mock.calls[0]?.[1]
    if (typeof sdkHandler !== 'function') {
      throw new Error('SDK message handler was not registered')
    }

    await sdkHandler({
      messageId: 'om_test',
      chatId: 'oc_test',
      chatType: 'p2p',
      senderId: 'ou_test',
      content: '你好',
      rawContentType: 'text',
      resources: [],
      mentions: [],
      mentionAll: false,
      mentionedBot: false,
      rootId: 'om_root',
      threadId: 'omt_thread',
      createTime: 1,
    })

    expect(sdk.on).toHaveBeenCalledWith('message', expect.any(Function))
    expect(handler).toHaveBeenCalledWith({
      messageId: 'om_test',
      chatId: 'oc_test',
      senderId: 'ou_test',
      rootId: 'om_root',
      threadId: 'omt_thread',
      chatType: 'direct',
      mentionedBot: false,
      text: '你好',
    })
  })

  it('omits topic identifiers when Feishu does not provide them', async () => {
    const channel = createChannel({
      appId: 'cli_test',
      appSecret: 'secret_test',
      requireMention: true,
    })
    const handler = vi.fn()

    channel.onMessage(handler)

    const sdkHandler = sdk.on.mock.calls[0]?.[1]
    if (typeof sdkHandler !== 'function') {
      throw new Error('SDK message handler was not registered')
    }

    await sdkHandler({
      messageId: 'om_without_topic',
      chatId: 'oc_group',
      chatType: 'group',
      senderId: 'ou_test',
      content: '群聊消息',
      rawContentType: 'text',
      resources: [],
      mentions: [],
      mentionAll: false,
      mentionedBot: true,
      createTime: 1,
    })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]?.[0]).toStrictEqual({
      messageId: 'om_without_topic',
      chatId: 'oc_group',
      senderId: 'ou_test',
      chatType: 'group',
      mentionedBot: true,
      text: '群聊消息',
    })
  })

  it('streams Markdown into a card replying in the original topic', async () => {
    const channel = createChannel({
      appId: 'cli_test',
      appSecret: 'secret_test',
      requireMention: true,
    })
    const append = vi.fn<(text: string) => Promise<void>>()
    append.mockResolvedValue()
    sdk.stream.mockImplementationOnce(async (_to, input) => {
      if (typeof input !== 'object' || input === null || !('markdown' in input)) {
        throw new Error('expected Markdown stream input')
      }
      await input.markdown({
        append,
        setContent: vi.fn(),
        messageId: 'om_reply',
      })
      return { messageId: 'om_reply' }
    })

    await channel.streamReply({
      messageId: 'om_test',
      chatId: 'oc_test',
      senderId: 'ou_test',
      rootId: 'om_root',
      threadId: 'omt_thread',
      chatType: 'group',
      mentionedBot: true,
      text: '你好',
    }, async (write) => {
      await write('第一段')
      await write('第二段')
    })

    expect(sdk.stream).toHaveBeenCalledWith(
      'oc_test',
      { markdown: expect.any(Function) },
      {
        replyTo: 'om_test',
        replyInThread: true,
      },
    )
    expect(append.mock.calls).toEqual([['第一段'], ['第二段']])
  })
})
