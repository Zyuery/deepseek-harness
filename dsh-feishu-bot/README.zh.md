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
- **App Secret**：通过 DSH 凭据服务以只写方式存入 `FEISHU_APP_SECRET`；不会进入普通设置、配置输出或会话日志。
- **群聊中必须 @ 机器人**：开启时忽略群里未 @ 机器人的普通消息。
- **启用飞书机器人**：App ID 和 App Secret 配齐之前不可用。

`feishu` 这类自定义 profile 默认只从 base 组合包开始，如果没有同时包含 Web app 组合包，就不会有图形化页面。将本插件安装到内置 `web` profile 是最短的配置路径。

## 运行时行为

Host 会在默认关闭的状态下注册 `feishu-bot` 设置命名空间，且不创建飞书连接。启用有效配置会立即启动长连接；关闭时会先移除消息监听，再断开连接。更新引用的 App Secret 会替换连接，不会向浏览器暴露密钥。

入站消息通过 `agent.followup()` 变成模型可见的 `UserMessage`。单聊按 chat 共用会话，群话题按 thread 或根消息共用会话，无话题的群消息按发送者隔离。

## 开发

```sh
pnpm --dir dsh-feishu-bot install --frozen-lockfile
pnpm --dir dsh-feishu-bot run typecheck
pnpm --dir dsh-feishu-bot run test
pnpm --dir dsh-feishu-bot run build
```
