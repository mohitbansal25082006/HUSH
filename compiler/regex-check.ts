/**
 * Asks a real Chromium whether each regexFilter fits DNR's limits (RE2 syntax and the 2 KB
 * compiled-memory budget). Rules that fail are skipped by Chrome at load time with a warning in
 * chrome://extensions, so the compiler drops them up front. Answers are cached by regex text.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type Verdict = Record<string, boolean>;

const key = (regex: string, caseSensitive: boolean) => `${caseSensitive ? 'c' : 'i'}:${regex}`;

export async function checkRegexes(
  items: Array<{ regex: string; caseSensitive: boolean }>,
  cacheFile: string,
): Promise<(regex: string, caseSensitive: boolean) => boolean> {
  const cache: Verdict = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const todo = [...new Map(items.map((i) => [key(i.regex, i.caseSensitive), i])).entries()].filter(([k]) => !(k in cache));

  if (todo.length) {
    const ext = mkdtempSync(join(tmpdir(), 'hush-regex-ext-'));
    writeFileSync(
      join(ext, 'manifest.json'),
      JSON.stringify({ manifest_version: 3, name: 'regex-check', version: '1', permissions: ['declarativeNetRequest'], background: { service_worker: 'sw.js' } }),
    );
    writeFileSync(join(ext, 'sw.js'), '');
    const profile = mkdtempSync(join(tmpdir(), 'hush-regex-profile-'));
    try {
      const ctx = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
      });
      let [sw] = ctx.serviceWorkers();
      if (!sw) sw = await ctx.waitForEvent('serviceworker');
      const results = (await sw.evaluate(async (list: Array<[string, boolean]>) => {
        const out: boolean[] = [];
        for (const [regex, isCaseSensitive] of list) {
          try {
            const r = await chrome.declarativeNetRequest.isRegexSupported({ regex, isCaseSensitive });
            out.push(r.isSupported);
          } catch {
            out.push(false);
          }
        }
        return out;
      }, todo.map(([, i]) => [i.regex, i.caseSensitive] as [string, boolean]))) as boolean[];
      todo.forEach(([k], n) => (cache[k] = results[n]));
      await ctx.close();
    } catch (e) {
      console.warn(`  ! regex check unavailable (${(e as Error).message.split('\n')[0]}); keeping heuristics only`);
      return () => true;
    } finally {
      rmSync(ext, { recursive: true, force: true });
      rmSync(profile, { recursive: true, force: true });
    }
    mkdirSync(join(cacheFile, '..'), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return (regex, caseSensitive) => cache[key(regex, caseSensitive)] !== false;
}
