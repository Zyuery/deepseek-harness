# Feishu bot plugin

English | [中文](README.zh.md)

`@zyuer/dsh-feishu-bot` connects a Feishu custom app to DeepSeek Harness through the official long-connection SDK. The package contributes both the Host plugin and its card on the DSH Web **Plugins > Plugin configuration** page.

## Configure in DSH Web

Install the local package into a Web profile, then start that profile:

```sh
pnpm dsh plugin --profile web add ./dsh-feishu-bot
pnpm dsh --profile web
```

Open the printed Web URL, go to **Settings > Plugins > Plugin configuration > Feishu bot**, and configure these fields:

- **App ID**: the Feishu custom application's App ID.
- **App Secret**: stored write-only through the DSH credentials service under `FEISHU_APP_SECRET`; it does not enter ordinary settings, config dumps, or session logs.
- **Require @mention in group chats**: ignores ordinary group messages when enabled.
- **Enable Feishu bot**: unavailable until App ID and App Secret are configured.

A custom profile such as `feishu` starts from the base bundle and has no graphical page unless it also includes the Web app bundle. Installing this plugin into the shipped `web` profile is the shortest configuration path.

## Runtime behavior

The Host registers the `feishu-bot` settings namespace while disabled and creates no Feishu connection. Enabling valid settings starts the long connection immediately; disabling them removes the message listener before disconnecting. Updating the referenced App Secret replaces the connection without exposing the secret to the browser.

Inbound messages become model-visible `UserMessage` values through `agent.followup()`. Direct chats share one session per chat, group topics share one session per thread or root message, and unthreaded group messages are isolated per sender.

## Development

```sh
pnpm --dir dsh-feishu-bot install --frozen-lockfile
pnpm --dir dsh-feishu-bot run typecheck
pnpm --dir dsh-feishu-bot run test
pnpm --dir dsh-feishu-bot run build
```
