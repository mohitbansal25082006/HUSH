/** Fetches, verifies (ECDSA P-256) and stores signed filter hotfixes. */
import { KEYS } from '../shared/constants';
import { HOTFIX_PUBLIC_KEY } from '../shared/hotfix-key';

export interface HotfixState {
  version: number;
  filters: string;
  checked: number;
  error?: string;
}

const MAX_SIZE = 2_000_000;

async function verify(version: number, filters: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('jwk', HOTFIX_PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(`${version}\n${filters}`));
}

export async function getHotfix(): Promise<HotfixState | null> {
  const { [KEYS.hotfix]: h } = await chrome.storage.local.get(KEYS.hotfix);
  return (h as HotfixState | undefined) ?? null;
}

/** Returns true when a newer verified hotfix was stored. */
export async function checkHotfix(url: string): Promise<{ updated: boolean; state: HotfixState | null }> {
  const current = await getHotfix();
  const base: HotfixState = current ?? { version: 0, filters: '', checked: 0 };
  if (!url) {
    const state = { ...base, checked: Date.now(), error: 'no hotfix address set up' };
    await chrome.storage.local.set({ [KEYS.hotfix]: state });
    return { updated: false, state };
  }
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}t=${Math.floor(Date.now() / 600_000)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_SIZE) throw new Error('hotfix too large');
    const data = JSON.parse(text) as { version: number; filters: string; signature: string };
    if (typeof data.version !== 'number' || typeof data.filters !== 'string' || typeof data.signature !== 'string') {
      throw new Error('malformed hotfix');
    }
    if (!(await verify(data.version, data.filters, data.signature))) throw new Error('bad signature');
    if (data.version <= base.version) {
      const state = { ...base, checked: Date.now(), error: undefined };
      await chrome.storage.local.set({ [KEYS.hotfix]: state });
      return { updated: false, state };
    }
    const state: HotfixState = { version: data.version, filters: data.filters, checked: Date.now() };
    await chrome.storage.local.set({ [KEYS.hotfix]: state });
    return { updated: true, state };
  } catch (e) {
    const state = { ...base, checked: Date.now(), error: String((e as Error).message ?? e) };
    await chrome.storage.local.set({ [KEYS.hotfix]: state });
    return { updated: false, state };
  }
}
