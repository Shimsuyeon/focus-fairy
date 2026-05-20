---
title: App Home tab
description: A personal focus stats dashboard you reach by clicking focus-fairy in the Slack sidebar.
sidebar:
  order: 50
---

The **App Home tab** is the persistent screen you see when you click focus-fairy in your Slack sidebar. It shows your current focus state and stats at a glance, with shortcut buttons for common settings.

## How to open

1. Click **focus-fairy** in the Slack sidebar.
2. Choose the **Home** tab at the top.

The view auto-refreshes every time you open it.

## What you see

| Section | Content |
|---|---|
| Greeting | Your display name |
| Current state | Focusing · Paused · Resting (with elapsed time and plan if a session is in progress) |
| Session controls | Pause/end when focusing, resume/end when paused (hidden when idle) |
| Today | Today's cumulative focus time + session count |
| This week | Weekly cumulative + your rank in the team |
| This month | Monthly cumulative focus time |
| All-time | Cumulative focus time since installing the bot |
| Quick actions | Slack status sync, workspace settings, help modal |

If you have no focus history yet, an **onboarding card** is shown instead of the stats — step-by-step guidance on which command to start with.

## Session controls

When you're focusing or paused, **pause / resume / end** buttons appear below the current state. You can control your session right from the home tab without switching to a channel.

Pressing a button also posts a public message to the channel where the session was started. For older sessions (without a stored channelId), only the KV state and Slack status are updated and the channel message is skipped — sessions started with `/start` going forward work fully.

:::note
**Starting** a session is only available via `/start` in a channel — there's no start button on App Home, since the channel context is needed at start time.
:::

## Relationship with channel workflow

App Home and the [session control panel](/en/commands/start/) in your work channel are **complementary ways to control the same session**.

- **Work channel** — `/start` to begin + ephemeral panel for immediate control. No need to leave the channel.
- **App Home** — sidebar click for stats + pause/resume/end. Useful when you've navigated away from the channel.

:::tip
Stats on the home tab are always your own. For team-wide ranking use [`/weekly`](/en/commands/weekly/) and for today's team status use [`/today`](/en/commands/today/).
:::

## Refresh

- **Automatic**: every time you open the home tab (Slack's `app_home_opened` event).
- **No manual refresh**: if the stats look stale, close and reopen the tab, or switch to another tab and back.

## For self-hosted operators

To enable App Home on your own installation:

1. In your Slack app config, open **App Home** → enable the "Home Tab" toggle.
2. In **Event Subscriptions**:
   - Toggle "Enable Events" ON.
   - Request URL: `https://<your-worker>/slack/events`
   - Under "Subscribe to bot events", add `app_home_opened`.
3. Save and **reinstall** the app in each workspace so the new permissions and event subscriptions take effect.

No additional OAuth scopes are required — the existing `chat:write` and `users:read` are enough to publish the view.
