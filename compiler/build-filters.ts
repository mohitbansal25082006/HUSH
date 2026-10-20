/**
 * HUSH filter compiler.
 *
 *   npm run filters            download upstream lists (cached in .cache/lists) and compile
 *   npm run filters:offline    compile from the cache only
 *
 * Outputs (all under public/):
 *   rulesets/<id>.json            static declarativeNetRequest rulesets
 *   rulesets/index.json           ruleset index used by wxt.config.ts to build the manifest
 *   data/cosmetic/<id>.json       host-specific (sharded) + complex generic cosmetics per ruleset
 *   data/cosmetic/<id>.gen.json   generic cosmetics indexed by class / id token
 *   data/cosmetic/_exceptions.json  global cosmetic exceptions & host flags
 *   data/scriptlets.json          scriptlet registrations
 *   scriptlets/<id>/<fn>.js       MAIN-world scriptlet bundles
 *   data/popup.json               popup / popunder filters for the popup guard
 *   data/build.json               build metadata
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, type ListSource } from './sources';
import { RULESETS, DEFAULT_SETTINGS, HOST_BUCKETS, FLAG } from '../src/shared/constants';
import { bucketOf } from '../src/shared/hash';
import {
  parseFilter, preprocess, PREPROCESSOR_ENV, PRIORITY,
  type DnrRule, type PopupFilter, type CosmeticFilter,
} from '../src/filters/parser';
import { REDIRECTS } from '../src/filters/redirects';
import { addToHostTable, genericToken, type HostEntry } from '../src/filters/cosmetic-db';
import * as library from '../src/scriptlets/library.js';
import { checkRegexes } from './regex-check';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'lists');
const PUBLIC = join(ROOT, 'public');
const OFFLINE = process.argv.includes('--offline');

/** Hard caps that keep every ruleset valid for Chrome. */
const MAX_REGEX_PER_RULESET = 900;
const MAX_RULES_PER_RULESET = 150_000;

/**
 * Upstream scriptlet calls HUSH deliberately does not run, each with the reason.
 * uBO's YouTube "serverContract" fix retags the player's client and reloads stalled videos; it
 * only works together with `trusted-edit-inbound-object` filters (not supported here). Alone it
 * reload-loops the player and proxies Array.prototype.push, so videos keep loading.
 */
const SCRIPTLET_DENYLIST: Array<{ fn: string; test: (args: string[]) => boolean }> = [
  { fn: 'replaceNodeText', test: (args) => args.some((a) => a.includes('serverContract')) },
];

const SCRIPTLET_ALIASES = (library as unknown as { SCRIPTLET_ALIASES: Record<string, string> }).SCRIPTLET_ALIASES;
const LIB = library as unknown as Record<string, (...a: string[]) => void>;

/* ------------------------------------------------------------------------------------------ */
/* Fetching                                                                                    */
/* ------------------------------------------------------------------------------------------ */

async function fetchText(url: string, cacheName: string): Promise<string | null> {
  const cacheFile = join(CACHE, `${cacheName}.txt`);
  if (!OFFLINE) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'HUSH-filter-compiler/1.0' }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < 50) throw new Error('suspiciously small');
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(cacheFile, text);
      return text;
    } catch (e) {
      console.warn(`  ! ${cacheName}: download failed (${(e as Error).message}), trying cache`);
    }
  }
  if (existsSync(cacheFile)) return readFileSync(cacheFile, 'utf8');
  console.warn(`  ! ${cacheName}: not available, skipped`);
  return null;
}

/** Inline `!#include` directives (uBO lists split themselves into sub-files). */
async function resolveIncludes(text: string, baseUrl: string, name: string, depth = 0): Promise<string> {
  if (depth > 3 || !baseUrl) return text;
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let n = 0;
  for (const line of lines) {
    const m = /^!#include\s+(\S+)/.exec(line.trim());
    if (!m) {
      out.push(line);
      continue;
    }
    const url = new URL(m[1], baseUrl).href;
    const sub = await fetchText(url, `${name}--inc${depth}-${n++}`);
    if (sub) out.push(await resolveIncludes(sub, url, `${name}-${n}`, depth + 1));
  }
  return out.join('\n');
}

async function loadSource(src: ListSource): Promise<string[] | null> {
  let text: string | null;
  if (src.file) text = readFileSync(join(ROOT, src.file), 'utf8');
  else {
    text = await fetchText(src.url, src.id);
    if (text) text = await resolveIncludes(text, src.url, src.id);
  }
  if (!text) return null;
  if (src.format === 'hosts') {
    const out: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const m = /^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([^\s#]+)/.exec(line.trim());
      if (m && m[1] !== 'localhost' && m[1] !== '0.0.0.0') out.push(`||${m[1]}^`);
    }
    return out;
  }
  return preprocess(text, PREPROCESSOR_ENV);
}

/* ------------------------------------------------------------------------------------------ */
/* Compilation state                                                                           */
/* ------------------------------------------------------------------------------------------ */

interface ScriptletCall {
  rid: string;
  fn: string;
  args: string[];
  domains: string[];
  notDomains: string[];
}

interface RulesetBuild {
  network: Map<string, DnrRule>;
  cosmetic: CosmeticFilter[];
  raw: Set<string>;
  /** Generic selectors from HUSH's own list: always injected, no token lookup round trip. */
  hot: Set<string>;
}

const builds = new Map<string, RulesetBuild>();
const popupFilters: PopupFilter[] = [];
const scriptletCalls: ScriptletCall[] = [];
const scriptletExceptions = new Map<string, Set<string>>(); // host → set of `fn|args` or '*'
const hostFlags = new Map<string, number>();
const badfilters = new Set<string>();
const skipped = new Map<string, number>();
const unknownScriptlets = new Map<string, number>();

const ruleKey = (r: DnrRule) => JSON.stringify(r);

function noteSkip(reason: string) {
  skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
}

function addFlag(host: string, bit: number) {
  hostFlags.set(host, (hostFlags.get(host) ?? 0) | bit);
}

/* ------------------------------------------------------------------------------------------ */
/* Network rule optimisation                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** Merge rules that only differ by requestDomains / initiatorDomains into a single rule. */
function optimiseNetwork(rules: DnrRule[]): DnrRule[] {
  const byShape = new Map<string, { rule: DnrRule; key: 'requestDomains' | 'initiatorDomains'; set: Set<string> }>();
  const out: DnrRule[] = [];
  for (const rule of rules) {
    const c = rule.condition;
    // Merge on requestDomains when there is no urlFilter; otherwise on initiatorDomains when
    // everything else is identical.
    let key: 'requestDomains' | 'initiatorDomains' | null = null;
    if (!c.urlFilter && !c.regexFilter && c.requestDomains && !c.initiatorDomains) key = 'requestDomains';
    else if (c.initiatorDomains && !c.excludedInitiatorDomains) key = 'initiatorDomains';
    if (!key) {
      out.push(rule);
      continue;
    }
    const shape = key + JSON.stringify({ ...rule, condition: { ...c, [key]: undefined } });
    const prev = byShape.get(shape);
    if (prev) {
      for (const d of c[key]!) prev.set.add(d);
    } else {
      const copy = structuredClone(rule);
      byShape.set(shape, { rule: copy, key, set: new Set(c[key]) });
      out.push(copy);
    }
  }
  for (const { rule, key, set } of byShape.values()) rule.condition[key] = [...set];
  // Remove requestDomains that are subdomains of another entry in the same list.
  for (const r of out) {
    const list = r.condition.requestDomains;
    if (!list || list.length < 2) continue;
    const set = new Set(list);
    r.condition.requestDomains = list.filter((d) => {
      let h = d;
      for (let i = h.indexOf('.'); i !== -1; i = h.indexOf('.')) {
        h = h.slice(i + 1);
        if (set.has(h)) return false;
      }
      return true;
    }).sort();
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* Scriptlet bundles                                                                           */
/* ------------------------------------------------------------------------------------------ */

function matchPatternFor(host: string): string {
  return `*://*.${host}/*`;
}

function buildScriptletBundle(fnName: string, calls: ScriptletCall[]) {
  const fn = LIB[fnName];
  const argsList: string[][] = [];
  const argsIndex = new Map<string, number>();
  const hostMap: Record<string, number[]> = {};
  const generic: number[] = [];
  const excMap: Record<string, number[]> = {};
  const hosts = new Set<string>();

  for (const call of calls) {
    const key = JSON.stringify(call.args);
    let idx = argsIndex.get(key);
    if (idx === undefined) {
      idx = argsList.length;
      argsList.push(call.args);
      argsIndex.set(key, idx);
    }
    const callKey = `${call.fn}|${call.args.join(',')}`;
    const include = call.domains.filter((h) => {
      const exc = scriptletExceptions.get(h);
      return !(exc && (exc.has('*') || exc.has(callKey)));
    });
    if (call.domains.length === 0) {
      if (!generic.includes(idx)) generic.push(idx);
    } else {
      for (const h of include) {
        (hostMap[h] ??= []).includes(idx) || hostMap[h].push(idx);
        hosts.add(h);
      }
    }
    for (const h of call.notDomains) (excMap[h] ??= []).includes(idx) || excMap[h].push(idx);
  }
  // Global exceptions targeting specific calls (e.g. `site.com#@#+js(set, foo, 1)`).
  for (const [host, set] of scriptletExceptions) {
    for (const [key, idx] of argsIndex) {
      if (set.has('*') || set.has(`${fnName}|${(JSON.parse(key) as string[]).join(',')}`)) {
        (excMap[host] ??= []).includes(idx) || excMap[host].push(idx);
      }
    }
  }
  if (generic.length === 0 && hosts.size === 0) return null;

  const code = `/* HUSH scriptlet: ${fnName} (generated) */
(function () {
  'use strict';
  try {
    const fn = ${fn.toString()};
    const ARGS = ${JSON.stringify(argsList)};
    const HOSTS = ${JSON.stringify(hostMap)};
    const GENERIC = ${JSON.stringify(generic)};
    const EXC = ${JSON.stringify(excMap)};
    let h = location.hostname;
    if (!h) { try { h = new URL(document.referrer || location.ancestorOrigins[0]).hostname; } catch (e) {} }
    const todo = new Set(GENERIC);
    const skip = new Set();
    for (let cur = h; cur; ) {
      const a = HOSTS[cur]; if (a) for (const i of a) todo.add(i);
      const x = EXC[cur]; if (x) for (const i of x) skip.add(i);
      const dot = cur.indexOf('.'); if (dot === -1) break; cur = cur.slice(dot + 1);
    }
    for (const i of todo) { if (skip.has(i)) continue; try { fn(...ARGS[i]); } catch (e) {} }
  } catch (e) {}
})();
`;
  return {
    code,
    matches: generic.length ? ['<all_urls>'] : [...hosts].sort().map(matchPatternFor),
    hosts: hosts.size,
    calls: argsList.length,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Main                                                                                        */
/* ------------------------------------------------------------------------------------------ */

async function main() {
  const t0 = Date.now();
  console.log(`HUSH compiler — ${OFFLINE ? 'offline' : 'online'} mode`);

  for (const rs of RULESETS) {
    const sources = SOURCES[rs.id] ?? [];
    const build: RulesetBuild = { network: new Map(), cosmetic: [], raw: new Set(), hot: new Set() };
    builds.set(rs.id, build);
    for (const src of sources) {
      const lines = await loadSource(src);
      if (!lines) continue;
      let n = 0;
      for (const line of lines) {
        const parsed = parseFilter(line, { trusted: !!src.trusted, redirects: REDIRECTS });
        if (!parsed) continue;
        n++;
        switch (parsed.type) {
          case 'skip':
            noteSkip(parsed.reason);
            break;
          case 'badfilter':
            badfilters.add(parsed.target);
            break;
          case 'network':
            build.network.set(parsed.raw, parsed.rule);
            break;
          case 'popup':
            popupFilters.push(parsed.popup);
            break;
          case 'hostflag': {
            const bit = FLAG[parsed.flag.flag];
            for (const h of parsed.flag.hosts) addFlag(h, bit);
            break;
          }
          case 'cosmetic': {
            const f = parsed.filter;
            if (f.kind === 'scriptlet') {
              if (f.exception) {
                const key = f.body === '*' ? '*' : `${SCRIPTLET_ALIASES[f.body] ?? f.body}|${(f.args ?? []).join(',')}`;
                const hosts = f.domains.length ? f.domains : [];
                for (const h of hosts) {
                  if (!scriptletExceptions.has(h)) scriptletExceptions.set(h, new Set());
                  scriptletExceptions.get(h)!.add(key);
                  if (key === '*') addFlag(h, FLAG.noscriptlets);
                }
                break;
              }
              const fn = SCRIPTLET_ALIASES[f.body];
              if (!fn || !LIB[fn]) {
                unknownScriptlets.set(f.body, (unknownScriptlets.get(f.body) ?? 0) + 1);
                break;
              }
              // Trim trailing empty args so identical calls dedupe.
              const args = [...(f.args ?? [])];
              while (args.length && args[args.length - 1] === '') args.pop();
              if (SCRIPTLET_DENYLIST.some((d) => d.fn === fn && d.test(args))) break;
              scriptletCalls.push({ rid: rs.id, fn, args, domains: f.domains, notDomains: f.notDomains });
            } else {
              build.cosmetic.push(f);
              if (src.id === 'hush' && f.kind === 'hide' && !f.exception && f.domains.length === 0) build.hot.add(f.body);
            }
            break;
          }
        }
      }
      console.log(`  ✓ ${rs.id} ← ${src.id}: ${n.toLocaleString()} filters`);
    }
  }

  /* ---- badfilter ---- */
  for (const build of builds.values()) for (const raw of badfilters) build.network.delete(raw);

  /* ---- Output directories ---- */
  for (const d of ['rulesets', 'data/cosmetic', 'scriptlets']) {
    rmSync(join(PUBLIC, d), { recursive: true, force: true });
    mkdirSync(join(PUBLIC, d), { recursive: true });
  }

  /* ---- Network rulesets ---- */
  const index: Array<{ id: string; enabled: boolean; rules: number; regex: number }> = [];
  const malwareHosts = new Set<string>();
  // Chrome skips regex rules over its 2 KB compiled-memory budget; ask a real Chromium first.
  const regexItems: Array<{ regex: string; caseSensitive: boolean }> = [];
  for (const build of builds.values()) {
    for (const r of build.network.values()) {
      if (r.condition.regexFilter) regexItems.push({ regex: r.condition.regexFilter, caseSensitive: !!r.condition.isUrlFilterCaseSensitive });
    }
  }
  const regexOk = await checkRegexes(regexItems, join(ROOT, '.cache', 'regex-check.json'));
  let regexDropped = 0;
  for (const [rid, build] of builds) {
    const unique = new Map<string, DnrRule>();
    for (const r of build.network.values()) unique.set(ruleKey(r), r);
    let rules = optimiseNetwork([...unique.values()]);

    // Regex budget.
    let regex = 0;
    rules = rules.filter((r) => {
      if (!r.condition.regexFilter) return true;
      if (!regexOk(r.condition.regexFilter, !!r.condition.isUrlFilterCaseSensitive)) {
        regexDropped++;
        return false;
      }
      if (regex >= MAX_REGEX_PER_RULESET) return false;
      regex++;
      return true;
    });

    // Malware: block whole documents of known-bad hosts and show the HUSH warning page.
    if (rid === 'hush-malware') {
      for (const r of rules) {
        const c = r.condition;
        if (r.action.type === 'block' && c.requestDomains && !c.urlFilter && !c.regexFilter && !c.initiatorDomains && !c.excludedInitiatorDomains && !c.domainType) {
          for (const d of c.requestDomains) if (d.includes('.')) malwareHosts.add(d);
        }
      }
      if (malwareHosts.size) {
        rules.push({
          priority: PRIORITY.malwareDocument,
          action: { type: 'redirect', redirect: { extensionPath: '/blocked.html' } },
          condition: { requestDomains: [...malwareHosts].sort(), resourceTypes: ['main_frame'] },
        });
      }
    }

    if (rules.length > MAX_RULES_PER_RULESET) rules = rules.slice(0, MAX_RULES_PER_RULESET);
    rules.forEach((r, i) => (r.id = i + 1));
    writeFileSync(join(PUBLIC, 'rulesets', `${rid}.json`), JSON.stringify(rules));
    index.push({ id: rid, enabled: DEFAULT_SETTINGS.rulesets[rid] ?? false, rules: rules.length, regex });
  }
  writeFileSync(join(PUBLIC, 'rulesets', 'index.json'), JSON.stringify(index, null, 2));
  if (regexDropped) console.log(`  ✓ dropped ${regexDropped} regex rules that Chrome would reject`);

  /* ---- Cosmetic ---- */
  const genericExceptions = new Set<string>();
  for (const build of builds.values()) {
    for (const f of build.cosmetic) if (f.exception && f.domains.length === 0) genericExceptions.add(f.kind === 'style' ? `${f.body}{${f.style}}` : f.body);
  }
  const exceptions: Record<number, Record<string, HostEntry>> = {};
  const cosmeticStats: Record<string, { hosts: number; generic: number; complex: number; bytes: number }> = {};

  for (const [rid, build] of builds) {
    const table: Record<string, HostEntry> = {};
    const generic = new Set<string>();
    for (const f of build.cosmetic) {
      addToHostTable(table, f, (sel) => generic.add(sel), () => {});
    }
    // Move exceptions & flags to the global exception table.
    const spec: Record<number, Record<string, HostEntry>> = {};
    let hostCount = 0;
    for (const [host, entry] of Object.entries(table)) {
      if (entry.x) {
        const b = bucketOf(host, HOST_BUCKETS);
        const e = ((exceptions[b] ??= {})[host] ??= {});
        e.x = [...new Set([...(e.x ?? []), ...entry.x])];
        delete entry.x;
      }
      const filterOut = (arr?: string[]) => arr?.filter((s) => !genericExceptions.has(s));
      entry.h = filterOut(entry.h);
      entry.p = filterOut(entry.p);
      entry.s = filterOut(entry.s);
      for (const k of ['h', 'p', 's'] as const) if (!entry[k]?.length) delete entry[k];
      if (!entry.h && !entry.p && !entry.s) continue;
      (spec[bucketOf(host, HOST_BUCKETS)] ??= {})[host] = entry;
      hostCount++;
    }
    // Generic selectors indexed by class/id token are resolved by the service worker on demand
    // (the page reports which tokens it uses); the rest ("complex") is injected everywhere.
    const gen: Record<string, string[]> = {};
    const complex: string[] = [];
    for (const sel of generic) {
      if (genericExceptions.has(sel)) continue;
      const tok = genericToken(sel);
      if (tok && !build.hot.has(sel)) (gen[tok] ??= []).push(sel);
      else complex.push(sel);
    }
    const json = JSON.stringify({ spec, complex });
    const genJson = JSON.stringify(gen);
    writeFileSync(join(PUBLIC, 'data', 'cosmetic', `${rid}.json`), json);
    writeFileSync(join(PUBLIC, 'data', 'cosmetic', `${rid}.gen.json`), genJson);
    cosmeticStats[rid] = { hosts: hostCount, generic: generic.size - complex.length, complex: complex.length, bytes: json.length + genJson.length };
  }
  for (const [host, flags] of hostFlags) {
    const b = bucketOf(host, HOST_BUCKETS);
    const e = ((exceptions[b] ??= {})[host] ??= {});
    e.f = (e.f ?? 0) | flags;
  }
  writeFileSync(join(PUBLIC, 'data', 'cosmetic', '_exceptions.json'), JSON.stringify(exceptions));

  /* ---- Scriptlets ---- */
  const groups = new Map<string, ScriptletCall[]>();
  for (const call of scriptletCalls) {
    const key = `${call.rid}/${call.fn}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(call);
  }
  const registrations: Array<{ id: string; rid: string; file: string; matches: string[]; calls: number }> = [];
  for (const [key, calls] of groups) {
    const [rid, fn] = key.split('/');
    const bundle = buildScriptletBundle(fn, calls);
    if (!bundle) continue;
    const file = `scriptlets/${rid}/${fn}.js`;
    mkdirSync(join(PUBLIC, 'scriptlets', rid), { recursive: true });
    writeFileSync(join(PUBLIC, file), bundle.code);
    registrations.push({ id: `hush-${rid.replace('hush-', '')}-${fn}`, rid, file, matches: bundle.matches, calls: bundle.calls });
  }
  writeFileSync(join(PUBLIC, 'data', 'scriptlets.json'), JSON.stringify(registrations));

  /* ---- Popup filters ---- */
  const popupHosts = new Set<string>();
  const popupRules: PopupFilter[] = [];
  const popupExceptions: PopupFilter[] = [];
  for (const p of popupFilters) {
    if (p.exception) popupExceptions.push(p);
    else if (p.host && !p.domains && !p.notDomains) popupHosts.add(p.host);
    else popupRules.push(p);
  }
  writeFileSync(
    join(PUBLIC, 'data', 'popup.json'),
    JSON.stringify({ hosts: [...popupHosts].sort(), rules: popupRules, exceptions: popupExceptions }),
  );

  /* ---- Build metadata ---- */
  const meta = {
    version: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    built: new Date().toISOString(),
    rulesets: index,
    cosmetic: cosmeticStats,
    scriptlets: registrations.length,
    popupHosts: popupHosts.size,
    malwareHosts: malwareHosts.size,
  };
  writeFileSync(join(PUBLIC, 'data', 'build.json'), JSON.stringify(meta, null, 2));

  /* ---- Report ---- */
  console.log('\nRulesets:');
  for (const r of index) console.log(`  ${r.id.padEnd(18)} ${String(r.rules).padStart(7)} rules  (${r.regex} regex)  ${r.enabled ? 'default-on' : ''}`);
  const enabledTotal = index.filter((r) => r.enabled).reduce((a, r) => a + r.rules, 0);
  console.log(`  default-enabled total: ${enabledTotal.toLocaleString()} rules`);
  console.log('\nCosmetic:');
  for (const [rid, s] of Object.entries(cosmeticStats)) {
    console.log(`  ${rid.padEnd(18)} ${String(s.hosts).padStart(6)} hosts  ${String(s.generic).padStart(6)} generic  ${String(s.complex).padStart(5)} complex  ${(s.bytes / 1024).toFixed(0)} KB`);
  }
  console.log(`\nScriptlet bundles: ${registrations.length}   popup hosts: ${popupHosts.size}   malware hosts: ${malwareHosts.size}`);
  const topSkips = [...skipped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`Skipped (unsupported in MV3): ${[...skipped.values()].reduce((a, b) => a + b, 0).toLocaleString()}`);
  for (const [r, n] of topSkips) console.log(`  ${r.padEnd(28)} ${n}`);
  if (unknownScriptlets.size) {
    const top = [...unknownScriptlets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log(`Unknown scriptlets: ${top.map(([n, c]) => `${n}(${c})`).join(', ')}`);
  }
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
