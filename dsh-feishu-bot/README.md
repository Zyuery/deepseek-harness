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
- **App Secret**: stored write-only through the DSH credentials service under `FEISHU_APP_SECRET`; after saving, the field shows only an asterisk placeholder, and the secret does not enter ordinary settings, config dumps, or session logs.
- **Model reasoning effort**: defaults to `off` so the selected model emits Feishu-visible answer text directly. Other non-empty values are interpreted by the active model provider.
- **Require @mention in group chats**: ignores ordinary group messages when enabled. Disabling this filter accepts ordinary group messages only when the app has Feishu permission to read all group messages; it cannot expand which events Feishu delivers.
- **Enable Feishu bot**: unavailable until App ID and App Secret are configured.

The Feishu app must subscribe to `im.message.receive_v1` through a long connection and grant `im:message` for message access plus `cardkit:card:write` for streaming reply cards. Publish a new app version and complete administrator approval after changing permissions.

A custom profile such as `feishu` starts from the base bundle and has no graphical page unless it also includes the Web app bundle. Installing this plugin into the shipped `web` profile is the shortest configuration path.

## Runtime behavior

The Host registers the `feishu-bot` settings namespace while disabled and creates no Feishu connection. Enabling valid settings starts the long connection immediately; disabling them removes the message listener before disconnecting. Updating the referenced App Secret replaces the connection without exposing the secret to the browser.

Inbound messages become model-visible `UserMessage` values through `agent.followup()`. Direct chats share one session per chat, group topics share one session per thread or root message, and unthreaded group messages are isolated per sender. Every mapping is additionally isolated by the current DSH workspace; a new session records that workspace as `cwd`. Created or resumed Agents use the deployment's default provider and model plus the plugin's configured reasoning effort.

Every accepted text message starts a streaming Markdown card that replies to the original Feishu message. The DSH adapter subscribes before calling `agent.followup()`, uses the prompt's stable message ID to identify its claimed Turn, forwards that Turn's `assistant/chunk` text deltas, and falls back to the assembled `assistant/message` when an adapter emits no text chunks. Reasoning and tool events remain in the DSH session and are not copied into the card. A completed Turn with no visible text receives an explicit retry notice instead of an empty card.

The Feishu event handler returns after scheduling the reply, so event acknowledgement does not wait for model execution. Channel teardown stops new messages, ends outstanding output observation, waits for card producers to settle, and then disconnects. Stopping or replacing a Channel does not cancel the DSH Turn; already recorded output is not replayed to Feishu after reconnection, which avoids duplicate replies.

## Development

```sh
pnpm --dir dsh-feishu-bot install --frozen-lockfile
pnpm --dir dsh-feishu-bot run typecheck
pnpm --dir dsh-feishu-bot run test
pnpm --dir dsh-feishu-bot run build
```
