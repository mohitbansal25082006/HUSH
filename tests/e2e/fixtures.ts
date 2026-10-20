import { fileURLToPath as __toPath } from 'node:url';
const __dirname = __toPath(new URL('.', import.meta.url));
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const EXT = resolve(__dirname, '../../.output/chrome-mv3');
const SITE = resolve(__dirname, 'site');

/** Tiny static server for the test pages (http://127.0.0.1:<port>/). */
export function startSite(): Promise<{ server: Server; origin: string }> {
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      const file = join(SITE, path === '/' ? 'index.html' : path);
      try {
        const body = readFileSync(file);
        res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : 'application/javascript' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      ok({ server, origin: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` });
    });
  });
}

export const test = base.extend<{ context: BrowserContext; sw: Worker; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hush-')), {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
      viewport: { width: 1280, height: 860 },
    });
    await use(ctx);
    await ctx.close();
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    // Wait until the first configuration pass finished (cosmetic DB installed, scripts registered).
    await sw.evaluate(async () => {
      for (let i = 0; i < 200; i++) {
        const { lastConfigure } = await chrome.storage.session.get('lastConfigure');
        const { cosInstalled } = (await chrome.storage.local.get('cosInstalled')) as { cosInstalled?: Record<string, string> };
        if (lastConfigure && cosInstalled?.['hush-ads']) return;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('HUSH did not finish configuring');
    });
    await use(sw);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
});

export const expect = test.expect;
