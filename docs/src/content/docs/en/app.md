---
title: Mobile web app
description: Add focus-fairy to your phone's home screen without an app store, and start or end focus sessions like an app.
sidebar:
  order: 65
---

If opening Slack on your phone and typing `/start` feels like a chore, add the **focus-fairy web app** to your home screen. No app store needed: tap the icon and it opens right away, with the same screen as the [Chrome extension](/en/extension/) to start, pause, and end sessions and see who's focusing today and this month's stats.

Records go to the same place as Slack commands and the extension. You can start in the web app and end in Slack or the extension.

## Connecting

Tap **폰 웹앱 연결** (Connect phone web app) on the focus-fairy **Home tab** in Slack, or type `/settings app` in any channel. The modal shows a **📱 웹앱 열기** (Open web app) button and an 8-character **connection code** like `ABCD-EFGH`. The link and the code are the same thing and can be used **once within 10 minutes**.

### Android

1. In Slack on your phone, tap **📱 웹앱 열기** and open it in **Chrome**. It connects right away.
2. Tap the **홈 화면에 추가** (Add to home screen) button at the top, or Chrome **⋮ → Add to Home screen** (or **Install app**).

### iPhone

On iPhone, home screen apps and Safari use **separate storage**, so you connect inside the home screen app.

1. In Slack on your phone, tap **📱 웹앱 열기** and open it in **Safari**. If it opened inside Slack, choose **Open in Safari** from the menu.
2. Tap Safari's **Share button (⬆︎) → Add to Home Screen**.
3. Open **집중요정** from your home screen and enter the **connection code** from the Slack modal.

:::tip
The page from step 1 also shows the code in large text. To use it in Safari without adding it to your home screen, tap **Safari에서 쓸래요** (Use in Safari) below the code.
:::

### Multiple workspaces

Get a code with `/settings app` in each workspace and enter it under **＋ 워크스페이스 추가** (Add workspace) in the dropdown at the top. Switch workspaces with the same dropdown.

## The screen

Everything in the [Chrome extension popup](/en/extension/) in a single column that fits your phone.

- **Top**: current state and a big clock, categories, plan, channel for messages, teammates focusing today
- The **start / pause / end buttons** stick to the bottom of the screen
- **Below**: this month's tree, monthly goal, daily and cumulative charts, category breakdown

When you reopen the app or come back from another app, changes made in Slack show up right away.

## Keep it on top on your Mac

You can also keep the web app open as a small window on your computer. It stays **on top of other app windows**, so you can see your timer and who's focusing right now while you work.

1. In **Chrome** (or Edge) on your computer, open **📱 웹앱 열기** (Open web app) from `/settings app` to connect.
2. Click the **📌** button at the top right. A small window pops up.
3. Drag it where you want it. It opens in the same place next time.

You can start, pause, and end from the small window, and the team list refreshes every 30 seconds. When someone starts focusing, their row sparkles briefly.

:::note
- The small window closes when you close the original web app window. Install the web app with Chrome **⋮ → Cast, save, and share → Install page as app** and minimize that window.
- Works in Chrome and Edge only. The 📌 button doesn't show in Safari.
- To type in the recorded time yourself when ending, use the original web app window.
:::

## Using it with the extension

The web app and the extension are **connected separately**. Reconnecting the web app keeps the extension connected, and vice versa. You can start a session on your phone and end it on your computer.

## FAQ

**Does it send notifications?**
Not yet. It shows the current state when you open the app.

**It says the token is invalid.**
Connecting the web app for the same workspace on another phone (or browser) disconnects the previous one. Get a new code with `/settings app` and enter it again from ⚙︎.

**How do I disconnect?**
Tap ⚙︎ → **이 워크스페이스 연결 해제** (Disconnect this workspace) to remove it from your phone. Deleting the app from your home screen also works.
