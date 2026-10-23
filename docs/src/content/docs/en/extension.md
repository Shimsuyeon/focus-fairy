---
title: Chrome extension
description: Start and stop focus sessions from a Chrome toolbar popup and see this month's stats, without opening Slack.
sidebar:
  order: 60
---

If typing `/start` and `/end` in Slack every time feels tedious, try the **focus-fairy Chrome extension**. Click the toolbar icon to open a popup where you can start, pause and end sessions, see who's focusing with you today, and check this month's stats on one screen.

Sessions are saved in the same place as the Slack commands. You can start in the extension and `/end` in Slack, or the other way around.

## Install

1. Open [**focus-fairy on the Chrome Web Store**](https://chromewebstore.google.com/detail/hoaigcnbolebecjdidhnhkjdmohhiclp) and click **Add to Chrome**.
2. Pin focus-fairy from the puzzle icon in the toolbar.

When installed from the Chrome Web Store, the extension updates automatically when a new version is released.

:::note
focus-fairy is an **unlisted** item, so it doesn't show up in Chrome Web Store search. Use the link above.
:::

### Install in developer mode (for development)

Use this only when you're changing the extension code and testing it yourself.

1. Download the [GitHub repository](https://github.com/Shimsuyeon/focus-fairy) (**Code → Download ZIP** and unzip, or `git clone`).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder in the repository.
4. Pin focus-fairy from the puzzle icon in the toolbar.

## Connect a workspace

The extension identifies you with a **personal connection token** instead of your Slack account.

1. In the Chrome where the extension is installed, click **크롬 익스텐션 연결** (Connect Chrome extension) in the focus-fairy **Home tab**, or type `/settings extension` in any channel.
2. Click **🧩 익스텐션에 연결하기** (Connect the extension) in the modal.
3. A connection page opens in your browser and the extension **connects automatically**. You're done when you see "✅ 연결됐어요!".

No copy-pasting and no server address needed. The connection link works **once, within 10 minutes**.

### Paste a token manually

If you can't use the link, click **토큰 직접 복사하기** (Copy token manually) in the modal, copy the `ff_...` token, and paste it into **＋ 워크스페이스 추가** (Add workspace) in the extension popup. Leave the server address as the default.

:::tip
Copy the token first, then open the popup. Chrome closes the popup when you click another window such as the Slack app.
:::

:::caution
Treat the token like a password and don't share it. The server stores only its hash.

Reconnecting or getting a new token **immediately invalidates the old one**, so reconnect if you think it leaked.
:::

### Multiple workspaces

If you use focus-fairy in several Slack workspaces, connect each one the same way and they're added to the extension one by one.

- Switch workspaces with the dropdown. A workspace that is focusing shows 🟢, and one on a break shows 🟠.
- Use the ⚙︎ button to change the token or disconnect the current workspace.
- Sessions and channel choices are kept separately per workspace.

## Popup tour

### Left — session controls

| Area | Content |
|---|---|
| State · time | Current session time while focusing, today's total while resting |
| Edit | Change the plan of the running session |
| Categories | 📚 Study · 💻 Side project · 📖 Reading · 🏃 Exercise · ✨ Other. Pick one before starting, or tap one while focusing to change it right away |
| Plan · channel | Write a plan and choose the channel for start/end messages before starting |
| Focusing together today | Teammates who focused today, their current state and today's time (people focusing now come first) |
| Buttons | Start / Take a break / Focus again / End |

:::note
The team list shows **only the category**, never the plans people wrote.
:::

### Right — this month

| Area | Content |
|---|---|
| This month's tree | Your monthly total, with a tree that grows as you get closer to your goal (🌱 sprout → 🌳 tree → 🍎 fruit tree). **Every day you focus adds a fruit**, and your best day is a golden one |
| Fairy's note | How much to focus per day for the rest of the month to reach your goal |
| Today · daily average | Today's focus time and this month's daily average |
| Best day | The day you focused the most this month |
| Fruits | Days you focused this month and your 🔥 streak |
| Chart | **Daily** — bars per day, **Cumulative** — running total this month. Hover for each day's values |
| Categories | Time and share per category this month |

Use ‹ › to look at previous months.

### Set a monthly goal

Click **목표 설정** (Set goal) at the top right and enter your monthly goal in hours (e.g. `80`). The tree then grows toward your goal and the fairy tells you how much you need per day. Without a goal, the tree grows with the number of days you focus. Enter `0` to remove the goal.

## Channel messages

Starting and ending from the extension still posts to Slack as usual. Choose the channel in the popup.

- The list shows **channels where you've used `/start` in that workspace** (the 10 most recent). If it's empty, run `/start` once in the channel you want.
- The default is the channel where you last used `/start`.
- Choose **💤 채널에 안 올리기** (Don't post) to record without a message.

:::tip
This avoids adding the `channels:read` scope to the bot, so existing workspaces can use the extension **without reinstalling**.
:::

## Badge and shortcuts

- The toolbar badge shows your focus time (green = focusing, orange = on a break, `!` = check your token).
- `⌥⇧F` (Windows: `Alt+Shift+F`) — open the popup
- `⌥⇧S` (Windows: `Alt+Shift+S`) — start / take a break / focus again without opening the popup
- Change shortcuts at `chrome://extensions/shortcuts`.

## FAQ

**Does a session started in Slack show up in the extension?**
Yes. The extension syncs whenever you open the popup and every 5 minutes.

**What if I end a session that ran for more than 6 hours?**
Same as [`/end`](/en/commands/end/) in Slack: above the workspace's auto-record threshold (6 hours by default, configurable in `/settings`) you're asked to confirm, and you can enter the actual focus time yourself.

**I was using the developer-mode install.**
The Chrome Web Store version has a different extension ID, so it installs separately. After installing it, **remove** the developer-mode version in `chrome://extensions` and connect once more from Slack. Your records live on the server, so nothing is lost.

**What information is stored?**
See the [privacy policy](/en/privacy/). The extension stores only your connection token and settings in the browser, and never reads the websites you visit or your tabs.

**Does Slack status sync still work?**
Yes. If you connected [`/settings sync`](/en/settings/sync/), starting and ending from the extension updates your status too.

:::note
English documentation is a work in progress. See the [Korean docs](/extension/) for the most complete reference.
:::
