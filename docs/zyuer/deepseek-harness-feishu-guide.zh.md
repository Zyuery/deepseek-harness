# DeepSeek Harness 接入飞书指南

[English](deepseek-harness-feishu-guide.md) | 中文

本文档介绍如何让飞书机器人（自建应用）与本地运行的 DeepSeek Harness 会话打通：你在飞书里发消息，消息进入 Harness 会话由智能体处理，回复以卡片形式发回飞书。整个方案基于飞书「长连接」事件订阅，不需要公网服务器。

> 适用环境：DeepSeek Harness（dsh web）运行在本机，飞书企业自建应用，Linux/macOS/Windows 均可。

![这张图片是通过飞书应用与 DeepSeek Harness 智能体“Year 的分身”聊天的界面。用户向智能体发送“你好”，智能体通过飞书应用回复。](https://feishu.cn/file/D1MfbKEgFom5MLxVRhccCVGHn3c)

## 一、整体架构

- 飞书机器人：企业自建应用，通过长连接（WebSocket）接收用户消息事件
- 桥接程序：把飞书消息转成 Harness 会话的输入，并把智能体的回复发回飞书
- DeepSeek Harness：提供 Web API（`session.prompt`）与事件流（`events.mux`）

数据流：飞书用户 → 机器人长连接 → 桥接程序 → `POST /api/session.prompt` → 智能体处理 → `/api/events.mux` 事件流 → 桥接程序 → 卡片回复到飞书

## 二、前置准备

1. 一台运行 DeepSeek Harness 的机器，并启动 Web 服务：`dsh web --host 127.0.0.1 --port 3081`
2. 飞书管理员账号，可访问飞书开发者后台 `open.feishu.cn/app`
3. Node.js 18+（桥接程序运行环境）

## 三、创建飞书自建应用

### 3.1 创建应用

- 开发者后台 → 创建企业自建应用，记下 App ID 与 App Secret
- 在「凭证与基础信息」中确认应用状态为「启用」

### 3.2 开通权限

- 应用能力 → 权限管理，开通：
- **`im:message` 获取与发送单聊、群组消息**
- `cardkit:card:write` 创建和更新流式回复卡片
- `im:message.reactions:write_only` 发送、删除消息表情回复（可选，用于 🤔 处理中反馈）
- `docx:document` 云文档相关权限（可选，用于机器人创建飞书云文档）
- 如需与外部（跨企业）用户单聊：开启「对外共享能力」，需完成企业认证或个人实名认证

### 3.3 配置事件订阅（长连接）

- 应用功能 → 事件订阅 → 订阅方式选择「使用长连接接收事件」（无需公网回调地址）
- 添加事件：接收消息 `im.message.receive_v1`
- 保存后，长连接模式即生效

### 3.4 发布版本

- 应用发布 → 版本管理与发布 → 创建版本 → 申请线上发布，等待企业管理员审核通过
- 发布后，可用范围（默认全员）内的成员即可与机器人对话

## 四、编写桥接程序

桥接程序负责三件事：接收飞书消息、写入 Harness 会话、把回复发回飞书。核心依赖：`@larksuite/channel`（飞书长连接 SDK）与 `ws`（Harness 事件流）。

### 4.1 接收飞书消息（长连接）

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

### 4.2 写入 Harness 会话

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

### 4.3 监听回复（WebSocket 事件流）

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

### 4.4 以卡片回复

```RPG
POST https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id
{
  "receive_id": "oc_xxx",
  "msg_type": "interactive",
  "content": "{\"config\":{\"wide_screen_mode\":true},\"elements\":[{\"tag\":\"markdown\",\"content\":\"**回复内容**\"}]}"
}
```

收到消息时可用表情回应表示“处理中”：`POST /im/v1/messages/:message_id/reactions`，body `{"reaction_type":{"emoji_type":"THINKING"}}`，处理完成后再删除该表情。

## 五、Harness 侧要点

- 获取会话 ID：`POST /api/session.list`，取 `items` 中 `running` 的会话（或新建会话 `/api/session.create`）
- 信任策略：Harness Web API 默认信任本机回环请求（`127.0.0.1`）；远程访问需在启动时配置 `--trusted-host`
- 会话串行处理：`mode=queue` 时多轮消息排队执行，回复顺序与请求一致
- 事件流协议：SSE/WebSocket 帧为 `{type:'server-request', rpcId, payload}`，`payload` 为 `session/event` 等帧类型

## 六、验证与排错

- 桥接日志出现 `ws client ready` / `channel connected` 说明长连接建立成功
- 发一条消息给机器人：应先出现 🤔，随后收到卡片回复
- `99991672` 且提示缺少 `cardkit:card:write`：开通该权限、发布应用新版本并完成管理员审批
- 群聊中只有 @ 机器人的消息到达：为应用开通读取群内所有消息的权限；关闭本地的 @ 过滤项不能扩大飞书的事件投递范围
- `99991663`：token 无效，重新获取 `tenant_access_token`
- `230002`：机器人不在该会话中（如被移出群）
- `231001`：表情类型无效，参考官方表情文案说明
- 外部用户单聊失败：确认已开启对外共享、对方已确认与机器人单聊

## 七、参考链接

- [机器人支持外部群和外部用户单聊](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/develop-robots/add-bot-to-external-group)
- [消息发送 API](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [表情回复 API](https://open.feishu.cn/document/server-docs/im-v1/message-reaction/create)
- [云文档 docx API](https://open.feishu.cn/document/server-docs/docs/docx-v1/document/create)
