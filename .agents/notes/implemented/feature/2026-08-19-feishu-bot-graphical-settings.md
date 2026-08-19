# Agent Note: Feishu bot graphical settings

Status: implemented

English | [中文](2026-08-19-feishu-bot-graphical-settings.zh.md)

## Problem

Mounting the Feishu bot used to imply activation and required launch-environment credentials. A Web user could neither discover its configuration nor keep the plugin installed while intentionally disconnected, and putting App Secret into ordinary settings would expose a durable secret on a configuration plane designed for redacted but readable values.

## Decision

`@zyuer/dsh-feishu-bot` registers the live `feishu-bot` settings namespace with `enabled: false`, optional `appId`, credential reference `FEISHU_APP_SECRET`, and `requireMention: true`. Its browser export registers a card under the same namespace key on `settings.plugin.item`, so a Web profile discovers the card from the installed plugin without rebuilding the frontend.

The card writes App Secret only through `credentials.set`, then writes App ID, mention policy, and the enabled flag in one revision-fenced settings mutation. The enable control remains unavailable until an App ID and either an existing or staged App Secret are present. The Host resolves the credential immediately before connection and never returns its value to the browser, config dump, logs, or session events.

The Host owns one serialized Channel replacement lifecycle. Disabled settings register the card but allocate no Lark resource. A valid enable, a live settings update, or an update to the referenced credential replaces the Channel; teardown removes the message listener before disconnecting and awaits the active replacement chain.

## Alternatives considered

**Launch-environment configuration only.** This keeps the first prototype small but leaves no discoverable Web configuration and makes plugin presence indistinguishable from runtime activation.

**Store App Secret as a secret-role settings field.** Redaction would keep it off normal settings responses, but the credentials service already owns source precedence, write-only Web operations, and environment shadowing. Duplicating that responsibility would create two secret stores for one value.

**Connect whenever the plugin is mounted.** This preserves the former lifecycle but prevents users from installing and configuring the card before activation, and missing credentials make the whole plugin unavailable instead of presenting the corrective UI.

## Verification

Package tests cover disabled registration, configuration gating, credential-first saving, connection replacement and teardown, stable Feishu-to-session mapping, and model-visible `UserMessage` delivery. Type checking and the package build also compile the Host entry and the lazy CJS browser factory exported as `./client`.

## Consequences

The package now requires DSH settings, credentials, agent, persistence, and Web client interfaces that match its declared peer versions. The graphical card appears only in a profile that includes the Web app bundle; a base-only custom profile can run the Host plugin but has no page on which to render it. In exchange, installation, configuration, activation, secret storage, and teardown are separate explicit operations.
