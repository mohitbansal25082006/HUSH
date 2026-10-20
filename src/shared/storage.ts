import { DEFAULT_SETTINGS, KEYS, type Settings } from './constants';

export async function getSettings(): Promise<Settings> {
  const s = (await chrome.storage.local.get(KEYS.settings))[KEYS.settings] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), rulesets: { ...DEFAULT_SETTINGS.rulesets, ...(s?.rulesets ?? {}) } };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEYS.settings]: next });
  return next;
}

export async function getAllowlist(): Promise<string[]> {
  const { [KEYS.allowlist]: list } = await chrome.storage.local.get(KEYS.allowlist);
  return Array.isArray(list) ? list : [];
}

export async function setAllowlist(list: string[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.allowlist]: [...new Set(list)].sort() });
}

export async function getUserFilters(): Promise<string> {
  const { [KEYS.userFilters]: text } = await chrome.storage.local.get(KEYS.userFilters);
  return typeof text === 'string' ? text : '';
}

export async function setUserFilters(text: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.userFilters]: text });
}

/** Is `host` (or one of its parent domains) on the allowlist? */
export function isAllowlisted(host: string, list: string[]): boolean {
  if (!host) return false;
  for (const entry of list) {
    if (host === entry || host.endsWith(`.${entry}`)) return true;
  }
  return false;
}

export function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : '';
  } catch {
    return '';
  }
}

export const formatCount = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);

export const formatBytes = (b: number): string =>
  b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(0)} KB` : `${b} B`;
