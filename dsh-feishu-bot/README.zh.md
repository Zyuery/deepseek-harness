# 飞书机器人插件

[English](README.md) | 中文

`@zyuer/dsh-feishu-bot` 通过飞书官方长连接 SDK 将飞书自建应用接入 DeepSeek Harness。该包同时提供 Host 插件和 DSH Web **插件 > 插件配置**页中的设置卡片。

## 在 DSH Web 中配置

将本地包安装到 Web profile，然后启动该 profile：

```sh
pnpm dsh plugin --profile web add ./dsh-feishu-bot
pnpm dsh --profile web
```

打开终端打印的 Web URL，进入 **设置 > 插件 > 插件配置 > 飞书机器人**，配置以下字段：

- **App ID**：飞书自建应用的 App ID。
- **App Secret**：通过 DSH 凭据服务以只写方式存入 `FEISHU_APP_SECRET`；保存后只显示星号占位，不会进入普通设置、配置输出或会话日志。
- **模型推理强度**：默认为 `off`，让选中的模型直接生成飞书可见的回答正文。其他非空值由当前模型提供方解释。
- **群聊中必须 @ 机器人**：开启时忽略群里未 @ 机器人的普通消息。关闭该过滤项后，应用仍须具备读取群内所有消息的飞书权限才能收到普通群消息；该设置不能扩大飞书实际投递的事件范围。
- **启用飞书机器人**：App ID 和 App Secret 配齐之前不可用。

飞书应用必须通过长连接订阅 `im.message.receive_v1`，开通用于收发消息的 `im:message` 和用于流式回复卡片的 `cardkit:card:write`。权限变更后需要发布新版本，并完成管理员审批。

`feishu` 这类自定义 profile 默认只从 base 组合包开始，如果没有同时包含 Web app 组合包，就不会有图形化页面。将本插件安装到内置 `web` profile 是最短的配置路径。

## 运行时行为

Host 会在默认关闭的状态下注册 `feishu-bot` 设置命名空间，且不创建飞书连接。启用有效配置会立即启动长连接；关闭时会先移除消息监听，再断开连接。更新引用的 App Secret 会替换连接，不会向浏览器暴露密钥。

入站消息通过 `agent.followup()` 变成模型可见的 `UserMessage`。单聊按 chat 共用会话，群话题按 thread 或根消息共用会话，无话题的群消息按发送者隔离。每种映射还会按当前 DSH 工作目录隔离；新 Session 会把该目录记录为 `cwd`。新建或恢复的 Agent 使用部署默认提供方和模型，以及插件配置的推理强度。

每条受理的文本消息都会创建一张回复原飞书消息的 Markdown 流式卡片。DSH 适配器在调用 `agent.followup()` 前订阅事件，用提示消息的稳定 ID 确认它被哪个 Turn 认领，只转发该 Turn 的 `assistant/chunk` 文本增量；适配器没有产生文本 chunk 时，则使用组装完成的 `assistant/message`。推理和工具事件保留在 DSH Session 中，不复制到卡片。已完成的 Turn 没有用户可见文本时，卡片会显示明确的重试提示，不会保留为空。

飞书事件处理器在安排回复任务后立即返回，因此事件确认不会等待模型执行。Channel 拆卸会依次停止接收新消息、结束未完成的输出观察、等待卡片生产器收尾，再断开连接。停止或替换 Channel 不会取消 DSH Turn；重连后不会把已经记录的输出重新发送到飞书，从而避免重复回复。

## 开发

```sh
pnpm --dir dsh-feishu-bot install --frozen-lockfile
pnpm --dir dsh-feishu-bot run typecheck
pnpm --dir dsh-feishu-bot run test
pnpm --dir dsh-feishu-bot run build
```
