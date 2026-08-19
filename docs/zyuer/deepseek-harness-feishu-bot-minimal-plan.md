# DeepSeek Harness 飞书 Bot 插件最小方案（含桥接 POC）

## 1. 结论

方案可行。采用 DeepSeek Harness 的外部插件机制接入飞书，不修改 `agent-loop`，也不把飞书逻辑合入 Core。开发阶段可以 Fork 官方仓库并创建 `feat/feishu-bot-plugin` 分支验证；交付形态建议为独立插件包 `@zyuer/dsh-feishu-bot`，通过 DSH Profile 安装。

当前 DeepSeek Harness 仍处于 Developer Preview，首版固定基线为 `dsh-0.1.0-rc.7` 对应提交 `99f6f02`，升级前单独做兼容性验证。

### 1.1 两阶段落地策略

- **P0：Web API 桥接 POC。** 参考现有接入文章，用飞书长连接接收消息，再调用 DeepSeek Harness Web API。目的仅是验证飞书应用权限、事件订阅和消息闭环。
- **P1：正式 Cordis 插件。** 将会话管理、流式输出、审批拦截和生命周期处理放入插件，直接使用 `ctx.agents` 与 `session/event`。

P0 应保持可丢弃：只负责协议转换，不承载长期业务逻辑。验证结束后切到 P1，避免维护“Web API 桥接 + 插件”两套正式实现。

## 2. 目标与边界

首版只验证一条完整链路：用户在飞书私聊 Bot，或在群聊中 @Bot；插件把消息送入 DeepSeek Harness；Agent 的文本结果以流式卡片回复到原消息，并在服务重启后延续会话。

首版包含：

- 飞书 WebSocket 长连接，无需公网回调地址。
- 私聊消息与群聊 @Bot 消息。
- 文本输入和 Markdown 文本输出。
- 持久会话、重复事件去重、同会话串行处理。
- 流式回复。
- `/stop` 终止当前 Agent 执行。
- 默认安全策略：群聊必须 @Bot；高风险工具无人工审批时一律拒绝。

首版不包含：图片、文件、音视频、卡片按钮、工具审批卡片、`ask_user_question`、多租户、主动推送和多实例高可用。这些能力在基本链路稳定后再增加。

## 3. 技术架构

```text
飞书用户
  ↓ 私聊 / 群聊 @Bot
@larksuiteoapi/node-sdk Channel
  ↓ NormalizedMessage
dsh-feishu-bot
  ├─ 消息策略与命令路由
  ├─ 飞书会话 → DSH SessionId
  ├─ Agent 创建 / 恢复 / 取消
  └─ session/event → 飞书流式卡片
  ↓
DeepSeek Harness Agent
```

插件使用飞书官方 `Channel` 封装 WebSocket、事件解析、去重、按 Chat 串行和流式卡片；使用 DSH 的 `ctx.agents` 驱动 Agent，通过 `session/event` 获取输出。模型可见的飞书输入必须以正常 `UserMessage` 进入 Agent 并写入 Session Log，不能通过临时内存旁路注入。

### 3.1 可选的 Web API 桥接 POC

如果希望先用最小成本验证链路，可按参考文章运行独立桥接进程：

```text
飞书长连接 → bridge → POST /api/session.prompt
                    ← WS /api/events.mux
```

典型请求体：

```json
{
  "type": "client-request",
  "rpcId": "<unique-id>",
  "method": "session.prompt",
  "payload": {
    "sessionId": "<mapped-session-id>",
    "mode": "queue",
    "content": [{ "type": "text", "text": "用户消息" }]
  }
}
```

桥接 POC 必须遵守以下约束：

- 先连接 `/api/events.mux`，再提交 prompt，避免漏掉早期事件。
- `events.mux` 会混合多个会话的事件，必须按 `sessionId` 过滤。
- 按下文规则持久化 `chat/thread/sender → sessionId` 映射，不得简单选择任意 `running` 会话。
- 同一会话串行处理；`mode: queue` 只保证入队，不等于完成 prompt 与回复的一一关联。
- 当前网络事件端点按 WebSocket 使用，不依赖 SSE 回退。
- DeepSeek Harness Web 服务只监听本机或可信私网；`--trusted-host` 是 Host 校验，不是身份认证。

该路径适合联调，不作为正式插件架构。

## 4. 核心设计

### 4.1 插件结构

```text
dsh-feishu-bot/
├── src/
│   ├── index.ts             # Cordis 插件入口和生命周期
│   ├── channel.ts           # 飞书 Channel 适配
│   ├── session-router.ts    # 会话隔离与 SessionId 映射
│   └── stream-bridge.ts     # DSH 事件到飞书流式卡片
├── tests/
├── cordis.patch.yml
├── package.json
└── README.md
```

`package.json` 声明 `dsh.bundle.patch`，`cordis.patch.yml` 将插件插入一个独立的 `feishu` Profile。插件依赖 DSH 的 Service Definition 包，不依赖具体的 `agent-loop` 实现。

### 4.2 入站消息

1. `channel.on('message')` 接收归一化消息。
2. 私聊直接受理；群聊仅受理明确 @Bot 的消息。
3. `/stop` 直接调用目标 Agent 的取消接口，不进入模型。
4. 普通消息先解析 SessionId，再创建或恢复 Agent。
5. 插件在订阅该 Session 的事件后调用 `agent.followup()`。
6. 飞书事件处理只做校验和入队，不能等待完整模型执行后才确认事件，避免超过飞书事件应答时限。

### 4.3 会话隔离

默认映射规则：

| 场景 | 会话范围 |
|---|---|
| 私聊 | `tenant + chat_id` |
| 群话题 | `tenant + chat_id + thread_id/root_id` |
| 普通群聊 | `tenant + chat_id + sender_id` |

原始范围字符串经 SHA-256 摘要后生成稳定的 DSH SessionId，避免在本地 Session 目录直接暴露飞书用户和群 ID。相同范围在重启后得到同一 SessionId，并通过现有 Session Persistence 恢复；不同用户、群和话题不能共享历史。

### 4.4 流式输出

插件在投递消息前订阅目标 Session 的 `session/event`：

- 收到 `assistant/chunk` 的 `text-delta` 时，追加到飞书 `channel.stream()`。
- 收到 Agent 回到 `idle` 后结束流式卡片。
- 没有文本输出时显示明确的空结果提示。
- Agent 或网络异常时结束卡片并显示“生成中断”，同时记录结构化错误日志。

每个飞书会话同一时间只运行一个前台请求。后续消息由 Channel 和 Agent Inbox 排队，首版不实现中途 steering。

收到请求后可添加 `THINKING` 表情作为处理中反馈；结束或失败后按返回的 reaction ID 删除。表情能力不可用时直接降级，不影响主流程。

### 4.5 配置与凭据

建议配置项：

```yaml
- id: feishu-bot
  name: '@zyuer/dsh-feishu-bot'
  inject: [agents, sessions, sessionPersistence, approval]
  config:
    appIdEnv: FEISHU_APP_ID
    appSecretEnv: FEISHU_APP_SECRET
    requireMention: true
    dmMode: open
    groupSessionScope: thread-or-sender
```

`FEISHU_APP_SECRET` 和 `DEEPSEEK_API_KEY` 只从 DSH 凭据服务或环境变量读取，不进入 `cordis.patch.yml`、Session Log 或日志。配置缺失时插件启动失败并给出明确错误，不静默跳过。

### 4.6 飞书应用准备

1. 在飞书开放平台创建企业自建应用并启用机器人能力。
2. 按最小权限申请消息接收、读取和发送权限；若启用处理中表情，再申请消息表情相关权限。首版不需要文档、云盘等无关权限。
3. 使用长连接订阅 `im.message.receive_v1`，不需要公网回调地址。
4. 创建版本并发布，确认应用可用范围覆盖测试用户和测试群；企业策略要求时由管理员审批。
5. 统一开发环境使用 DeepSeek Harness 当前要求的 Node.js `^22.19.0` 或 `>=24.0.0`，避免桥接层能运行但 Harness 运行时不兼容。
6. 启动时至少记录“飞书长连接已建立”和“Channel 已连接”两类状态，便于快速区分平台配置与业务处理问题。

## 5. 安全策略

- 群聊默认必须 @Bot，禁止默认监听全部群消息。
- 使用飞书 Channel 的去重、过期消息丢弃和 Bot Loop Guard。
- 不允许把飞书 `chat_id`、`open_id` 当成工具权限依据；权限策略必须单独配置。
- 首版未实现审批卡片，因此审批请求必须 fail closed，不得自动提升为 `danger-full-access`。
- 日志记录事件 ID、SessionId 摘要、耗时和错误码，不记录消息全文、密钥和访问令牌。
- 流式输出失败不应回滚已经提交的 DSH Session 事件；重试发送前先确认飞书消息状态，避免重复回复。
- Web API POC 仅绑定 `127.0.0.1` 或受控私网，不将 `/api/session.prompt`、`/api/events.mux` 直接暴露到公网；`--trusted-host` 不能替代鉴权。

## 6. 实施步骤

1. Fork `deepseek-ai/deepseek-harness`，从固定基线创建 `feat/feishu-bot-plugin`。
2. 创建飞书企业自建应用，完成机器人、权限、事件订阅、版本发布和测试范围配置。
3. 可选：先做可丢弃的 Web API 桥接 POC，验证消息闭环和平台配置。
4. 建立独立插件包和 `feishu` Profile，完成加载与卸载测试。
5. 接入飞书 Channel，打通私聊、群聊 @Bot 和处理中反馈。
6. 实现 SessionId 映射、Agent 创建/恢复、消息幂等和 `/stop`。
7. 实现 `session/event` 到飞书流式卡片的桥接。
8. 补齐会话隔离、断线重连、重启恢复、失败关闭测试和部署文档。
9. 通过本地路径安装插件：`dsh plugin --profile feishu add ./dsh-feishu-bot`。

预计首版为 2～3 个开发日，不含飞书应用创建、企业管理员审批和生产部署。

## 7. 验证与排错

| 现象 | 优先检查 |
|---|---|
| 启动后完全收不到消息 | App ID/Secret、机器人能力、长连接状态、`im.message.receive_v1`、应用是否已发布及测试用户是否在可用范围 |
| 私聊能用，群聊不能用 | 机器人是否已加入群、是否要求 @Bot、群聊权限和可用范围 |
| Harness 已执行但飞书没有回复 | 是否先订阅事件、是否按正确 `sessionId` 过滤、发送消息权限是否生效 |
| 回复串到其他用户或群 | 是否误用了任意 `running` 会话；检查稳定会话映射和持久化键 |
| 同一消息执行两次 | 检查 `messageId` 幂等、飞书事件重试和同会话并发处理 |
| 表情操作报错 | 表情类型是否合法、机器人是否能访问原消息、是否保存并使用正确 reaction ID |
| Token 或鉴权错误 | 检查 App ID/Secret、应用权限与发布状态；让官方 SDK 管理 token 刷新，不自行缓存长期 token |

桥接层和插件层均应输出结构化日志，至少包含 `traceId`、`messageId`、`chatId`、映射后的 `sessionId` 和最终状态，但不得记录完整凭据或不必要的消息正文。

## 8. 验收标准

- 私聊 Bot 可以得到一条流式回复。
- 群聊未 @Bot 时不响应，@Bot 时在原消息下回复。
- 飞书重复投递同一事件时只触发一次 Agent 输入和一次回复。
- 同一私聊连续提问保留上下文；不同用户、群和话题的上下文相互隔离。
- 服务重启后，原飞书会话可以恢复对应 DSH Session。
- `/stop` 能终止正在执行的 Agent，并向用户确认结果。
- 飞书断线后自动重连；短暂断线不会造成重复回复。
- 缺少凭据时启动失败；代码、配置、Session 和日志中均无明文密钥。
- 未配置人工审批时，高风险工具请求被拒绝而不是自动执行。

## 9. 后续迭代

第二阶段增加飞书交互卡片，将 DSH 的 `approval/request` 和 `userQuestions` 映射为“允许一次 / 拒绝”和选项表单；随后再增加图片与文件输入、`/new` 会话管理、多实例共享去重存储和运行指标。

## 参考

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH 扩展插件形态](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md)
- [飞书 Node SDK Channel](https://github.com/larksuite/node-sdk/blob/main/docs/channel.zh.md)
- [DeepSeek Harness 接入飞书指南（参考文章）](https://wepie.feishu.cn/wiki/X6srwnKGmiDE2MkAuZEc5evanEh)
