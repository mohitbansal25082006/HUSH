/**
 * Runtime filters = the user's own filters + signed hotfixes. They are compiled in the service
 * worker with the same parser used at build time:
 *   network   → dynamic DNR rules
 *   cosmetic  → `c:rt` database read by content scripts
 *   scriptlet → injected on navigation via chrome.scripting
 *   popup     → merged into the popup guard
 */
import { parseFilter, preprocess, PREPROCESSOR_ENV, type DnrRule, type PopupFilter } from '../filters/parser';
import { REDIRECTS } from '../filters/redirects';
import { addToHostTable, type RuntimeCosmeticDb } from '../filters/cosmetic-db';
import { FLAG, KEYS } from '../shared/constants';
import { SCRIPTLET_ALIASES } from '../scriptlets/library.js';
import type { RuntimeScriptlet } from './scriptlets';

export interface CompiledRuntime {
  network: DnrRule[];
  cosmetic: RuntimeCosmeticDb;
  scriptlets: RuntimeScriptlet[];
  popups: PopupFilter[];
  /** Hosts where all scriptlets are disabled (`site#@#+js()`). */
  noScriptletHosts: string[];
  errors: Array<{ line: number; text: string; reason: string }>;
  counts: { network: number; cosmetic: number; scriptlets: number; popups: number };
}

const ALIASES = SCRIPTLET_ALIASES as Record<string, string>;

export function compileRuntimeFilters(text: string, trusted: boolean): CompiledRuntime {
  const out: CompiledRuntime = {
    network: [],
    cosmetic: { hosts: {}, generic: [] },
    scriptlets: [],
    popups: [],
    noScriptletHosts: [],
    errors: [],
    counts: { network: 0, cosmetic: 0, scriptlets: 0, popups: 0 },
  };
  const lines = preprocess(text, PREPROCESSOR_ENV);
  const exceptions: string[] = [];
  lines.forEach((line, i) => {
    const parsed = parseFilter(line, { trusted, redirects: REDIRECTS });
    if (!parsed) return;
    switch (parsed.type) {
      case 'skip':
        out.errors.push({ line: i + 1, text: line, reason: parsed.reason });
        break;
      case 'network':
        out.network.push(parsed.rule);
        out.counts.network++;
        break;
      case 'popup':
        out.popups.push(parsed.popup);
        out.counts.popups++;
        break;
      case 'hostflag':
        for (const h of parsed.flag.hosts) {
          const e = (out.cosmetic.hosts[h] ??= {});
          e.f = (e.f ?? 0) | FLAG[parsed.flag.flag];
        }
        break;
      case 'cosmetic': {
        const f = parsed.filter;
        if (f.kind === 'scriptlet') {
          if (f.exception) {
            // `site#@#+js()` turns every scriptlet off on that site.
            if (f.body === '*') out.noScriptletHosts.push(...f.domains);
            break;
          }
          const fn = ALIASES[f.body];
          if (!fn) {
            out.errors.push({ line: i + 1, text: line, reason: `unknown scriptlet ${f.body}` });
            break;
          }
          out.scriptlets.push({ fn, args: f.args ?? [], domains: f.domains, notDomains: f.notDomains });
          out.counts.scriptlets++;
        } else {
          addToHostTable(out.cosmetic.hosts, f, (sel) => out.cosmetic.generic.push(sel), (sel) => exceptions.push(sel));
          out.counts.cosmetic++;
        }
        break;
      }
      default:
        break;
    }
  });
  if (exceptions.length) out.cosmetic.generic = out.cosmetic.generic.filter((s) => !exceptions.includes(s));
  return out;
}

export async function storeRuntimeCosmetic(db: RuntimeCosmeticDb): Promise<void> {
  await chrome.storage.local.set({ [KEYS.runtimeCosmetic]: db, rtScriptletsVersion: Date.now() });
}
