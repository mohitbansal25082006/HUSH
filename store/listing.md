# Chrome Web Store listing — HUSH 1.0.0

Copy each field into the Chrome Web Store Developer Dashboard.

## Package

- **File:** `.output/hush-1.0.0-chrome.zip`. Create it with `npm run release`.
- **Version:** 1.0.0

## Store listing

**Name:** HUSH — Ad & Popup Blocker

**Summary** (taken from the manifest, 132 characters at most):
> Silence the web. Blocks ads, popups, popunders, trackers, YouTube & Twitch ads, cookie banners and anti-adblock walls.

**Category:** Productivity → Tools. Some dashboards list ad blockers under "Privacy & Security" instead.

**Language:** English

**Description:**

```
HUSH blocks ads, popups, trackers and the rest of the noise, so pages load faster and stay out of your way.

WHAT HUSH BLOCKS
• Ads and trackers, using Chrome's own fast blocking engine with rules from EasyList, EasyPrivacy, uBlock Origin filters, AdGuard and regional lists
• Empty ad boxes and sponsored posts left behind on pages
• Popups, popunders, hijacked clicks and invisible click traps
• Video ads on YouTube and Twitch
• Cookie banners: HUSH says no for you on about 30 consent platforms
• "Turn off your ad blocker" walls
• Tracking codes in links (utm, fbclid, gclid and more)
• Malware and phishing sites, with a clear warning page

MADE TO BE EASY
• Works the moment you install it, with nothing to set up
• Choose Balanced, Strict or Ninja protection, or turn single features on and off
• Site broken? Relax or pause HUSH there with one click
• Block anything on a page with the element picker, or remove it once with the zapper
• Write your own filters in uBlock Origin / AdGuard syntax
• Watch blocked requests live in the request log
• Light and dark themes, and Hushy the moon-ghost keeping you company

PRIVATE BY DESIGN
HUSH collects nothing. Your statistics stay in your browser. HUSH has no accounts, analytics or ads, and makes no network requests of its own.

OPEN SOURCE
HUSH is free software under the GPL-3.0 license: https://github.com/mohitbansal25082006/HUSH
```

## Graphics (in `store/assets/`, made with `npm run store:assets`)

| Field | File | Size |
| --- | --- | --- |
| Store icon | `public/icon/128.png` | 128×128 |
| Screenshots | `screenshot-1.png` … `screenshot-5.png` | 1280×800 |
| Small promo tile | `promo-small.png` | 440×280 |
| Marquee promo tile | `promo-marquee.png` | 1400×560 |

## Privacy practices tab

**Single purpose:**
> HUSH blocks ads, popups, trackers and other unwanted page content, so that browsing is faster, cleaner and more private.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| declarativeNetRequest | Blocks ad, tracker and malware requests with Chrome's built-in rule engine. |
| scripting | Injects bundled content scripts that hide ad leftovers and defeat popunders and anti-adblock walls. All code ships inside the package. |
| storage | Saves the user's settings, paused sites, their own filters and on-device statistics. |
| unlimitedStorage | Stores the compiled cosmetic filter database (several MB) locally. |
| tabs | Closes popup and popunder tabs, and shows statistics for the current tab in the popup. |
| webNavigation | Detects tabs opened by popunders, and reapplies site fixes on in-page navigation. |
| webRequest | Counts requests that were blocked, for the badge and the dashboard. Observation only: requests are never read, changed or sent anywhere. |
| alarms | Schedules the optional hotfix check (off by default). |
| contextMenus | Adds "Block element" and "Pause HUSH on this site" to the right-click menu. |
| Host permission `<all_urls>` | Ads and trackers appear on every site, so HUSH must be able to filter and clean any page the user visits. |

**Remote code:**
> No, I am not using remote code. All JavaScript is included in the package. The optional hotfix feature downloads filter text only (signed data, never code). It is off unless the user enters an address.

**Data usage:** tick **none** of the data categories, then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/mohitbansal25082006/HUSH/blob/main/PRIVACY.md

## Distribution

- Visibility: Public
- Regions: All regions
- Pricing: Free
