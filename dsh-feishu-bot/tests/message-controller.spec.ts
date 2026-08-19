import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMessageController } from '../src/controller/message-controller.ts'
import type { AgentGateway } from '../src/controller/agent-gateway.ts'
import type { InboundMessage } from '../src/model/inbound-message.ts'

const gateway = {
  followup: vi.fn<AgentGateway['followup']>(),
  stop: vi.fn<AgentGateway['stop']>(),
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
  })

  it('forwards ordinary text to the Agent gateway', async () => {
    const controller = createMessageController(gateway)
    const message = inboundMessage('你好')

    await controller.handle(message)

    expect(gateway.followup).toHaveBeenCalledWith(message)
    expect(gateway.stop).not.toHaveBeenCalled()
  })

  it('routes a trimmed stop command without forwarding it to the model', async () => {
    const controller = createMessageController(gateway)
    const message = inboundMessage('  /stop  ')

    await controller.handle(message)

    expect(gateway.stop).toHaveBeenCalledWith(message)
    expect(gateway.followup).not.toHaveBeenCalled()
  })

  it('ignores text that is empty after trimming', async () => {
    const controller = createMessageController(gateway)

    await controller.handle(inboundMessage(' \n\t '))

    expect(gateway.followup).not.toHaveBeenCalled()
    expect(gateway.stop).not.toHaveBeenCalled()
  })
})
