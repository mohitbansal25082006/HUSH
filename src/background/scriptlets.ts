/**
 * Registers MAIN-world content scripts: compiled scriptlet bundles, the popup guard and the
 * Twitch ad stripper.
 *
 * The bundles carry ~100k host match patterns. Chrome rewrites its whole persisted script store
 * on every change, which made each change take tens of seconds, so bundles are registered for the
 * browser session only (re-registered at startup, ~1s) while the small scripts are persisted.
 * Syncing is diff-based: only scripts whose definition changed are touched. Paused sites are
 * excluded through `excludeMatches` (cheap to update now that bundles are not persisted).
 */
import type { Settings } from '../shared/constants';
import * as library from '../scriptlets/library.js';

interface Registration {
  id: string;
  rid: string;
  file: string;
  matches: string[];
  calls: number;
}

type Script = chrome.scripting.RegisteredContentScript;

const PREFIX = 'hush-';
const SIG_KEY = 'csSignatures';
let registrationsCache: Registration[] | null = null;

async function compiledRegistrations(): Promise<Registration[]> {
  if (!registrationsCache) {
    try {
      registrationsCache = await (await fetch(chrome.runtime.getURL('data/scriptlets.json'))).json();
    } catch {
      registrationsCache = [];
    }
  }
  return registrationsCache!;
}

const isIp = (h: string) => /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':');
const hostPatterns = (hosts: string[]) => hosts.flatMap((h) => (isIp(h) ? [`*://${h}/*`] : [`*://${h}/*`, `*://*.${h}/*`]));

const BASE = {
  runAt: 'document_start' as const,
  world: 'MAIN' as chrome.scripting.ExecutionWorld,
  allFrames: true,
  matchOriginAsFallback: true,
  persistAcrossSessions: true,
};

function signature(s: Script, build: string): string {
  // Bundle match lists come from the build, so the build id stands in for them.
  const matches = s.id === `${PREFIX}guard` || s.id === `${PREFIX}twitch` ? s.matches : build;
  return JSON.stringify([s.js, matches, s.excludeMatches ?? [], s.allFrames]);
}

async function register(list: Script[]): Promise<number> {
  if (!list.length) return 0;
  try {
    await chrome.scripting.registerContentScripts(list);
    return 0;
  } catch (e) {
    console.warn('[HUSH] batch registration failed, registering individually', e);
    let failed = 0;
    for (const s of list) {
      try {
        await chrome.scripting.registerContentScripts([s]);
      } catch (err) {
        failed++;
        console.warn(`[HUSH] could not register ${s.id}`, err);
      }
    }
    return failed;
  }
}

export async function syncContentScripts(
  settings: Settings,
  allowlist: string[],
  noScriptletHosts: string[] = [],
): Promise<{ registered: number; updated: number; removed: number; failed: number }> {
  const scripting = chrome.scripting;
  const build = await fetch(chrome.runtime.getURL('data/build.json'))
    .then((r) => r.json())
    .then((b: { built: string }) => b.built)
    .catch(() => chrome.runtime.getManifest().version);
  const existing = new Map((await scripting.getRegisteredContentScripts()).filter((s) => s.id.startsWith(PREFIX)).map((s) => [s.id, s]));
  const { [SIG_KEY]: sigRaw } = await chrome.storage.local.get(SIG_KEY);
  const sigs = (sigRaw ?? {}) as Record<string, string>;

  const wanted: Script[] = [];
  const paused = hostPatterns(allowlist);
  const noScriptlets = hostPatterns([...allowlist, ...noScriptletHosts]);
  const excl = (list: string[]) => (list.length ? { excludeMatches: list } : {});
  if (settings.enabled) {
    if (settings.popupGuard) {
      const js = ['content-scripts/guard.js'];
      if (!settings.strictPopups) js.unshift('flags/guard-lenient.js');
      if (!settings.blockNotificationPrompts) js.unshift('flags/guard-allow-notifications.js');
      wanted.push({ ...BASE, id: `${PREFIX}guard`, js, matches: ['<all_urls>'], ...excl(paused) });
    }
    if (settings.twitch) {
      wanted.push({ ...BASE, id: `${PREFIX}twitch`, js: ['content-scripts/twitch.js'], matches: ['*://*.twitch.tv/*'], allFrames: false, ...excl(paused) });
    }
    if (settings.scriptlets) {
      for (const r of await compiledRegistrations()) {
        if (settings.rulesets[r.rid]) wanted.push({ ...BASE, id: r.id, js: [r.file], matches: r.matches, persistAcrossSessions: false, ...excl(noScriptlets) });
      }
    }
  }

  const wantedIds = new Set(wanted.map((s) => s.id));
  const toRemove = [...existing.keys()].filter((id) => !wantedIds.has(id));
  const toAdd: Script[] = [];
  const toUpdate: Script[] = [];
  for (const s of wanted) {
    const sig = signature(s, build);
    if (!existing.has(s.id)) toAdd.push(s);
    else if (sigs[s.id] !== sig) toUpdate.push(s);
    sigs[s.id] = sig;
  }
  for (const id of toRemove) delete sigs[id];

  if (toRemove.length) await scripting.unregisterContentScripts({ ids: toRemove });
  let failed = 0;
  if (toUpdate.length) {
    try {
      await scripting.updateContentScripts(toUpdate);
    } catch (e) {
      console.warn('[HUSH] update failed, re-registering', e);
      await scripting.unregisterContentScripts({ ids: toUpdate.map((s) => s.id) }).catch(() => {});
      failed += await register(toUpdate);
    }
  }
  // The guard first, then the (larger) bundles.
  const quick = toAdd.filter((s) => !s.id.match(/^hush-(ads|privacy|malware|annoyances|hosts|mobile|region)/));
  const slow = toAdd.filter((s) => !quick.includes(s));
  failed += await register(quick);
  await chrome.storage.local.set({ [SIG_KEY]: sigs });
  failed += await register(slow);
  return { registered: toAdd.length, updated: toUpdate.length, removed: toRemove.length, failed };
}

/* ------------------------- Runtime scriptlets (user filters / hotfix) ------------------------- */

export interface RuntimeScriptlet {
  fn: string;
  args: string[];
  domains: string[];
  notDomains: string[];
}

const LIB = library as unknown as Record<string, (...args: string[]) => void>;

function hostMatches(host: string, list: string[]): boolean {
  return list.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Inject runtime scriptlets into a freshly committed frame. */
export async function injectRuntimeScriptlets(tabId: number, frameId: number, host: string, list: RuntimeScriptlet[]): Promise<void> {
  for (const s of list) {
    if (s.domains.length && !hostMatches(host, s.domains)) continue;
    if (hostMatches(host, s.notDomains)) continue;
    const func = LIB[s.fn];
    if (typeof func !== 'function') continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        world: 'MAIN' as chrome.scripting.ExecutionWorld,
        injectImmediately: true,
        func,
        args: s.args,
      });
    } catch {
      /* frame went away or is not scriptable */
    }
  }
}
