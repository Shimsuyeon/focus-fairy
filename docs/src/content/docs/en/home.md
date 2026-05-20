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
| Today | Today's cumulative focus time + session count |
| This week | Weekly cumulative + your rank in the team |
| All-time | Cumulative focus time since installing the bot |
| Quick actions | Slack status sync, workspace settings, help modal |

If you have no focus history yet, an **onboarding card** is shown instead of the stats — step-by-step guidance on which command to start with.

## Relationship with channel workflow

App Home is for **information and entry points**; slash commands and the [session control panel](/en/commands/start/) in your work channel are for **actions**.

- Start / pause / resume / end → `/start` + ephemeral control panel in your work channel
- View stats · onboarding · settings entry → App Home

Pause/resume/end buttons are intentionally not placed in App Home, since App Home doesn't carry a channel context (it wouldn't know which channel to post the public status message to).

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
