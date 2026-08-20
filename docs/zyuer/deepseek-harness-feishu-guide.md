# DeepSeek Harness Feishu Integration Guide

English | [中文](deepseek-harness-feishu-guide.zh.md)

This guide explains how to connect a Feishu bot (a custom app) to a locally running DeepSeek Harness session. Messages sent in Feishu enter a Harness session for the agent to process, and responses return to Feishu as cards. The integration uses Feishu long-connection event subscriptions and does not require a public server.

> Environment: DeepSeek Harness (`dsh web`) running locally, a custom Feishu app, and Linux, macOS, or Windows.

![A conversation with the “Year's Digital Twin” DeepSeek Harness agent through a Feishu app. The user sends “Hello,” and the agent replies through the Feishu app.](https://feishu.cn/file/D1MfbKEgFom5MLxVRhccCVGHn3c)

## 1. Architecture

- Feishu bot: a custom app that receives user message events through a long-lived WebSocket connection
- Bridge: converts Feishu messages into Harness session input and sends agent responses back to Feishu
- DeepSeek Harness: provides the Web API (`session.prompt`) and event stream (`events.mux`)

Data flow: Feishu user → bot long connection → bridge → `POST /api/session.prompt` → agent processing → `/api/events.mux` event stream → bridge → card response in Feishu

## 2. Prerequisites

1. A machine running DeepSeek Harness with the web service started as `dsh web --host 127.0.0.1 --port 3081`
2. A Feishu administrator account with access to the developer console at `open.feishu.cn/app`
3. Node.js 18+ for running the bridge

## 3. Create a Custom Feishu App

### 3.1 Create the App

- In the developer console, create a custom enterprise app and record its App ID and App Secret
- Under Credentials & Basic Info, confirm that the app is enabled

### 3.2 Grant Permissions

- Under App Capabilities → Permission Management, grant:
- **`im:message` for reading and sending direct and group messages**
- `cardkit:card:write` for creating and updating streaming reply cards
- `im:message.reactions:write_only` for adding and removing message reactions (optional, used for the 🤔 processing indicator)
- `docx:document` for cloud document access (optional, used when the bot creates Feishu documents)
- To support direct messages with external users in other organizations, enable external sharing; this requires enterprise or individual identity verification

### 3.3 Configure Event Subscriptions (Long Connection)

- Under App Features → Event Subscriptions, select “Receive events through a long connection”; no public callback URL is required
- Add the Receive Message event, `im.message.receive_v1`
- Save the configuration to activate long-connection mode

### 3.4 Publish a Version

- Under App Release → Version Management & Release, create a version and request online publication, then wait for enterprise administrator approval
- After publication, members within the app's availability scope, which includes all members by default, can talk to the bot

## 4. Write the Bridge

The bridge receives Feishu messages, writes them to a Harness session, and sends responses back to Feishu. Its main dependencies are `@larksuite/channel`, the Feishu long-connection SDK, and `ws`, which connects to the Harness event stream.

### 4.1 Receive Feishu Messages (Long Connection)

```RPG
import { createLarkChannel } from '@larksuite/channel';
const channel = createLarkChannel({
  appId: 'cli_xxx',
  appSecret: 'secret',
  transport: 'websocket', // 长连接
});
channel.on({ message: async (msg) => {
  // msg.content 为文本；msg.chatId 为会话；msg.messageId 为消息 id
  await handle(msg);
}});
await channel.connect();
```

### 4.2 Write to a Harness Session

```RPG
POST http://127.0.0.1:3081/api/session.prompt
Content-Type: application/json

{
  "type": "client-request",
  "rpcId": "fb-<uuid>",
  "method": "session.prompt",
  "payload": {
    "sessionId": "session-xxxx",   // 通过 /api/session.list 获取
    "mode": "queue",               // 排队串行处理
    "content": [{ "type": "text", "text": "[飞书消息] 你好" }]
  }
}
```

### 4.3 Listen for Responses (WebSocket Event Stream)

```RPG
const ws = new WebSocket('ws://127.0.0.1:3081/api/events.mux');
ws.on('message', (data) => {
  const { payload } = JSON.parse(data.toString());
  if (payload?.type !== 'session/event') return;
  if (payload.event.type === 'assistant/message') {
    // 收集 data.message.content 中 type==='text' 的块
  }
  if (payload.event.type === 'turn/end') {
    // 一轮结束：把收集到的文本作为回复发送
  }
});
```

### 4.4 Reply with a Card

```RPG
POST https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id
{
  "receive_id": "oc_xxx",
  "msg_type": "interactive",
  "content": "{\"config\":{\"wide_screen_mode\":true},\"elements\":[{\"tag\":\"markdown\",\"content\":\"**回复内容**\"}]}"
}
```

When a message arrives, the bridge can add a reaction to indicate that processing is in progress: `POST /im/v1/messages/:message_id/reactions` with body `{"reaction_type":{"emoji_type":"THINKING"}}`. Remove the reaction after processing finishes.

## 5. Harness Considerations

- Obtain a session ID with `POST /api/session.list` by selecting a `running` session from `items`, or create one through `/api/session.create`
- Trust policy: the Harness Web API trusts local loopback requests (`127.0.0.1`) by default; remote access requires the `--trusted-host` startup option
- Sequential session processing: with `mode=queue`, messages from multiple turns are processed in queue order, and responses preserve request order
- Event stream protocol: SSE/WebSocket frames use `{type:'server-request', rpcId, payload}`, where `payload` contains frame types such as `session/event`

## 6. Verification and Troubleshooting

- Bridge logs containing `ws client ready` and `channel connected` indicate that the long connection is established
- Send a message to the bot: a 🤔 reaction should appear first, followed by a card response
- `99991672` with required scope `cardkit:card:write`: grant the permission, publish a new app version, and complete administrator approval
- Only @mentioned group messages arrive: grant the app permission to read all group messages; disabling a local mention filter does not expand Feishu event delivery
- `99991663`: the token is invalid; obtain a new `tenant_access_token`
- `230002`: the bot is not in the conversation, for example because it was removed from a group
- `231001`: the reaction type is invalid; consult the official reaction documentation
- Direct messages from external users fail: confirm that external sharing is enabled and that the user has confirmed the direct conversation with the bot

## 7. References

- [Support bots in external groups and direct messages with external users](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/develop-robots/add-bot-to-external-group)
- [Send Message API](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [Message Reaction API](https://open.feishu.cn/document/server-docs/im-v1/message-reaction/create)
- [Cloud Document docx API](https://open.feishu.cn/document/server-docs/docs/docx-v1/document/create)
