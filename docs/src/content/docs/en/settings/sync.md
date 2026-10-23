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

Your status changes the same way whether you use commands, the Chrome extension, App Home, or the control panel buttons. Status text is shown in Korean.

| Command | Slack status | Cleared |
| --- | --- | --- |
| `/start` · `/resume` | 💻 집중 중 (Focusing) | When the state changes |
| `/pause` | ☕ 잠깐 자리비움 (Quick break) | When the state changes |
| `/end` | 💤 오늘 2시간 40분 집중 (Focused 2h 40m today) | **6 AM** the next morning (KST) |

After `/end`, your status shows 💤 with the day's focus time instead of being cleared. It clears itself the next morning, so **💤 means "done for today"** and **an empty status means "not started yet today"**.

Sessions are recorded on the day they **started**. If you start at 11 PM and end at 1 AM, the session counts toward the previous day and the status says 어제 (yesterday). It still clears at 6 AM.

## Your own status is kept

focus-fairy **doesn't overwrite a status you set yourself**, such as "📅 In a meeting" or "🏠 Working from home".

- If you had your own status when a session started, it's saved and **restored** when the session ends (unless it has already expired, in which case 💤 is shown).
- If you change your status during a session, it's **left as is** when you pause or end.

To do this, focus-fairy reads your current status before changing it (`users.profile:read`).

:::caution[Connected before this feature? Re-approve once]
Connections made before this feature can't read your status, so they keep overwriting it. Run `/settings sync` and click **🔄 권한 다시 허용하기** (Re-approve) to keep your own status. Without re-approving, the 💤 status and the 6 AM reset still work.
:::

:::note
Translation in progress — see the [Korean version](/settings/sync/) for the full background and step-by-step screenshots.
:::
