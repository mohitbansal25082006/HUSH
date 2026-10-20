import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '../e2e/fixtures';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SHOTS = resolve(__dirname, '../../.output/screenshots');
mkdirSync(SHOTS, { recursive: true });

test('adblock.turtlecute.org benchmark scores high', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  await page.goto('https://adblock.turtlecute.org/', { waitUntil: 'load' });
  // The page probes ~130 ad / tracker / telemetry endpoints and shows a percentage.
  await page.waitForTimeout(25_000);
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const total = Number(/Total\s*:\s*(\d+)/.exec(text)?.[1] ?? 0);
  const blocked = Number(/(\d+)\s+blocked/.exec(text)?.[1] ?? 0);
  const score = total ? Math.round((blocked / total) * 100) : 0;
  console.log(`turtlecute: ${blocked}/${total} blocked`);
  console.log(`turtlecute score: ${score}%`);
  await page.screenshot({ path: `${SHOTS}/live-turtlecute.png` });
  expect(score).toBeGreaterThanOrEqual(97);
});

test('YouTube: player response carries no ads and no ad plays', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  const ttErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && /TrustedScript|TrustedHTML/.test(m.text()) && ttErrors.push(m.text()));
  await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // Google shows headless browsers an "unusual traffic" robot check; that is not HUSH's doing.
  test.skip(page.url().includes('google.com/sorry'), 'YouTube served a robot check to the headless browser');
  await page.waitForSelector('.html5-video-player', { timeout: 30_000 });
  const ads = await page.evaluate(() => {
    const r = (window as unknown as { ytInitialPlayerResponse?: Record<string, unknown> }).ytInitialPlayerResponse;
    return { adPlacements: r?.adPlacements ?? null, playerAds: r?.playerAds ?? null, adSlots: r?.adSlots ?? null };
  });
  console.log('player response ad fields:', JSON.stringify(ads));
  expect(ads.adPlacements).toBeNull();
  expect(ads.playerAds).toBeNull();
  // Watch the player for a while: it must never stay in the ad state.
  let adMs = 0;
  for (let i = 0; i < 20; i++) {
    if (await page.$('.html5-video-player.ad-showing')) adMs += 500;
    await page.waitForTimeout(500);
  }
  console.log(`time spent in ad state: ${adMs} ms`);
  // The video must actually play (a stalled player sits at the same currentTime forever).
  const t0 = await page.evaluate(() => { const v = document.querySelector('video')!; v.muted = true; void v.play().catch(() => {}); return v.currentTime; });
  await page.waitForTimeout(6000);
  const t1 = await page.evaluate(() => document.querySelector('video')!.currentTime);
  console.log(`playback: ${t0.toFixed(1)}s → ${t1.toFixed(1)}s, Trusted Types errors: ${ttErrors.length}`);
  expect(t1 - t0).toBeGreaterThan(3);
  expect(ttErrors).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/live-youtube.png` });
  expect(adMs).toBeLessThan(3000);
  expect(await page.$('ytd-enforcement-message-view-model')).toBeNull();
});

test('Twitch: the player worker is wrapped by the HUSH shield', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  await page.goto('https://www.twitch.tv/', { waitUntil: 'domcontentloaded' });
  const name = await page.evaluate(() => (window.Worker as unknown as { name: string }).name);
  console.log('Worker constructor:', name);
  // The native constructor is named "Worker"; HUSH's wrapper (minified) has another name.
  expect(name).not.toBe('Worker');
});

test('a real news site: ad slots are hidden', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  const blocked: string[] = [];
  page.on('requestfailed', (r) => r.failure()?.errorText.includes('BLOCKED_BY_CLIENT') && blocked.push(new URL(r.url()).hostname));
  await page.goto('https://www.theverge.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const visibleAdFrames = await page.evaluate(
    () => [...document.querySelectorAll('iframe[id^="google_ads_iframe"], ins.adsbygoogle, div[id^="div-gpt-ad"]')].filter((e) => (e as HTMLElement).offsetHeight > 0).length,
  );
  console.log(`blocked requests: ${blocked.length} (${[...new Set(blocked)].slice(0, 8).join(', ')}) visible ad slots: ${visibleAdFrames}`);
  await page.screenshot({ path: `${SHOTS}/live-news.png` });
  expect(blocked.length).toBeGreaterThan(0);
  expect(visibleAdFrames).toBe(0);
});
