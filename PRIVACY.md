# HUSH privacy policy

_Last updated: November 28, 2026_

HUSH is an ad, popup and tracker blocker. It is built so that what you do online stays on your device.

## What HUSH processes

HUSH uses page content to match filters, hide ads and find consent controls. It uses page and request URLs and request outcomes to apply filters, count blocks and show the request log. This processing happens in your browser. HUSH has no accounts, analytics, telemetry, crash reporting or advertising. HUSH does not sell or share your browsing data.

## What HUSH stores on your device

HUSH keeps the following in your browser's extension storage, where only HUSH can read it:

- your settings, paused sites and your own filters;
- counts of what was blocked, including per-site and daily totals, which appear on the dashboard;
- a bounded log of recent blocked requests and their URLs, kept in memory while the extension's service worker is running.

Use **Settings → Clear statistics** to erase statistics. Removing the extension clears its local storage, including your settings and filters.

## Network requests

When you configure a hotfix address in **Filter lists → Hotfix address**, HUSH can download signed network and element-hiding filters from that server. The address is empty by default. The server receives normal connection metadata such as your IP address. The request omits credentials and referrer information. HUSH sends no browsing history, request logs or statistics to the server.

## Why HUSH needs its permissions

| Permission | Why |
| --- | --- |
| Access to all sites | To block ads and trackers, and to hide ad leftovers, on every site you visit. |
| `declarativeNetRequest` | Chrome's built-in engine that blocks requests. It works inside the browser and never shows HUSH your traffic. |
| `scripting` | To run the page fixes that defeat anti-adblock walls and popunders. |
| `webRequest` | To observe request URLs and outcomes for blocking statistics and the on-device request log. |
| `webNavigation`, `tabs` | To close popup and popunder tabs, and to show statistics for the current tab. |
| `storage`, `unlimitedStorage` | To keep your settings, statistics and the compiled filter data on your device. |
| `alarms` | To schedule the optional hotfix check. |
| `contextMenus` | For the right-click menu: block an element, or pause HUSH on a site. |

## Contact

Questions about privacy: open an issue at https://github.com/mohitbansal25082006/HUSH/issues.

## Chrome Web Store Limited Use

HUSH's use of information from Chrome APIs complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.
