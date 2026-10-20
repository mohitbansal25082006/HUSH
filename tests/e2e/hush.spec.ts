import { fileURLToPath as __toPath } from 'node:url';
const __dirname = __toPath(new URL('.', import.meta.url));
import type { Server } from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, startSite } from './fixtures';

let server: Server;
let origin: string;
const SHOTS = resolve(__dirname, '../../.output/screenshots');

test.beforeAll(async () => {
  ({ server, origin } = await startSite());
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => server?.close());

test('configures rulesets, cosmetic store and content scripts', async ({ sw }) => {
  const info = await sw.evaluate(async () => {
    const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    const dynamic = await chrome.declarativeNetRequest.getDynamicRules();
    const { lastConfigure } = (await chrome.storage.session.get('lastConfigure')) as { lastConfigure: { staticResult: { ok: boolean }; scriptResult: { failed: number } } };
    const available = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
    return { enabled, scripts: scripts.length, dynamic: dynamic.length, lastConfigure, available };
  });
  console.log('config:', JSON.stringify(info));
  expect(info.enabled).toEqual(expect.arrayContaining(['hush-ads', 'hush-privacy', 'hush-malware', 'hush-annoyances']));
  expect(info.lastConfigure.staticResult.ok).toBe(true);
  expect(info.scripts).toBeGreaterThan(100);
  expect(info.lastConfigure.scriptResult.failed).toBe(0);
  expect(info.dynamic).toBeGreaterThanOrEqual(40); // tracking-parameter rules
});

test('blocks ad and tracker requests but not normal ones', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(() => (window as unknown as { runProbes: () => Promise<void> }).runProbes());
  const results = await page.evaluate(() => (window as unknown as { results: Record<string, string> }).results);
  console.log('network:', results);
  expect(results.pubmatic).toBe('blocked');
  expect(results.analytics).toBe('blocked');
  expect(results.facebook).toBe('blocked');
  expect(results.hotjar).toBe('blocked');
  // Requests that are not ads must still work (needs internet access).
  expect(results.example).toBe('loaded');
});

test('hides ads cosmetically and keeps content visible', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  await page.goto(origin);
  const display = (sel: string) => page.$eval(sel, (el) => getComputedStyle(el).display);
  // Curated generic selectors are injected at document_start…
  expect(await display('#ad-ins')).toBe('none');
  expect(await display('#div-gpt-ad-1234567-0')).toBe('none');
  // …list-wide generic ones arrive once the worker resolves the page's class tokens.
  await expect.poll(() => display('#generic-ad'), { timeout: 5000 }).toBe('none');
  expect(await display('#content')).not.toBe('none');
  expect(await display('.article')).not.toBe('none');
  // Generic scriptlet from HUSH filters: `##+js(set-constant, canRunAds, true)`.
  expect(await page.evaluate(() => (window as unknown as { canRunAds?: boolean }).canRunAds)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/test-page.png` });
});

test('stops popups without a gesture and hijacked clicks', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForTimeout(600);
  const before = context.pages().length;
  await page.click('#click-target');
  await page.waitForTimeout(800);
  const results = await page.evaluate(() => (window as unknown as { results: Record<string, string> }).results);
  console.log('popups:', results);
  expect(results.noGesture).not.toBe('[object Window]');
  expect(results.hijack).not.toBe('[object Window]');
  expect(context.pages().length).toBe(before);
});

test('closes popup tabs that land on popunder networks', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  await page.goto(origin);
  // A real user-initiated link to a listed popunder host opens and must be closed by the guard.
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'https://popads.net/';
    a.target = '_blank';
    a.id = 'pop';
    a.textContent = 'pop';
    document.body.appendChild(a);
  });
  const popupPromise = context.waitForEvent('page');
  await page.click('#pop');
  const popup = await popupPromise;
  await expect.poll(() => popup.isClosed(), { timeout: 8000 }).toBe(true);
});

test('user filters apply (cosmetic + procedural)', async ({ context, sw }) => {
  await sw.evaluate(async () => {
    await chrome.storage.local.set({ userFilters: '127.0.0.1##.my-custom-thing\n127.0.0.1##.post:has-text(Sponsored)\n' });
  });
  await sw.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      const { 'c:rt': rt } = (await chrome.storage.local.get('c:rt')) as { 'c:rt'?: { hosts: Record<string, unknown> } };
      if (rt?.hosts?.['127.0.0.1']) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForTimeout(1200);
  expect(await page.$eval('#custom', (el) => getComputedStyle(el).display)).toBe('none');
  expect(await page.$eval('#sponsored-post', (el) => getComputedStyle(el).display)).toBe('none');
  expect(await page.$eval('#normal-post', (el) => getComputedStyle(el).display)).not.toBe('none');
});

test('strips tracking parameters', async ({ context, sw }) => {
  void sw;
  const page = await context.newPage();
  await page.goto(`${origin}/other.html?utm_source=news&fbclid=abc&id=7`);
  expect(page.url()).toBe(`${origin}/other.html?id=7`);
});

test('malware pages are replaced by the HUSH warning', async ({ context, sw, extensionId }) => {
  const host = await sw.evaluate(async () => {
    const rules = await (await fetch(chrome.runtime.getURL('rulesets/hush-malware.json'))).json();
    return rules[rules.length - 1].condition.requestDomains[5] as string;
  });
  const page = await context.newPage();
  await page.goto(`http://${host}/`).catch(() => {});
  await page.waitForTimeout(800);
  expect(page.url()).toContain(extensionId);
  expect(page.url()).toContain('blocked.html');
  await expect(page.locator('h1')).toContainText('Hushy stopped this page');
  await page.screenshot({ path: `${SHOTS}/blocked.png` });
});

test('pausing a site lets everything through', async ({ context, sw }) => {
  // Same path as the popup's "Pause on this site": it resolves once everything is re-applied.
  await sw.evaluate(async () => {
    const t = Date.now();
    await chrome.storage.local.set({ allowlist: ['127.0.0.1'] });
    for (let i = 0; i < 80; i++) {
      const { lastConfigure } = (await chrome.storage.session.get('lastConfigure')) as { lastConfigure?: { at: number; scriptResult?: { updated: number } } };
      if (lastConfigure && lastConfigure.at > t && (lastConfigure.scriptResult?.updated ?? 0) > 0) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('reconfigure after pausing did not finish');
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForTimeout(800);
  expect(await page.$eval('#ad-ins', (el) => getComputedStyle(el).display)).not.toBe('none');
  // The off switch runs before the scriptlet bundles, so they stay out of paused sites.
  expect(await page.evaluate(() => (window as unknown as { canRunAds?: boolean }).canRunAds)).toBeUndefined();
});

test('UI pages render (screenshots)', async ({ context, extensionId, sw }) => {
  void sw;
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${SHOTS}/popup.png` });

  await page.setViewportSize({ width: 1280, height: 860 });
  for (const hash of ['overview', 'protection', 'lists', 'filters', 'logger', 'help/example.com', 'settings', 'about']) {
    await page.goto(`chrome-extension://${extensionId}/options.html#${hash}`);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${SHOTS}/dashboard-${hash.split('/')[0]}.png` });
  }
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/onboarding-1.png` });
  await page.click('text=Make it quiet');
  await page.waitForTimeout(1900);
  await page.screenshot({ path: `${SHOTS}/onboarding-2.png` });
  await page.click('text=Continue');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/onboarding-3.png` });
  await page.click('text=Finish setup');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/onboarding-4.png` });
  console.log('ui errors:', errors);
  expect(errors.filter((e) => !/favicon|net::ERR/.test(e))).toEqual([]);
});

test('signed hotfixes are applied, tampered ones rejected', async ({ context, sw, extensionId }) => {
  void sw;
  // Sign a hotfix with the local key, exactly like `npm run hotfix:sign`.
  const { webcrypto } = await import('node:crypto');
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  // The private key is never committed, so fresh clones and CI skip this test.
  test.skip(!existsSync(resolve(__dirname, '../../keys/hotfix-private.jwk')), 'no local hotfix signing key (run npm run hotfix:keys)');
  const key = await webcrypto.subtle.importKey('jwk', JSON.parse(readFileSync(resolve(__dirname, '../../keys/hotfix-private.jwk'), 'utf8')), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const filters = '127.0.0.1##.hotfix-target\n';
  const version = Date.now();
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${version}\n${filters}`));
  const good = { version, filters, signature: Buffer.from(sig).toString('base64') };
  const site = resolve(__dirname, 'site');
  writeFileSync(`${site}/hotfix-good.json`, JSON.stringify(good));
  writeFileSync(`${site}/hotfix-bad.json`, JSON.stringify({ ...good, version: version + 1, filters: '127.0.0.1##.article\n' }));

  // Drive it the way the dashboard does: save the address, press "Check now".
  const ui = await context.newPage();
  await ui.goto(`chrome-extension://${extensionId}/options.html#lists`);
  const check = (url: string) =>
    ui.evaluate(async (u) => {
      const { settings } = (await chrome.storage.local.get('settings')) as { settings?: object };
      await chrome.storage.local.set({ settings: { ...(settings ?? {}), hotfixUrl: u } });
      await new Promise((r) => setTimeout(r, 1500));
      return chrome.runtime.sendMessage({ type: 'checkHotfix' });
    }, url);

  const bad = (await check(`${origin}/hotfix-bad.json`)) as { updated: boolean; state: { error?: string } };
  expect(bad.updated).toBe(false);
  expect(bad.state.error).toContain('signature');

  const ok = (await check(`${origin}/hotfix-good.json`)) as { updated: boolean };
  expect(ok.updated).toBe(true);

  const page = await context.newPage();
  await page.goto(origin);
  await expect.poll(() => page.$eval('#hotfix', (el) => getComputedStyle(el).display), { timeout: 5000 }).toBe('none');
  expect(await page.$eval('.article', (el) => getComputedStyle(el).display)).not.toBe('none');
});
