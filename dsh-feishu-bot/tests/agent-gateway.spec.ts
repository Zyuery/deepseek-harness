import type { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDshAgentGateway,
  sessionIdForInboundMessage,
} from '../src/infra/dsh/agent-gateway.ts'
import type { InboundMessage } from '../src/model/inbound-message.ts'

const agent = {
  followup: vi.fn(),
  cancel: vi.fn(),
}

const agents = {
  get: vi.fn(),
  create: vi.fn(),
  resume: vi.fn(),
}

const sessionPersistence = {
  list: vi.fn(),
}

const ctx = {
  agents,
  sessionPersistence,
} as unknown as Context

function inboundMessage(
  overrides: Partial<InboundMessage> = {},
): InboundMessage {
  return {
    messageId: 'om_test',
    chatId: 'oc_test',
    senderId: 'ou_test',
    chatType: 'direct',
    mentionedBot: false,
    text: '你好',
    ...overrides,
  }
}

describe('DSH Agent gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    agents.get.mockReturnValue(undefined)
    agents.create.mockResolvedValue({ agent, dispose: vi.fn() })
    agents.resume.mockResolvedValue({ agent, dispose: vi.fn() })
    sessionPersistence.list.mockResolvedValue([])
  })

  it('derives stable and isolated session ids from Feishu conversation scope', () => {
    const direct = inboundMessage()
    const sameDirectChat = inboundMessage({ senderId: 'ou_other' })
    const firstGroupSender = inboundMessage({ chatType: 'group' })
    const secondGroupSender = inboundMessage({
      chatType: 'group',
      senderId: 'ou_other',
    })
    const firstThreadSender = inboundMessage({
      chatType: 'group',
      threadId: 'omt_topic',
    })
    const secondThreadSender = inboundMessage({
      chatType: 'group',
      senderId: 'ou_other',
      threadId: 'omt_topic',
    })

    expect(sessionIdForInboundMessage('cli_test', direct))
      .toBe(sessionIdForInboundMessage('cli_test', sameDirectChat))
    expect(sessionIdForInboundMessage('cli_test', firstGroupSender))
      .not.toBe(sessionIdForInboundMessage('cli_test', secondGroupSender))
    expect(sessionIdForInboundMessage('cli_test', firstThreadSender))
      .toBe(sessionIdForInboundMessage('cli_test', secondThreadSender))
    expect(sessionIdForInboundMessage('cli_test', direct))
      .not.toBe(sessionIdForInboundMessage('cli_other', direct))
  })

  it('creates a fresh Agent and queues a model-visible user message', async () => {
    const message = inboundMessage()
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })

    await gateway.followup(message)

    const sessionId = sessionIdForInboundMessage('cli_test', message)
    expect(agents.create).toHaveBeenCalledWith({
      sessionId,
      agentOptions: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
      },
    })
    expect(agents.resume).not.toHaveBeenCalled()
    expect(agent.followup).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      content: [{ type: 'text', text: '你好' }],
      source: { kind: 'user' },
    }))
  })

  it('resumes a materialized session before queuing the next message', async () => {
    const message = inboundMessage({
      chatType: 'group',
      rootId: 'om_topic_root',
    })
    const sessionId = sessionIdForInboundMessage('cli_test', message)
    sessionPersistence.list.mockResolvedValue([{ id: sessionId }])
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
    })

    await gateway.followup(message)

    expect(agents.resume).toHaveBeenCalledWith({
      resumeSessionId: sessionId,
      agentOptions: {},
    })
    expect(agents.create).not.toHaveBeenCalled()
    expect(agent.followup).toHaveBeenCalledOnce()
  })

  it('cancels only the live Agent for a stop command', async () => {
    agents.get.mockReturnValue(agent)
    const message = inboundMessage()
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
    })

    await gateway.stop(message)

    expect(agent.cancel).toHaveBeenCalledWith({ kind: 'user' })
    expect(agents.create).not.toHaveBeenCalled()
    expect(agents.resume).not.toHaveBeenCalled()
    expect(sessionPersistence.list).not.toHaveBeenCalled()
  })
})
