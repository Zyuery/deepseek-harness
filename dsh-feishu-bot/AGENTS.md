# AGENTS.md

本目录承载飞书 Bot 的 Cordis 插件。插件只通过 Harness 的公开 Service Definition 和事件扩展点接入运行时，不修改 `agent-loop`。

## 架构

```text
Lark SDK event
  -> infra/lark
  -> model/InboundMessage
  -> controller
  -> controller/AgentGateway
  -> infra/dsh
  -> ctx.agents + session/event
```

`src/index.ts` 是组合入口，负责 Cordis 依赖声明、配置校验、组件装配和 `ctx.effect()` 生命周期。业务规则和 SDK 调用不得写进入口。

## 职责

- `src/model/` 定义不依赖飞书 SDK 和 Harness 实现的内部消息类型。
- `src/controller/` 处理群聊 @Bot 策略、命令路由、会话范围和消息编排，并拥有所需端口接口。
- `src/infra/lark/` 封装飞书 SDK、长连接、原始事件解析、快速确认、回复和平台错误。
- `src/infra/dsh/` 使用 `ctx.agents`、持久会话和 `session/event` 实现 Controller 声明的端口。

## 依赖方向

允许的依赖方向是 `index -> controller + infra`、`controller -> model`、`infra/lark -> model`、`infra/dsh -> controller ports + model + DSH Service Definition`。`model` 不依赖其他插件层。

`controller` 不得导入飞书 SDK、Cordis Context 或 `infra/`；两个 `infra` 目录不得互相导入。原始飞书类型必须在 `infra/lark` 内转换，模型可见输入必须通过 `UserMessage` 和 `agent.followup()` 进入 Session Log。

## 注释

本插件的代码注释和内部 JSDoc 使用简体中文，类型名、API 名称和事件名保留源码中的英文拼写。注释只说明职责、约束和代码无法直接表达的行为。
