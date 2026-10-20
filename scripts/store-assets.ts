/**
 * Renders the Chrome Web Store images from the real built extension (npm run store:assets):
 *   store/assets/screenshot-1..5.png   1280×800
 *   store/assets/promo-small.png       440×280
 *   store/assets/promo-marquee.png     1400×560
 * Run `npm run build` first. Images are flattened (no alpha), as the store requires.
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, '.output', 'chrome-mv3');
const OUT = join(ROOT, 'store', 'assets');
mkdirSync(OUT, { recursive: true });

const b64 = (file: string) => readFileSync(file).toString('base64');
const FONTS = `
@font-face{font-family:Bricolage;src:url(data:font/woff2;base64,${b64(join(ROOT, 'public/fonts/bricolage.woff2'))}) format('woff2');font-weight:200 800}
@font-face{font-family:Figtree;src:url(data:font/woff2;base64,${b64(join(ROOT, 'public/fonts/figtree.woff2'))}) format('woff2');font-weight:300 900}`;
const ICON = `data:image/svg+xml;base64,${b64(join(ROOT, 'public/icon/hush.svg'))}`;

const BASE = `${FONTS}
*{box-sizing:border-box;margin:0}
body{background:#1b1530;color:#fff1d0;font-family:Figtree,sans-serif;overflow:hidden}
.stage{position:relative;width:100vw;height:100vh;overflow:hidden;
  background:radial-gradient(900px 600px at 78% 40%,#3a2b78 0%,#251d42 45%,#1b1530 100%)}
.wave{position:absolute;left:0;right:0;bottom:0;height:120px;opacity:.5}
h1{font-family:Bricolage,sans-serif;font-weight:700;letter-spacing:-.02em;line-height:1.02}
p{color:#c9b8ff;line-height:1.45}
.shot{border-radius:18px;box-shadow:0 30px 80px #0008,0 0 0 1px #c9b8ff33;display:block}`;

const WAVE = `<svg class="wave" viewBox="0 0 1400 120" preserveAspectRatio="none"><path d="M0 60 Q 50 30 100 60 T 200 60 T 300 60 T 400 60 T 500 60 T 600 60 Q 650 56 700 60 T 800 60 T 900 60 T 1000 60 T 1100 60 T 1200 60 T 1300 60 T 1400 60" fill="none" stroke="#c9b8ff" stroke-width="2"/></svg>`;

async function render(page: Page, html: string, w: number, h: number, file: string) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${BASE}</style>${html}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const png = await page.screenshot({ type: 'png' });
  await sharp(png).resize(w, h).flatten({ background: '#1b1530' }).removeAlpha().png().toFile(join(OUT, file));
  console.log(`  ✓ ${file}`);
}

/** A 1280×800 slide: headline and sentence on the left, a real screenshot on the right. */
const slide = (title: string, text: string, img: string, imgWidth: number) => `
<div class="stage" style="display:grid;grid-template-columns:430px 1fr;align-items:center;gap:40px;padding:0 64px">
  <div>
    <img src="${ICON}" width="64" height="64" style="border-radius:16px;margin-bottom:28px">
    <h1 style="font-size:58px;margin-bottom:20px">${title}</h1>
    <p style="font-size:22px;max-width:380px">${text}</p>
  </div>
  <div style="display:flex;justify-content:center"><img class="shot" src="data:image/png;base64,${img}" style="width:${imgWidth}px"></div>
  ${WAVE}
</div>`;

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'hush-store-'));
  const ctx: BrowserContext = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    await sw.evaluate(async () => {
      for (let i = 0; i < 240; i++) {
        const { lastConfigure } = await chrome.storage.session.get('lastConfigure');
        if (lastConfigure) return;
        await new Promise((r) => setTimeout(r, 250));
      }
    });

    // Real numbers for the statistics: browse a couple of ad-heavy news sites.
    const page = await ctx.newPage();
    for (const site of ['https://www.cnn.com/', 'https://www.theverge.com/']) {
      await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(9000);
    }
    const siteTab = await page.evaluate(() => location.hostname);

    const shoot = async (url: string, w: number, h: number, wait = 1500) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(url);
      await page.waitForTimeout(wait);
      return (await page.screenshot({ type: 'png' })).toString('base64');
    };
    // The popup reports on the active tab; opened as a page it would describe itself, so point
    // its tab lookup at the news site instead.
    const popupPage = await ctx.newPage();
    await popupPage.addInitScript((host) => {
      const q = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = ((info: chrome.tabs.QueryInfo) =>
        info.active ? q({}).then((tabs) => tabs.filter((t) => t.url?.includes(host))) : q(info)) as typeof chrome.tabs.query;
    }, siteTab);
    await popupPage.setViewportSize({ width: 360, height: 600 });
    await popupPage.goto(`chrome-extension://${id}/popup.html`);
    await popupPage.waitForTimeout(2800);
    const popup = (await popupPage.screenshot({ type: 'png' })).toString('base64');
    const overview = await shoot(`chrome-extension://${id}/options.html#overview`, 1280, 820);
    const protection = await shoot(`chrome-extension://${id}/options.html#protection`, 1280, 820);
    const lists = await shoot(`chrome-extension://${id}/options.html#lists`, 1280, 820);
    const filters = await shoot(`chrome-extension://${id}/options.html#filters`, 1280, 820);

    const canvas = await ctx.newPage();
    await canvas.emulateMedia({ reducedMotion: 'reduce' });
    await render(canvas, slide('Ads, popups and trackers. Gone.', 'HUSH blocks them before they load, on every site, with nothing to set up.', popup, 330), 1280, 800, 'screenshot-1.png');
    await render(canvas, slide('See what HUSH stopped', 'Ads, trackers and popups blocked, counted on your device and never sent anywhere.', overview, 740), 1280, 800, 'screenshot-2.png');
    await render(canvas, slide('Pick how strict to be', 'Balanced by default, strict when you want it, and a one-click fix for any site that breaks.', protection, 740), 1280, 800, 'screenshot-3.png');
    await render(canvas, slide('Built on lists you trust', 'EasyList, uBlock filters, AdGuard and regional lists, compiled for Chrome’s fast built-in blocker.', lists, 740), 1280, 800, 'screenshot-4.png');
    await render(canvas, slide('Write your own rules', 'Point at anything on a page to hide it, or use the filter syntax of uBlock Origin and AdGuard.', filters, 740), 1280, 800, 'screenshot-5.png');

    await render(canvas, `
<div class="stage" style="display:flex;align-items:center;gap:22px;padding:0 34px">
  <img src="${ICON}" width="112" height="112" style="border-radius:28px;flex:none">
  <div><h1 style="font-size:60px">HUSH</h1><p style="font-size:19px;margin-top:6px;color:#fff1d0">Ads and popups, silenced.</p></div>
  ${WAVE}
</div>`, 440, 280, 'promo-small.png');

    await render(canvas, `
<div class="stage" style="display:grid;grid-template-columns:1fr 360px;align-items:center;padding:0 90px">
  <div style="display:flex;align-items:center;gap:36px">
    <img src="${ICON}" width="190" height="190" style="border-radius:46px;flex:none">
    <div><h1 style="font-size:104px">HUSH</h1><p style="font-size:28px;margin-top:10px;color:#fff1d0">Ads, popups and trackers, silenced.</p></div>
  </div>
  <img class="shot" src="data:image/png;base64,${popup}" style="width:250px;justify-self:end">
  ${WAVE}
</div>`, 1400, 560, 'promo-marquee.png');
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
