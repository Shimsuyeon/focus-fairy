---
title: Privacy policy
description: What the focus-fairy Slack bot and Chrome extension store and how they use it.
sidebar:
  order: 90
---

focus-fairy handles only the information it needs to record and show your focus time. This policy covers both the **focus-fairy Slack bot** and the **focus-fairy Chrome extension**.

Effective date: October 22, 2026 (updated October 24, 2026: reading Slack status, aggregate statistics for operations)

## Information we collect

### Stored on the focus-fairy server

| Information | Purpose |
|---|---|
| Slack workspace ID · user ID | Tell whose records they are |
| Workspace name · user display name | Show names in the popup and reports (display names are cached for one day) |
| Focus session records (start/end time, focus time, break time, plan, category) | Stats, reports, rankings |
| Current session state | Start, pause and end sessions |
| IDs and names of channels where you used `/start` (last 10) | Choose a channel for messages from the extension |
| Monthly goal | This month's tree and goal hints |
| **Hash** of the extension connection token | Verify extension requests (the token itself is never stored) |
| Workspace settings (auto-record threshold, default time zone, etc.) | Session handling |
| Bot token for the installed workspace | Sending Slack messages, looking up user names |
| User token, if you connect [Slack status sync](/en/settings/sync/) | Update your status (only users who connect it) |
| The status you set yourself before a session, and the last status focus-fairy showed | Keep your own status and restore it after a session (status sync users only; deleted once restored) |

### Stored in your browser by the Chrome extension

The extension stores the following only in `chrome.storage.local` (inside this browser):

- Server address, connection token, and workspace/user names of connected workspaces
- Channel choice per workspace and the last session state (for the toolbar badge)

## Information we don't collect

- Websites you visit, browsing history, or tab contents
- Slack message content (only the plans you enter through focus-fairy commands)
- Location, contacts, or payment information
- No advertising or analytics tools

The extension's content script runs **only on the focus-fairy connection page** (`/extension/connect`) and reads only the one-time connection code on that page.

## How we use it

- Recording focus time and showing stats (`/today`, `/weekly`, `/report`, App Home, extension popup)
- Visible to teammates in the same workspace: focus state, category, focus time, rankings. **Plans are not shown in the extension's team list** (they are included in start/end messages posted to channels)
- Operating and improving the service: the operator looks only at **aggregate statistics**, such as users per workspace, daily and weekly usage trends, and how often each feature is used. Plans and individual records are not viewed.
- We don't sell information or use it for ads, and we don't share it with third parties other than the processors below

## Processors

| Provider | Purpose |
|---|---|
| Cloudflare (Workers, Workers KV) | Running the server, storing data |
| Slack | Sending messages, looking up user names, reading and updating status |

## Retention and deletion

- Focus records are kept for stats unless you ask us to delete them.
- Remove an extension connection from the browser with ⚙︎ → **연결 해제** (Disconnect) in the popup. Reconnecting from Slack or getting a new token immediately invalidates the old one.
- Uninstalling the extension deletes the information stored in your browser.
- To delete your records, open a [GitHub issue](https://github.com/Shimsuyeon/focus-fairy/issues).

## Security

- The server and the extension communicate over HTTPS. The extension installed from the Chrome Web Store can only access the focus-fairy server.
- Connection tokens and one-time connection codes are stored only as SHA-256 hashes, and connection codes expire after 10 minutes.

## Contact

Please reach out through [GitHub issues](https://github.com/Shimsuyeon/focus-fairy/issues). If this policy changes, we'll update this page with a new effective date.
