# HUSH privacy policy

_Last updated: October 20, 2026_

HUSH is an ad, popup and tracker blocker. It is built so that what you do online stays on your device.

## What HUSH collects

Nothing. HUSH has no accounts, analytics, telemetry, crash reporting or advertising, and it sells or shares no data.

## What HUSH stores on your device

HUSH keeps the following in your browser's extension storage, where only HUSH can read it:

- your settings, paused sites and your own filters;
- counts of what was blocked (totals, per day and per site), which appear on the dashboard;
- a short-lived request log, kept in memory only while the log page is open.

To delete all of it, use **Settings → Clear statistics**, or remove the extension.

## Network requests

HUSH makes one kind of network request of its own: checking for **hotfixes**, which are signed filter updates. This only happens if you enter a hotfix address in **Filter lists → Hotfix address**. The address is empty by default. A hotfix check downloads a single static file and sends nothing about you or your browsing.

## Why HUSH needs its permissions

| Permission | Why |
| --- | --- |
| Access to all sites | To block ads and trackers, and to hide ad leftovers, on every site you visit. |
| `declarativeNetRequest` | Chrome's built-in engine that blocks requests. It works inside the browser and never shows HUSH your traffic. |
| `scripting` | To run the page fixes that defeat anti-adblock walls and popunders. |
| `webRequest` | To count blocked requests for the badge and the dashboard. HUSH observes only and never reads or changes your traffic. |
| `webNavigation`, `tabs` | To close popup and popunder tabs, and to show statistics for the current tab. |
| `storage`, `unlimitedStorage` | To keep your settings, statistics and the compiled filter data on your device. |
| `alarms` | To schedule the optional hotfix check. |
| `contextMenus` | For the right-click menu: block an element, or pause HUSH on a site. |

## Contact

Questions about privacy: open an issue at https://github.com/mohitbansal25082006/HUSH/issues.
