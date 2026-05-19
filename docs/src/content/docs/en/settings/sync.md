---
title: Slack Status Sync (/settings sync)
description: Automatically reflect your focus state in your Slack status.
sidebar:
  label: /settings sync
  order: 1
---

Connect Focus Fairy to your Slack status, and your status will update automatically every time you run `/start`, `/pause`, or `/end`.

## Usage

```
/settings sync
```

Click the **Approve** button in the response, pick your workspace, and grant permission. To disconnect, run `/settings sync` again and click the disconnect button.

## Status mapping

| Command | Slack status |
| --- | --- |
| `/start` | 💻 Focusing |
| `/pause` | ☕ Quick break |
| `/resume` | 💻 Focusing |
| `/end` | (cleared) |

:::note
Translation in progress — see the [Korean version](/settings/sync/) for the full background and step-by-step screenshots.
:::
