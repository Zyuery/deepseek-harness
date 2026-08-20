# Agent Note: Feishu bot turn-correlated streaming replies

Status: implemented

English | [中文](2026-08-20-feishu-bot-turn-streaming-replies.zh.md)

## Problem

`agent.followup()` queues input but returns no per-message completion or result. Reading the last assistant message after `whenIdle()` can select another queued input's output, while awaiting the whole model run in the Feishu message handler delays Channel deduplication and subsequent chat dispatch. A connection replacement also needs to stop every output observer before disconnecting without cancelling work already accepted by DSH.

## Decision

The Controller connects two owned ports: the DSH Agent gateway produces ordered visible text, and the Lark reply gateway writes that text into one streaming Markdown card replying to the inbound message. The Lark adapter uses the official Channel `stream()` API and preserves a group topic through `replyInThread`.

The DSH gateway creates a fresh identified `UserMessage`, installs its listeners before `agent.followup()`, and correlates the prompt through `agent/inbox/claimed` to one Turn. It forwards only that Turn's `assistant/chunk` text deltas. An `assistant/message` supplies the visible text only when its step emitted no text delta, and `turn/end` closes the producer with a user-visible notice for non-completed outcomes or a completed Turn with no visible text. Prompt discard, Agent disposal, writer failure, and connection observation cancellation all terminate the producer explicitly.

The gateway derives each Session ID from the Feishu app, conversation scope, and a stable digest of the current DSH workspace. It records that workspace as the new Session's `cwd`, supplies the deployment default provider and model, and installs the configured reasoning effort in the created or resumed Agent scope. The plugin defaults that effort to `off`, so a reasoning-capable model emits answer text that the Feishu card may display without exposing reasoning events. Messages from another workspace therefore cannot resume a Session whose model-facing context names a different working directory.

The Channel message handler starts the Controller task and returns without awaiting model execution. Each active Channel owns an abort controller and the exact set of reply tasks it started. Teardown removes the inbound subscription, aborts output observation, awaits every task to settle, and disconnects last. Observation cancellation does not cancel the DSH Turn, and committed Session events are never rolled back or replayed as a replacement reply.

## Alternatives considered

**Await `agent.whenIdle()` and read the latest answer.** Whole-Agent idle can include several queued follow-ups, steering, or injected work and cannot attribute the selected output to one Feishu message.

**Treat every event from the mapped Session as the active reply.** A Session may already be running when a new Feishu message arrives. Session identity alone cannot distinguish the current Turn from the queued prompt's later Turn.

**Await the reply from the SDK message handler.** This would preserve the SDK's per-chat serialization around the whole model run, but it also keeps the event in the in-flight path and delays deduplication. DSH already serializes ordinary follow-ups into distinct Turns, so the long-lived wait belongs to the plugin-owned background task set.

**Send only the final assembled message.** This is simpler but gives up the MVP's streaming card behavior and provides no visible progress during a long tool-assisted Turn.

**Use only the Feishu conversation as the durable Session identity.** That would reuse one Session across DSH workspaces. The resume API preserves stored Session metadata rather than replacing `cwd`, so a conversation-only identity cannot safely repair or reject a working-directory mismatch before prompt assembly.

**Inherit the deployment reasoning effort without an override.** A reasoning-capable model may complete a Turn with reasoning blocks but no visible text, leaving the external reply empty. The explicit plugin field defaults to `off` and still accepts provider-defined values when an operator chooses the corresponding trade-off.

## Verification

Package tests exercise workspace-isolated Session IDs, default model and `cwd` creation metadata, Agent-scoped reasoning selection, target-Turn correlation, unrelated-event filtering, ordered text deltas, assembled-message fallback, reasoning-only completion notices, observation cancellation, card reply/thread options, immediate message-handler return, and quiescent teardown. The package type check and build compile both Host and browser exports.

## Consequences

Each accepted text message can create its placeholder card before its queued DSH Turn begins, and concurrent Feishu messages may therefore show several waiting cards. Changing the DSH process workspace maps later messages to a different Session; the earlier durable conversation remains stored under its original workspace identity. Disabling or replacing the Channel lets an accepted DSH Turn finish without further Feishu updates; the durable result remains available in DSH but is intentionally not replayed, avoiding duplicate external messages. The `off` default gives up model reasoning for a directly visible answer; operators may configure another provider-defined effort. The first release copies visible text only, leaving reasoning, tools, images, files, reactions, and interactive approval controls for separate capabilities.
