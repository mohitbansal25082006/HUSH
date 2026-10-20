/**
 * Renders the animated README artwork into docs/readme/ (npm run readme:assets):
 *   hero.svg       animated banner: Hushy silencing ads that fly in, calming waveform
 *   stats.svg      animated numbers
 *   features.svg   nine feature cards, each with its own looping animation
 *   divider.svg    flowing wave used between sections
 *   demo.webp      a real recording of the extension (needs `npm run build` first)
 *   ../social-preview.png  the repository's social preview card
 * SVGs embed their fonts and use CSS animation only, which GitHub keeps when it shows them.
 */
import { chromium, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'readme');
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------------------------------- */
/* Design tokens ("Dusk")                                                                    */
/* ---------------------------------------------------------------------------------------- */
const C = { ink: '#1b1530', ink2: '#140f26', surface: '#251d42', surface2: '#2e2552', lilac: '#c9b8ff', lilacDeep: '#8b6cff', moon: '#fff1d0', coral: '#ff7a9c', mint: '#7ef0c8', amber: '#ffc56b' };
const b64 = (f: string) => readFileSync(join(ROOT, f)).toString('base64');
const FONTS = `@font-face{font-family:'B';src:url(data:font/woff2;base64,${b64('public/fonts/bricolage.woff2')}) format('woff2');font-weight:200 800}
@font-face{font-family:'F';src:url(data:font/woff2;base64,${b64('public/fonts/figtree.woff2')}) format('woff2');font-weight:300 900}`;
const REDUCED = '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';

/** Deterministic pseudo-random numbers, so regenerated files only change when the design does. */
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const svg = (w: number, h: number, label: string, style: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}">
<title>${label}</title>
<style>${style}
${REDUCED}</style>
${body}
</svg>
`;

/** Hushy: the moon-ghost, with an "shh" finger (128×128 units). */
const hushy = (cls = '') => `<g class="${cls}">
  <defs>
    <linearGradient id="hb" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#fff0cc"/><stop offset="1" stop-color="#ffd98f"/></linearGradient>
    <radialGradient id="hg" cx="50%" cy="46%" r="50%"><stop offset="0" stop-color="#ffe9b4" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9b4" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="64" cy="62" r="62" fill="url(#hg)" class="glow"/>
  <path d="M24 70 C24 40 42 20 64 20 C86 20 104 40 104 70 L104 98 Q98 110 90 100 Q82 110 74 100 Q64 112 54 100 Q46 110 38 100 Q30 110 24 98 Z" fill="url(#hb)"/>
  <ellipse cx="42" cy="78" rx="6" ry="3.6" fill="#ff9db5" opacity=".6"/><ellipse cx="86" cy="78" rx="6" ry="3.6" fill="#ff9db5" opacity=".6"/>
  <g class="eyes"><ellipse cx="50" cy="64" rx="6" ry="7.5" fill="#2a2050"/><ellipse cx="78" cy="64" rx="6" ry="7.5" fill="#2a2050"/>
  <circle cx="52.5" cy="61" r="2.3" fill="#fff"/><circle cx="80.5" cy="61" r="2.3" fill="#fff"/></g>
  <rect x="60.5" y="72" width="7" height="26" rx="3.5" fill="#fff6dd" stroke="#e8c27a" stroke-width="1.5"/>
</g>`;

/** A jagged "noise" path across the full width, centred on y. */
function noisePath(w: number, y: number, amp: number, step: number) {
  let d = `M0 ${y}`;
  for (let x = step; x <= w; x += step) d += ` L${x} ${(y + (rnd() * 2 - 1) * amp * (0.35 + 0.65 * Math.sin((x / w) * Math.PI))).toFixed(1)}`;
  return d;
}
/** A smooth sine path. */
function sinePath(w: number, y: number, amp: number, period: number) {
  let d = `M0 ${y}`;
  for (let x = 0; x <= w; x += period / 2) d += ` Q${x + period / 4} ${y + (((x / (period / 2)) % 2 === 0) ? -amp : amp)} ${x + period / 2} ${y}`;
  return d;
}

/* ---------------------------------------------------------------------------------------- */
/* hero.svg                                                                                  */
/* ---------------------------------------------------------------------------------------- */
function hero() {
  const W = 1200, H = 560;
  seed = 11;
  const stars = Array.from({ length: 46 }, (_, i) => {
    const x = rnd() * W, y = rnd() * 330, r = 0.6 + rnd() * 1.6;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${C.moon}" class="star" style="animation-delay:${(-rnd() * 4).toFixed(2)}s;animation-duration:${(2.5 + rnd() * 3).toFixed(1)}s"/>`;
  }).join('\n');

  // Ads fly in from both sides and get silenced next to Hushy.
  const chips = [
    { t: 'AD', c: C.coral, from: [-140, 120], to: [470, 150] },
    { t: 'POPUP', c: C.amber, from: [1260, 90], to: [740, 140] },
    { t: 'TRACKER', c: C.lilacDeep, from: [-160, 300], to: [450, 250] },
    { t: 'COOKIES?', c: C.mint, from: [1280, 280], to: [760, 240] },
    { t: 'SPONSORED', c: C.coral, from: [1270, 190], to: [770, 190] },
    { t: 'AUTOPLAY', c: C.amber, from: [-170, 210], to: [440, 200] },
  ];
  const DUR = 7.2;
  let keyframes = '';
  const chipEls = chips.map((ch, i) => {
    const w = 22 + ch.t.length * 10.5;
    const delay = (i * DUR) / chips.length;
    const [fx, fy] = ch.from, [tx, ty] = ch.to;
    keyframes += `
@keyframes chip${i}{0%{transform:translate(${fx}px,${fy}px) scale(1);opacity:0}
8%{opacity:1}
58%{transform:translate(${tx}px,${ty}px) scale(1);opacity:1}
66%{transform:translate(${tx}px,${ty}px) scale(.15);opacity:0}
100%{transform:translate(${tx}px,${ty}px) scale(.15);opacity:0}}
@keyframes poof${i}{0%,60%{transform:translate(${tx}px,${ty}px) scale(.2);opacity:0}
64%{opacity:1}
78%{transform:translate(${tx}px,${ty}px) scale(1.6);opacity:0}
100%{opacity:0}}`;
    const sparks = Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      return `<circle cx="${(Math.cos(a) * 22).toFixed(1)}" cy="${(Math.sin(a) * 22).toFixed(1)}" r="2.6" fill="${k % 2 ? C.moon : ch.c}"/>`;
    }).join('');
    return `<g style="animation:chip${i} ${DUR}s ${-DUR + delay}s cubic-bezier(.45,.05,.3,1) infinite" class="chip">
  <rect x="${-w / 2}" y="-17" width="${w}" height="34" rx="17" fill="${C.surface2}" stroke="${ch.c}" stroke-width="2"/>
  <text x="0" y="6" text-anchor="middle" font-family="F" font-weight="800" font-size="15" letter-spacing="1.2" fill="${ch.c}">${ch.t}</text>
</g>
<g style="animation:poof${i} ${DUR}s ${-DUR + delay}s linear infinite">${sparks}</g>`;
  }).join('\n');

  seed = 3;
  const noisy = noisePath(W, 0, 34, 12);
  const style = `${FONTS}
.star{animation:twinkle 4s ease-in-out infinite}
@keyframes twinkle{0%,100%{opacity:.15}50%{opacity:.95}}
.hushy{animation:float 4.8s ease-in-out infinite}
@keyframes float{0%,100%{transform:translate(472px,48px) scale(2) rotate(-2deg)}50%{transform:translate(472px,30px) scale(2) rotate(2deg)}}
.hushy .eyes{transform-box:fill-box;transform-origin:center;animation:blink 5.5s infinite}
@keyframes blink{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
.hushy .glow{transform-box:fill-box;transform-origin:center;animation:glow 4.8s ease-in-out infinite}
@keyframes glow{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
.noise{transform-box:fill-box;transform-origin:center;animation:hush 7.2s cubic-bezier(.6,0,.2,1) infinite}
@keyframes hush{0%,8%{transform:translateY(500px) scaleY(1);stroke:${C.coral}}48%,80%{transform:translateY(500px) scaleY(.04);stroke:${C.lilac}}100%{transform:translateY(500px) scaleY(1);stroke:${C.coral}}}
.title{animation:rise 1.2s cubic-bezier(.2,.8,.2,1) both}
.tag{animation:rise 1.2s .25s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.moon{animation:moon 9s ease-in-out infinite}
@keyframes moon{0%,100%{opacity:.85}50%{opacity:1}}
${keyframes}`;
  const body = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c2160"/><stop offset=".55" stop-color="${C.ink}"/><stop offset="1" stop-color="${C.ink2}"/></linearGradient>
  <radialGradient id="halo" cx="50%" cy="34%" r="45%"><stop offset="0" stop-color="${C.lilacDeep}" stop-opacity=".35"/><stop offset="1" stop-color="${C.lilacDeep}" stop-opacity="0"/></radialGradient>
  <radialGradient id="moonG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.moon}" stop-opacity=".9"/><stop offset=".55" stop-color="${C.moon}" stop-opacity=".25"/><stop offset="1" stop-color="${C.moon}" stop-opacity="0"/></radialGradient>
  <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".15" stop-color="#fff"/><stop offset=".85" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="edge"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
  <clipPath id="card"><rect width="${W}" height="${H}" rx="28"/></clipPath>
</defs>
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>
  <circle class="moon" cx="1060" cy="92" r="120" fill="url(#moonG)"/>
  <circle cx="1060" cy="92" r="34" fill="${C.moon}" opacity=".9"/>
  ${stars}
  ${chipEls}
  <g class="hushy">${hushy()}</g>
  <text class="title" x="600" y="410" text-anchor="middle" font-family="B" font-weight="800" font-size="118" letter-spacing="-3" fill="${C.moon}">HUSH</text>
  <text class="tag" x="600" y="456" text-anchor="middle" font-family="F" font-weight="500" font-size="25" fill="${C.lilac}">Ads, popups and trackers, silenced.</text>
  <g mask="url(#edge)">
    <path d="${sinePath(W, 506, 3, 80)}" fill="none" stroke="${C.lilac}" stroke-opacity=".35" stroke-width="1.5"/>
    <path class="noise" d="${noisy}" fill="none" stroke="${C.coral}" stroke-width="2.4" stroke-linejoin="round"/>
  </g>
</g>`;
  writeFileSync(join(OUT, 'hero.svg'), svg(W, H, 'HUSH: ads, popups and trackers, silenced', style, body));
}

/* ---------------------------------------------------------------------------------------- */
/* stats.svg                                                                                 */
/* ---------------------------------------------------------------------------------------- */
function stats() {
  const W = 1200, H = 200, cw = 282, gap = 24;
  const cards = [
    { big: '132/132', small: 'checks blocked on', small2: 'adblock.turtlecute.org', kind: 'ring', color: C.mint },
    { big: '58k', small: 'native blocking rules', small2: 'enabled by default', kind: 'bars', color: C.lilacDeep },
    { big: '0.8s', small: 'to pause or fix', small2: 'any site', kind: 'clock', color: C.amber },
    { big: '0 bytes', small: 'of your data', small2: 'ever collected', kind: 'lock', color: C.coral },
  ];
  const art = (k: string, color: string) => {
    if (k === 'ring') return `<circle r="30" fill="none" stroke="${color}" stroke-opacity=".18" stroke-width="7"/><circle r="30" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="188.5" class="ring" transform="rotate(-90)"/>`;
    if (k === 'bars') return [0, 1, 2, 3, 4].map((i) => `<rect x="${-30 + i * 13}" y="-30" width="9" height="60" rx="3" fill="${color}" class="bar" style="animation-delay:${i * 0.12}s"/>`).join('');
    if (k === 'clock') return `<circle r="30" fill="none" stroke="${color}" stroke-width="5"/><line x1="0" y1="0" x2="0" y2="-20" stroke="${color}" stroke-width="5" stroke-linecap="round" class="hand"/><circle r="4" fill="${color}"/>`;
    return `<g class="lock"><rect x="-22" y="-6" width="44" height="34" rx="8" fill="${color}"/><path d="M-13 -6 V-16 a13 13 0 0 1 26 0 V-6" fill="none" stroke="${color}" stroke-width="6" class="shackle"/><circle cy="10" r="5" fill="${C.ink}"/></g>`;
  };
  const style = `${FONTS}
.card{animation:in .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.ring{stroke-dashoffset:188.5;animation:ring 5s cubic-bezier(.6,0,.2,1) infinite}
@keyframes ring{0%{stroke-dashoffset:188.5}45%,85%{stroke-dashoffset:0}100%{stroke-dashoffset:188.5}}
.bar{transform-box:fill-box;transform-origin:bottom;animation:bar 2.4s ease-in-out infinite}
@keyframes bar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
.hand{transform-origin:0 0;animation:spin 1.6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.shackle{animation:shackle 3s ease-in-out infinite}
@keyframes shackle{0%,60%,100%{transform:translateY(0)}70%{transform:translateY(-6px)}80%{transform:translateY(0)}}`;
  const body = cards.map((c, i) => {
    const x = (W - (cw * 4 + gap * 3)) / 2 + i * (cw + gap);
    return `<g class="card" style="animation-delay:${i * 0.15}s"><g transform="translate(${x} 14)">
  <rect width="${cw}" height="172" rx="22" fill="${C.surface}" stroke="${C.lilac}" stroke-opacity=".18"/>
  <g transform="translate(52 62)">${art(c.kind, c.color)}</g>
  <text x="102" y="74" font-family="B" font-weight="800" font-size="${c.big.length > 5 ? 34 : 40}" letter-spacing="-1" fill="${C.moon}">${c.big}</text>
  <text x="24" y="128" font-family="F" font-weight="600" font-size="16" fill="${C.lilac}">${c.small}</text>
  <text x="24" y="150" font-family="F" font-weight="500" font-size="16" fill="${C.lilac}" fill-opacity=".7">${c.small2}</text>
</g></g>`;
  }).join('\n');
  writeFileSync(join(OUT, 'stats.svg'), svg(W, H, '132 of 132 benchmark checks blocked, 58 thousand native rules, 0.8 seconds to pause a site, 0 bytes of data collected', style, body));
}

/* ---------------------------------------------------------------------------------------- */
/* features.svg                                                                              */
/* ---------------------------------------------------------------------------------------- */
function features() {
  const W = 1200, cw = 376, ch = 196, gap = 24, cols = 3;
  const items: Array<{ title: string; l1: string; l2: string; icon: string; color: string }> = [
    {
      title: 'Ads and trackers', l1: 'Chrome’s native engine with 58k rules', l2: 'from EasyList, uBlock and AdGuard.', color: C.mint,
      icon: `<circle cx="32" cy="32" r="24" fill="none" stroke="${C.mint}" stroke-width="2" class="pulse"/>
<path d="M32 8 L52 16 V32 C52 45 43 53 32 57 C21 53 12 45 12 32 V16 Z" fill="${C.mint}" fill-opacity=".18" stroke="${C.mint}" stroke-width="3" stroke-linejoin="round"/>
<path d="M22 32 L29 39 L43 25" fill="none" stroke="${C.mint}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="tick"/>`,
    },
    {
      title: 'Popups and popunders', l1: 'Ad tabs close as they open. Hijacked', l2: 'clicks and invisible traps are removed.', color: C.amber,
      icon: `<g class="popwin"><rect x="8" y="12" width="48" height="40" rx="7" fill="${C.surface2}" stroke="${C.amber}" stroke-width="3"/>
<rect x="8" y="12" width="48" height="10" rx="5" fill="${C.amber}"/>
<path d="M24 30 L40 46 M40 30 L24 46" stroke="${C.coral}" stroke-width="4" stroke-linecap="round" class="xmark"/></g>`,
    },
    {
      title: 'YouTube and Twitch', l1: 'Ads stripped from the player data;', l2: 'anything left is muted and skipped.', color: C.coral,
      icon: `<rect x="6" y="12" width="52" height="34" rx="10" fill="${C.coral}"/>
<path d="M27 21 L41 29 L27 37 Z" fill="${C.ink}"/>
<rect x="6" y="52" width="52" height="5" rx="2.5" fill="${C.coral}" fill-opacity=".25"/>
<rect x="6" y="52" width="52" height="5" rx="2.5" fill="${C.coral}" class="progress"/>`,
    },
    {
      title: 'Cookie banners', l1: 'Rejected for you on about 30 consent', l2: 'platforms; the rest is quietly hidden.', color: C.amber,
      icon: `<g class="cookie"><circle cx="32" cy="32" r="22" fill="#d9a066"/>
<circle cx="24" cy="24" r="3.2" fill="#6b4226"/><circle cx="38" cy="22" r="2.6" fill="#6b4226"/><circle cx="40" cy="38" r="3.4" fill="#6b4226"/><circle cx="25" cy="40" r="2.6" fill="#6b4226"/></g>
<circle cx="32" cy="32" r="27" fill="none" stroke="${C.coral}" stroke-width="4"/>
<line x1="13" y1="51" x2="51" y2="13" stroke="${C.coral}" stroke-width="4" stroke-linecap="round" stroke-dasharray="54" class="slash"/>`,
    },
    {
      title: 'Anti-adblock walls', l1: 'Scriptlets and stand-in ad SDKs keep', l2: 'sites working, with no nag screens.', color: C.lilac,
      icon: [
        [6, 10, 16], [24, 10, 16], [42, 10, 16],
        [6, 25, 7], [15, 25, 16], [33, 25, 16], [51, 25, 7],
        [6, 40, 16], [24, 40, 16], [42, 40, 16],
      ].map(([x, y, w], k) => `<rect x="${x}" y="${y}" width="${w}" height="12" rx="2.5" fill="${C.lilac}" class="brick" style="animation-delay:${k * 0.07}s"/>`).join(''),
    },
    {
      title: 'Clean links', l1: 'utm, fbclid, gclid and friends are', l2: 'stripped before the page loads.', color: C.mint,
      icon: `<text x="2" y="28" font-family="F" font-weight="800" font-size="15" fill="${C.moon}">site.com</text>
<text x="2" y="48" font-family="F" font-weight="700" font-size="14" fill="${C.coral}" class="param">?utm=…</text>
<path d="M4 56 H60" stroke="${C.mint}" stroke-width="3" stroke-linecap="round"/>`,
    },
    {
      title: 'Malware shield', l1: 'Known malware and phishing pages are', l2: 'replaced with a clear warning.', color: C.coral,
      icon: `<path d="M32 6 L60 54 H4 Z" fill="${C.coral}" fill-opacity=".2" stroke="${C.coral}" stroke-width="3.5" stroke-linejoin="round" class="warn"/>
<rect x="29.5" y="22" width="5" height="18" rx="2.5" fill="${C.coral}"/><circle cx="32" cy="47" r="3" fill="${C.coral}"/>`,
    },
    {
      title: 'Picker and zapper', l1: 'Point at anything to hide it for good,', l2: 'or zap it just once.', color: C.lilacDeep,
      icon: `<rect x="8" y="10" width="40" height="28" rx="5" fill="${C.lilacDeep}" fill-opacity=".35" stroke="${C.lilac}" stroke-width="2.5" stroke-dasharray="5 4" class="target"/>
<g class="cursor"><path d="M40 30 L40 58 L47 51 L52 61 L57 59 L52 49 L61 49 Z" fill="${C.moon}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/></g>`,
    },
    {
      title: 'Private by design', l1: 'No accounts, no analytics. Your stats', l2: 'never leave your browser.', color: C.lilac,
      icon: `<path d="M6 32 C14 18 24 12 32 12 C40 12 50 18 58 32 C50 46 40 52 32 52 C24 52 14 46 6 32 Z" fill="none" stroke="${C.lilac}" stroke-width="3.5" stroke-linejoin="round"/>
<circle cx="32" cy="32" r="8" fill="${C.lilac}" class="pupil"/>
<line x1="10" y1="54" x2="54" y2="10" stroke="${C.coral}" stroke-width="4" stroke-linecap="round" stroke-dasharray="63" class="unsee"/>`,
    },
  ];
  const rows = Math.ceil(items.length / cols);
  const H = rows * ch + (rows - 1) * gap + 8;
  const style = `${FONTS}
.card{animation:in .8s cubic-bezier(.2,.8,.2,1) both}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
*{transform-box:fill-box}
.pulse{transform-origin:center;animation:pulse 2.4s ease-out infinite}
@keyframes pulse{0%{transform:scale(.8);opacity:.9}100%{transform:scale(1.35);opacity:0}}
.tick{stroke-dasharray:30;animation:tick 2.4s ease-in-out infinite}
@keyframes tick{0%,15%{stroke-dashoffset:30}45%,100%{stroke-dashoffset:0}}
.popwin{transform-origin:center;animation:popwin 2.8s cubic-bezier(.3,1.4,.5,1) infinite}
@keyframes popwin{0%{transform:scale(0);opacity:0}18%{transform:scale(1);opacity:1}62%{transform:scale(1);opacity:1}80%,100%{transform:scale(0);opacity:0}}
.xmark{stroke-dasharray:23;animation:xmark 2.8s ease-in-out infinite}
@keyframes xmark{0%,30%{stroke-dashoffset:23}50%,100%{stroke-dashoffset:0}}
.progress{transform-origin:left;animation:progress 3s cubic-bezier(.7,0,.3,1) infinite}
@keyframes progress{0%{transform:scaleX(.05)}12%{transform:scaleX(.12)}22%{transform:scaleX(1)}100%{transform:scaleX(1)}}
.cookie{transform-origin:center;animation:wobble 3s ease-in-out infinite}
@keyframes wobble{0%,100%{transform:rotate(0)}50%{transform:rotate(18deg)}}
.slash{animation:slash 3s ease-in-out infinite}
@keyframes slash{0%,20%{stroke-dashoffset:54}45%,100%{stroke-dashoffset:0}}
.brick{animation:brick 3.2s ease-in infinite}
@keyframes brick{0%,30%{transform:none;opacity:1}55%{transform:translateY(26px) rotate(14deg);opacity:0}85%{transform:translateY(-6px);opacity:0}100%{transform:none;opacity:1}}
.param{animation:param 3s ease-in-out infinite}
@keyframes param{0%,30%{transform:none;opacity:1}60%,85%{transform:translateX(26px);opacity:0}100%{transform:none;opacity:1}}
.warn{transform-origin:center;animation:warn 1.8s ease-in-out infinite}
@keyframes warn{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
.target{animation:target 3s ease-in-out infinite}
@keyframes target{0%,45%{opacity:1}60%,85%{opacity:0}100%{opacity:1}}
.cursor{animation:cursor 3s ease-in-out infinite}
@keyframes cursor{0%{transform:translate(14px,6px)}35%,60%{transform:translate(-10px,-14px)}100%{transform:translate(14px,6px)}}
.unsee{animation:unsee 4s ease-in-out infinite}
@keyframes unsee{0%,45%{stroke-dashoffset:63}65%,92%{stroke-dashoffset:0}100%{stroke-dashoffset:63}}
.pupil{animation:look 4s ease-in-out infinite}
@keyframes look{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}50%{transform:translateX(6px)}}`;
  const body = items.map((it, i) => {
    const x = (W - (cols * cw + (cols - 1) * gap)) / 2 + (i % cols) * (cw + gap), y = Math.floor(i / cols) * (ch + gap) + 4;
    return `<g class="card" style="animation-delay:${i * 0.08}s"><g transform="translate(${x} ${y})">
  <rect width="${cw}" height="${ch}" rx="22" fill="${C.surface}" stroke="${C.lilac}" stroke-opacity=".16"/>
  <rect x="24" y="24" width="76" height="76" rx="20" fill="${it.color}" fill-opacity=".1"/>
  <g transform="translate(30 30)">${it.icon}</g>
  <text x="24" y="138" font-family="B" font-weight="700" font-size="24" letter-spacing="-.4" fill="${C.moon}">${it.title}</text>
  <text x="24" y="164" font-family="F" font-weight="500" font-size="15.5" fill="${C.lilac}">${it.l1}</text>
  <text x="24" y="184" font-family="F" font-weight="500" font-size="15.5" fill="${C.lilac}">${it.l2}</text>
</g></g>`;
  }).join('\n');
  writeFileSync(join(OUT, 'features.svg'), svg(W, H, 'Blocks ads and trackers, popups, YouTube and Twitch ads, cookie banners, anti-adblock walls, tracking parameters and malware; includes an element picker; private by design', style, body));
}

/* ---------------------------------------------------------------------------------------- */
/* divider.svg                                                                               */
/* ---------------------------------------------------------------------------------------- */
function divider() {
  const W = 1200, H = 40;
  const style = `.flow{stroke-dasharray:14 10;animation:flow 2.4s linear infinite}
@keyframes flow{to{stroke-dashoffset:-48}}
.slow{animation:drift 6s ease-in-out infinite}
@keyframes drift{0%,100%{transform:translateX(0)}50%{transform:translateX(-40px)}}`;
  const body = `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${C.coral}" stop-opacity="0"/><stop offset=".25" stop-color="${C.coral}"/><stop offset=".6" stop-color="${C.lilacDeep}"/><stop offset=".85" stop-color="${C.mint}"/><stop offset="1" stop-color="${C.mint}" stop-opacity="0"/></linearGradient></defs>
<path class="slow" d="${sinePath(W + 80, 20, 7, 120)}" fill="none" stroke="url(#g)" stroke-opacity=".35" stroke-width="2"/>
<path class="flow" d="${sinePath(W, 20, 10, 160)}" fill="none" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>`;
  writeFileSync(join(OUT, 'divider.svg'), svg(W, H, '', style, body));
}

/* ---------------------------------------------------------------------------------------- */
/* demo.webp — a real recording                                                              */
/* ---------------------------------------------------------------------------------------- */
async function demo() {
  const EXT = join(ROOT, '.output', 'chrome-mv3');
  const profile = mkdtempSync(join(tmpdir(), 'hush-demo-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const FW = 960, FH = 600;
  const frames: Buffer[] = [];
  const delays: number[] = [];
  const bg = { r: 27, g: 21, b: 48 };

  /** Capture the page for `ms`, optionally placing a smaller page in the middle of a Dusk frame. */
  const record = async (page: Page, ms: number, framed = false) => {
    const end = Date.now() + ms;
    let last = Date.now();
    while (Date.now() < end) {
      const shot = await page.screenshot({ type: 'jpeg', quality: 85 });
      const img = framed
        ? await sharp({ create: { width: FW, height: FH, channels: 3, background: bg } })
            .composite([{ input: await sharp(shot).resize({ height: FH - 60 }).toBuffer(), gravity: 'center' }])
            .png().toBuffer()
        : await sharp(shot).resize(FW, FH).png().toBuffer();
      frames.push(img);
      const now = Date.now();
      delays.push(Math.max(40, now - last));
      last = now;
    }
  };

  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    await sw.evaluate(async () => {
      for (let i = 0; i < 240; i++) {
        if ((await chrome.storage.session.get('lastConfigure')).lastConfigure) return;
        await new Promise((r) => setTimeout(r, 250));
      }
    });
    for (const p of ctx.pages()) if (p.url().includes('onboarding')) await p.close();

    const browse = await ctx.newPage();
    for (const site of ['https://www.cnn.com/', 'https://www.theverge.com/']) {
      await browse.goto(site, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      await browse.waitForTimeout(8000);
    }
    const host = await browse.evaluate(() => location.hostname);

    // 1. Onboarding: "Make it quiet" calms the noise.
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/onboarding.html`);
    await record(page, 2200);
    await page.click('text=Make it quiet');
    await record(page, 2600);

    // 2. The popup on a real news site.
    const popup = await ctx.newPage();
    await popup.addInitScript((h) => {
      const q = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = ((info: chrome.tabs.QueryInfo) =>
        info.active ? q({}).then((tabs) => tabs.filter((t) => t.url?.includes(h))) : q(info)) as typeof chrome.tabs.query;
    }, host);
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await record(popup, 3200, true);

    // 3. The dashboard counting up.
    await page.goto(`chrome-extension://${id}/options.html#overview`);
    await record(page, 3000);
    await page.goto(`chrome-extension://${id}/options.html#protection`);
    await page.waitForTimeout(500);
    await record(page, 900);
    await page.click('text=Strict');
    await record(page, 1500);
    await page.click('text=Balanced');
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }

  await sharp(frames, { join: { animated: true } })
    .webp({ quality: 62, effort: 6, delay: delays, loop: 0 })
    .toFile(join(OUT, 'demo.webp'));
}

/** docs/social-preview.png (1280×640): upload it in GitHub → Settings → Social preview. */
async function socialPreview() {
  const b = await chromium.launch({ channel: 'chromium' });
  const page = await b.newPage({ viewport: { width: 1280, height: 640 } });
  const src = `data:image/svg+xml;base64,${readFileSync(join(OUT, 'hero.svg')).toString('base64')}`;
  await page.setContent(`<body style="margin:0;background:${C.ink2};display:grid;place-items:center;height:100vh"><img src="${src}" style="width:1200px"></body>`);
  await page.waitForTimeout(3300);
  await page.screenshot({ path: join(ROOT, 'docs', 'social-preview.png') });
  await b.close();
}

hero();
stats();
features();
divider();
console.log('  ✓ hero.svg, stats.svg, features.svg, divider.svg');
await socialPreview();
console.log('  ✓ social-preview.png');
if (!process.argv.includes('--no-demo')) {
  await demo();
  console.log('  ✓ demo.webp');
}
