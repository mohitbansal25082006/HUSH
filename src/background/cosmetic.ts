/**
 * Installs the compiled cosmetic database into chrome.storage.local so content scripts can read
 * it directly (no service-worker round trip at document_start), and serves generic selectors.
 */
import { HOST_BUCKETS, KEYS, type Settings } from '../shared/constants';
import type { HostEntry } from '../filters/cosmetic-db';

const INSTALLED_KEY = 'cosInstalled';

interface CompiledCosmetic {
  spec: Record<string, Record<string, HostEntry>>;
  complex: string[];
}

async function buildId(): Promise<string> {
  try {
    const meta = await (await fetch(chrome.runtime.getURL('data/build.json'))).json();
    return `${chrome.runtime.getManifest().version}/${meta.built}`;
  } catch {
    return chrome.runtime.getManifest().version;
  }
}

function keysFor(rid: string): string[] {
  const keys = [KEYS.complex(rid)];
  for (let b = 0; b < HOST_BUCKETS; b++) keys.push(KEYS.spec(rid, b));
  return keys;
}

/** Make storage contain exactly the cosmetic data of the enabled rulesets. */
export async function syncCosmeticStore(settings: Settings, rulesetIds: string[]): Promise<void> {
  const build = await buildId();
  const { [INSTALLED_KEY]: installedRaw } = await chrome.storage.local.get(INSTALLED_KEY);
  const installed = (installedRaw ?? {}) as Record<string, string>;

  // Global exceptions are always present.
  if (installed._ !== build) {
    try {
      const exc = await (await fetch(chrome.runtime.getURL('data/cosmetic/_exceptions.json'))).json();
      const items: Record<string, unknown> = {};
      for (let b = 0; b < HOST_BUCKETS; b++) items[KEYS.exceptions(b)] = exc[b] ?? null;
      await chrome.storage.local.set(items);
      installed._ = build;
    } catch (e) {
      console.warn('[HUSH] exceptions install failed', e);
    }
  }

  for (const rid of rulesetIds) {
    const want = settings.rulesets[rid] === true;
    if (want && installed[rid] !== build) {
      try {
        const data: CompiledCosmetic = await (await fetch(chrome.runtime.getURL(`data/cosmetic/${rid}.json`))).json();
        const items: Record<string, unknown> = { [KEYS.complex(rid)]: data.complex };
        for (const [bucket, hosts] of Object.entries(data.spec)) items[KEYS.spec(rid, Number(bucket))] = hosts;
        await chrome.storage.local.remove(keysFor(rid));
        await chrome.storage.local.set(items);
        installed[rid] = build;
      } catch (e) {
        console.warn(`[HUSH] cosmetic install failed for ${rid}`, e);
      }
    } else if (!want && installed[rid]) {
      await chrome.storage.local.remove(keysFor(rid));
      delete installed[rid];
    }
  }
  await chrome.storage.local.set({ [INSTALLED_KEY]: installed });
}

/* ---------------------------------- Generic selectors ---------------------------------- */

const genCache = new Map<string, Promise<Record<string, string[]>>>();

function loadGeneric(rid: string): Promise<Record<string, string[]>> {
  let p = genCache.get(rid);
  if (!p) {
    p = fetch(chrome.runtime.getURL(`data/cosmetic/${rid}.gen.json`))
      .then((r) => r.json())
      .catch(() => ({}));
    genCache.set(rid, p);
  }
  return p;
}

/** Load the generic indexes ahead of the first page asking for them (called on worker start). */
export function warmGeneric(settings: Settings): void {
  for (const rid of Object.keys(settings.rulesets)) if (settings.rulesets[rid]) void loadGeneric(rid);
}

/** Return generic hide selectors matching the given `.class` / `#id` tokens. */
export async function genericSelectorsFor(tokens: string[], settings: Settings): Promise<string[]> {
  const out = new Set<string>();
  const rids = Object.keys(settings.rulesets).filter((r) => settings.rulesets[r]);
  const maps = await Promise.all(rids.map(loadGeneric));
  for (const map of maps) {
    for (const t of tokens) {
      const sels = map[t];
      if (sels) for (const s of sels) out.add(s);
    }
  }
  return [...out];
}
