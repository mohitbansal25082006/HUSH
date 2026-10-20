# Changelog

## 1.0.0 — 2026-10-20

First release.

- **Blocking:** network blocking with about 58,000 native rules, compiled from EasyList, EasyPrivacy, uBlock Origin filters, AdGuard, URLhaus and 7 regional lists.
- **Cosmetic filtering:** host-specific, generic and procedural, applied before the first paint.
- **Scriptlets:** about 50, in uBlock Origin syntax.
- **Stand-ins for blocked ad SDKs:** Google IMA, adsbygoogle, GPT, BlockAdBlock, FingerprintJS and VAST/VMAP, so video players and pages keep working.
- **Popups:** a popup and popunder guard that closes ad tabs and removes hijacked clicks and invisible click traps.
- **YouTube:** ads stripped from the player data, plus a safe skipper for any that slip through, including ads stitched into the stream.
- **Twitch:** ads swapped for an ad-free feed, or muted and covered.
- **Cookie banners:** automatic rejection on about 30 consent platforms.
- **Tracking parameters:** removed from links you open.
- **Malware:** a warning page for malware and phishing sites.
- **Your tools:** element picker, element zapper, your own filters, paused sites, a live request log and a one-click site fixer.
- **Protection levels:** Balanced, Strict and Ninja, plus a toggle for every feature.
- **Hotfixes:** optional and signed (ECDSA P-256), compiled as untrusted data.
- **Design:** the animated "Dusk" interface with Hushy the moon-ghost, light and dark themes and reduced-motion support.
- **Benchmark:** 132 of 132 on adblock.turtlecute.org.
