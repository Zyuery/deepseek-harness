import type { Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDshAgentGateway,
  sessionIdForInboundMessage,
} from '../src/infra/dsh/agent-gateway.ts'
import type { InboundMessage } from '../src/model/inbound-message.ts'

const agent = {
  id: '',
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

const agentDefaultModel = {
  currentSelection: vi.fn(),
}

type Listener = (...args: unknown[]) => void
const listeners = new Map<string, Set<Listener>>()

function on(name: string, listener: Listener): () => void {
  let entries = listeners.get(name)
  if (entries === undefined) {
    entries = new Set()
    listeners.set(name, entries)
  }
  entries.add(listener)
  return () => entries.delete(listener)
}

function emit(name: string, ...args: unknown[]): void {
  for (const listener of listeners.get(name) ?? []) listener(...args)
}

const ctx = {
  agents,
  agentDefaultModel,
  sessionPersistence,
  on,
} as unknown as Context

const WORKSPACE_ROOT = '/workspace'

function testSessionId(
  message: InboundMessage,
  namespace = 'cli_test',
  workspaceRoot = WORKSPACE_ROOT,
): ReturnType<typeof sessionIdForInboundMessage> {
  return sessionIdForInboundMessage(namespace, workspaceRoot, message)
}

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
    listeners.clear()
    agents.get.mockReturnValue(undefined)
    agents.create.mockResolvedValue({ agent, dispose: vi.fn() })
    agents.resume.mockResolvedValue({ agent, dispose: vi.fn() })
    sessionPersistence.list.mockResolvedValue([])
    agentDefaultModel.currentSelection.mockReturnValue({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    agent.followup.mockImplementation((prompt) => {
      emit('agent/inbox/discarded', { agent, message: prompt })
    })
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

    expect(testSessionId(direct)).toBe(testSessionId(sameDirectChat))
    expect(testSessionId(firstGroupSender)).not.toBe(testSessionId(secondGroupSender))
    expect(testSessionId(firstThreadSender)).toBe(testSessionId(secondThreadSender))
    expect(testSessionId(direct)).not.toBe(testSessionId(direct, 'cli_other'))
    expect(testSessionId(direct)).not.toBe(testSessionId(direct, 'cli_test', '/other'))
  })

  it('creates a fresh Agent and queues a model-visible user message', async () => {
    const message = inboundMessage()
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    agent.id = testSessionId(message)

    await gateway.followup(message, vi.fn().mockResolvedValue(undefined), new AbortController().signal)

    const sessionId = testSessionId(message)
    expect(agents.create).toHaveBeenCalledWith({
      sessionId,
      meta: { cwd: WORKSPACE_ROOT },
      agentOptions: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
      },
      setup: expect.any(Function),
    })
    expect(agents.resume).not.toHaveBeenCalled()
    expect(agent.followup).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      content: [{ type: 'text', text: '你好' }],
      source: { kind: 'user' },
    }))
  })

  it('uses the deployment default model for a fresh Feishu session', async () => {
    const message = inboundMessage()
    const sessionId = testSessionId(message)
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
    })
    agent.id = sessionId

    await gateway.followup(message, vi.fn().mockResolvedValue(undefined), new AbortController().signal)

    expect(agentDefaultModel.currentSelection).toHaveBeenCalledOnce()
    expect(agents.create).toHaveBeenCalledWith({
      sessionId,
      meta: { cwd: WORKSPACE_ROOT },
      agentOptions: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
      },
      setup: expect.any(Function),
    })
  })

  it('installs the configured reasoning effort in the Feishu Agent scope', async () => {
    const message = inboundMessage()
    const sessionId = testSessionId(message)
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
      reasoningEffort: 'off',
    })
    agent.id = sessionId

    await gateway.followup(message, vi.fn().mockResolvedValue(undefined), new AbortController().signal)

    const createOptions = agents.create.mock.calls[0]?.[0]
    const setup = createOptions?.setup
    if (setup === undefined) throw new Error('Agent setup was not installed')
    const scopedListeners = new Map<string, Listener>()
    const setupCtx = {
      on(name: string, listener: Listener) {
        scopedListeners.set(name, listener)
        return () => scopedListeners.delete(name)
      },
    } as unknown as Context
    await setup(setupCtx)
    const assemble = scopedListeners.get('system-prompt/assemble')
    const request = scopedListeners.get('agent/request')
    if (assemble === undefined || request === undefined) {
      throw new Error('model selection listeners were not installed')
    }
    await assemble({}, {}, () => Promise.resolve({ variables: {} }))
    const resolved = await request({}, () => Promise.resolve({
      provider: 'seed',
      model: 'seed',
      reasoningEffort: ReasoningEffortId('high'),
    }))

    expect(resolved).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      reasoningEffort: ReasoningEffortId('off'),
    })
  })

  it('resumes a materialized session before queuing the next message', async () => {
    const message = inboundMessage({
      chatType: 'group',
      rootId: 'om_topic_root',
    })
    const sessionId = testSessionId(message)
    sessionPersistence.list.mockResolvedValue([{ id: sessionId }])
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
    })
    agent.id = sessionId

    await gateway.followup(message, vi.fn().mockResolvedValue(undefined), new AbortController().signal)

    expect(agents.resume).toHaveBeenCalledWith({
      resumeSessionId: sessionId,
      agentOptions: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
      },
      setup: expect.any(Function),
    })
    expect(agents.create).not.toHaveBeenCalled()
    expect(agent.followup).toHaveBeenCalledOnce()
  })

  it('cancels only the live Agent for a stop command', async () => {
    agents.get.mockReturnValue(agent)
    const message = inboundMessage()
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
    })

    await gateway.stop(message)

    expect(agent.cancel).toHaveBeenCalledWith({ kind: 'user' })
    expect(agents.create).not.toHaveBeenCalled()
    expect(agents.resume).not.toHaveBeenCalled()
    expect(sessionPersistence.list).not.toHaveBeenCalled()
  })

  it('streams only the target prompt turn and preserves chunk order', async () => {
    const message = inboundMessage()
    const sessionId = testSessionId(message)
    agent.id = sessionId
    agent.followup.mockImplementation(() => {})
    const write = vi.fn<(text: string) => Promise<void>>()
    write.mockResolvedValue()
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
    })

    const reply = gateway.followup(message, write, new AbortController().signal)
    await vi.waitFor(() => expect(agent.followup).toHaveBeenCalledOnce())
    const prompt = agent.followup.mock.calls[0]?.[0]
    if (prompt === undefined) throw new Error('prompt was not queued')

    emit('session/event', { id: sessionId }, {
      type: 'assistant/chunk',
      data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '别人的回复' } },
    })
    emit('agent/inbox/claimed', { agent, message: prompt, turn: 2 })
    emit('session/event', { id: sessionId }, {
      type: 'assistant/chunk',
      data: { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: '你' } },
    })
    emit('session/event', { id: sessionId }, {
      type: 'assistant/chunk',
      data: { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: '好' } },
    })
    emit('session/event', { id: sessionId }, {
      type: 'assistant/message',
      data: {
        turn: 2,
        step: 1,
        message: { content: [{ type: 'text', text: '你好' }] },
      },
    })
    emit('session/event', { id: sessionId }, {
      type: 'turn/end',
      data: { turn: 2, reason: { kind: 'completed' } },
    })
    await reply

    expect(write.mock.calls).toEqual([['你'], ['好']])
  })

  it('uses the assembled assistant message when no text chunks were emitted', async () => {
    const message = inboundMessage()
    const sessionId = testSessionId(message)
    agent.id = sessionId
    agent.followup.mockImplementation(() => {})
    const write = vi.fn<(text: string) => Promise<void>>()
    write.mockResolvedValue()
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
    })

    const reply = gateway.followup(message, write, new AbortController().signal)
    await vi.waitFor(() => expect(agent.followup).toHaveBeenCalledOnce())
    const prompt = agent.followup.mock.calls[0]?.[0]
    if (prompt === undefined) throw new Error('prompt was not queued')
    emit('agent/inbox/claimed', { agent, message: prompt, turn: 3 })
    emit('session/event', { id: sessionId }, {
      type: 'assistant/message',
      data: {
        turn: 3,
        step: 1,
        message: {
          content: [
            { type: 'reasoning', text: '内部推理' },
            { type: 'text', text: '最终回复' },
          ],
        },
      },
    })
    emit('session/event', { id: sessionId }, {
      type: 'turn/end',
      data: { turn: 3, reason: { kind: 'completed' } },
    })
    await reply

    expect(write).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith('最终回复')
  })

  it('does not expose reasoning when a completed turn has no visible text', async () => {
    const message = inboundMessage()
    const sessionId = testSessionId(message)
    agent.id = sessionId
    agent.followup.mockImplementation(() => {})
    const write = vi.fn<(text: string) => Promise<void>>()
    write.mockResolvedValue()
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
    })

    const reply = gateway.followup(message, write, new AbortController().signal)
    await vi.waitFor(() => expect(agent.followup).toHaveBeenCalledOnce())
    const prompt = agent.followup.mock.calls[0]?.[0]
    if (prompt === undefined) throw new Error('prompt was not queued')
    emit('agent/inbox/claimed', { agent, message: prompt, turn: 4 })
    emit('session/event', { id: sessionId }, {
      type: 'assistant/message',
      data: {
        turn: 4,
        step: 1,
        message: { content: [{ type: 'reasoning', text: '内部推理' }] },
      },
    })
    emit('session/event', { id: sessionId }, {
      type: 'turn/end',
      data: { turn: 4, reason: { kind: 'completed' } },
    })
    await reply

    expect(write).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith('> 模型本轮没有产生可见文本，请换一种说法重试。')
    expect(JSON.stringify(write.mock.calls)).not.toContain('内部推理')
  })

  it('ends an outstanding reply when its observation signal is aborted', async () => {
    const message = inboundMessage()
    agent.id = testSessionId(message)
    agent.followup.mockImplementation(() => {})
    const abort = new AbortController()
    const gateway = createDshAgentGateway(ctx, {
      sessionNamespace: 'cli_test',
      workspaceRoot: WORKSPACE_ROOT,
    })

    const reply = gateway.followup(message, vi.fn().mockResolvedValue(undefined), abort.signal)
    await vi.waitFor(() => expect(agent.followup).toHaveBeenCalledOnce())
    abort.abort()

    await expect(reply).resolves.toBeUndefined()
    expect([...listeners.values()].every((entries) => entries.size === 0)).toBe(true)
  })
})
