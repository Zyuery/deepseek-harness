import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMessageController } from '../src/controller/message-controller.ts'
import type { AgentGateway } from '../src/controller/agent-gateway.ts'
import type { ReplyGateway } from '../src/controller/reply-gateway.ts'
import type { InboundMessage } from '../src/model/inbound-message.ts'

const gateway = {
  followup: vi.fn<AgentGateway['followup']>(),
  stop: vi.fn<AgentGateway['stop']>(),
}
const write = vi.fn<(text: string) => Promise<void>>()
const replies = {
  streamReply: vi.fn<ReplyGateway['streamReply']>(),
}

function inboundMessage(text: string): InboundMessage {
  return {
    messageId: 'om_test',
    chatId: 'oc_test',
    senderId: 'ou_test',
    chatType: 'direct',
    mentionedBot: false,
    text,
  }
}

describe('MessageController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gateway.followup.mockResolvedValue()
    gateway.stop.mockResolvedValue()
    write.mockResolvedValue()
    replies.streamReply.mockImplementation(async (_message, produce) => {
      await produce(write)
    })
  })

  it('forwards ordinary text to the Agent gateway', async () => {
    const controller = createMessageController(gateway, replies)
    const message = inboundMessage('你好')
    const signal = new AbortController().signal

    await controller.handle(message, signal)

    expect(replies.streamReply).toHaveBeenCalledWith(message, expect.any(Function))
    expect(gateway.followup).toHaveBeenCalledWith(message, write, signal)
    expect(gateway.stop).not.toHaveBeenCalled()
  })

  it('routes a trimmed stop command without forwarding it to the model', async () => {
    const controller = createMessageController(gateway, replies)
    const message = inboundMessage('  /stop  ')

    await controller.handle(message, new AbortController().signal)

    expect(gateway.stop).toHaveBeenCalledWith(message)
    expect(gateway.followup).not.toHaveBeenCalled()
    expect(replies.streamReply).not.toHaveBeenCalled()
  })

  it('ignores text that is empty after trimming', async () => {
    const controller = createMessageController(gateway, replies)

    await controller.handle(inboundMessage(' \n\t '), new AbortController().signal)

    expect(gateway.followup).not.toHaveBeenCalled()
    expect(gateway.stop).not.toHaveBeenCalled()
    expect(replies.streamReply).not.toHaveBeenCalled()
  })

  it('does not create a card after the connection has begun closing', async () => {
    const controller = createMessageController(gateway, replies)
    const abort = new AbortController()
    abort.abort()

    await controller.handle(inboundMessage('你好'), abort.signal)

    expect(replies.streamReply).not.toHaveBeenCalled()
    expect(gateway.followup).not.toHaveBeenCalled()
  })
})
