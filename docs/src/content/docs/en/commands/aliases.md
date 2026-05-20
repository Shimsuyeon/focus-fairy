---
title: Command conflict workaround
description: Use /f* aliases when other Slack apps intercept focus-fairy commands.
sidebar:
  order: 100
---

If another Slack app in your workspace (e.g. Hermes Agent) registers a slash command with the same name (`/resume`, `/start`, etc.), Slack may route the call to that app instead of focus-fairy. Slack does not let users or admins prioritise apps for slash commands, so focus-fairy provides **`/f`-prefixed aliases** as a workaround.

## Aliases

| Original | Alias | Description |
|---|---|---|
| `/start` | `/fstart` | Start a session |
| `/end` | `/fend` | End the session |
| `/pause` | `/fpause` | Pause |
| `/resume` | `/fresume` | Resume |

Aliases behave identically to the originals, including arguments (e.g. `/fstart code review`).

## When to use

- The slash command runs but focus-fairy doesn't respond
- Slack shows the call being handled by a different app
- You want to pre-emptively avoid conflicts on a busy workspace

## Use the control panel too

After running `/start` (or `/fstart`), focus-fairy posts an ephemeral message visible only to you, with **pause / end / stats** buttons. You can drive the session entirely from these buttons without typing any slash command. See [/start control panel](/en/commands/start/) for details.

## For self-hosted operators

If you run your own focus-fairy app, register the four aliases (`/fstart`, `/fend`, `/fpause`, `/fresume`) under **Slash Commands** in your Slack app config. Point each to the same `/slack/commands` endpoint — the backend routes them to the existing handlers automatically. You only need to register once; all installed workspaces pick them up.
