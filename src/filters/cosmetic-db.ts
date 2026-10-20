/**
 * Cosmetic database structures — built at compile time for the bundled lists and at runtime for
 * user filters / hotfixes. Content scripts read these shapes from chrome.storage.local.
 */
import type { CosmeticFilter } from './parser';

export interface HostEntry {
  /** hide selectors */
  h?: string[];
  /** procedural selectors (raw) */
  p?: string[];
  /** style rules: `selector{declarations}` */
  s?: string[];
  /** exception selectors (cosmetic #@#) */
  x?: string[];
  /** FLAG bits (generichide, elemhide, ...) */
  f?: number;
}

export interface RuntimeCosmeticDb {
  hosts: Record<string, HostEntry>;
  generic: string[];
}

const push = (e: HostEntry, k: 'h' | 'p' | 's' | 'x', v: string) => {
  const arr = (e[k] ??= []);
  if (!arr.includes(v)) arr.push(v);
};

/** Token used to index a generic selector: the first `.class` or `#id` in its first compound. */
export function genericToken(selector: string): string | null {
  const m = /^([.#])((?:\\.|[\w-])+)/.exec(selector);
  if (m) return m[1] + m[2].replace(/\\/g, '');
  // tag.class / tag#id — still index by the class / id.
  const m2 = /^[a-z][a-z0-9-]*([.#])((?:\\.|[\w-])+)/i.exec(selector);
  if (m2) return m2[1] + m2[2].replace(/\\/g, '');
  return null;
}

/**
 * Add a parsed (non-scriptlet) cosmetic filter to a host table.
 * Returns `generic` selectors that should go to the generic pool instead.
 */
export function addToHostTable(
  table: Record<string, HostEntry>,
  f: CosmeticFilter,
  onGeneric: (selector: string) => void,
  onGenericException: (selector: string) => void,
): void {
  const value = f.kind === 'style' ? `${f.body}{${f.style}}` : f.body;
  const key: 'h' | 'p' | 's' = f.kind === 'style' ? 's' : f.kind === 'procedural' ? 'p' : 'h';
  if (f.exception) {
    if (f.domains.length === 0) {
      onGenericException(value);
      return;
    }
    for (const d of f.domains) push((table[d] ??= {}), 'x', value);
    return;
  }
  if (f.domains.length === 0) {
    if (f.kind !== 'hide') return; // generic style/procedural filters are not supported
    onGeneric(f.body);
    for (const d of f.notDomains) push((table[d] ??= {}), 'x', value);
    return;
  }
  for (const d of f.domains) push((table[d] ??= {}), key, value);
  for (const d of f.notDomains) push((table[d] ??= {}), 'x', value);
}
