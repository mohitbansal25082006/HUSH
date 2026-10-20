/**
 * HUSH filter parser.
 *
 * Understands Adblock Plus / uBlock Origin / AdGuard (uBO-flavoured) filter syntax and
 * converts it into:
 *   - Chrome declarativeNetRequest rules (network filters)
 *   - cosmetic hide / style / procedural filters
 *   - scriptlet calls
 *
 * This module is shared by the build-time compiler (Node) and the runtime (service worker,
 * for user filters and hotfixes), so it must stay free of Node and DOM specific APIs.
 */

export type DnrResourceType = chrome.declarativeNetRequest.ResourceType | `${chrome.declarativeNetRequest.ResourceType}`;

export interface DnrCondition {
  urlFilter?: string;
  regexFilter?: string;
  isUrlFilterCaseSensitive?: boolean;
  initiatorDomains?: string[];
  excludedInitiatorDomains?: string[];
  requestDomains?: string[];
  excludedRequestDomains?: string[];
  resourceTypes?: string[];
  excludedResourceTypes?: string[];
  requestMethods?: string[];
  excludedRequestMethods?: string[];
  domainType?: 'firstParty' | 'thirdParty';
}

export interface DnrAction {
  type: 'block' | 'allow' | 'allowAllRequests' | 'redirect' | 'upgradeScheme' | 'modifyHeaders';
  redirect?: {
    extensionPath?: string;
    url?: string;
    transform?: { queryTransform?: { removeParams?: string[] } };
    regexSubstitution?: string;
  };
}

export interface DnrRule {
  id?: number;
  priority: number;
  action: DnrAction;
  condition: DnrCondition;
}

/** Priorities. Higher wins; at equal priority Chrome prefers allow > allowAllRequests > block > redirect. */
export const PRIORITY = {
  removeparam: 5,
  block: 10,
  redirect: 11,
  allow: 20,
  importantBlock: 30,
  importantRedirect: 31,
  malwareDocument: 50,
  userAllowlist: 1_000_000,
} as const;

export interface PopupFilter {
  /** Hostname (from ||host^) or a regex source. */
  host?: string;
  re?: string;
  domains?: string[];
  notDomains?: string[];
  exception: boolean;
}

export interface CosmeticFilter {
  kind: 'hide' | 'style' | 'procedural' | 'scriptlet';
  exception: boolean;
  domains: string[];
  notDomains: string[];
  /** CSS selector, procedural selector, `selector { css }` for style, or scriptlet name. */
  body: string;
  /** For style filters: CSS declarations. */
  style?: string;
  /** For scriptlets: arguments. */
  args?: string[];
}

export interface HostFlagFilter {
  /** generichide / elemhide / specifichide exceptions. */
  flag: 'generichide' | 'elemhide' | 'specifichide';
  hosts: string[];
}

export type ParsedFilter =
  | { type: 'network'; rule: DnrRule; raw: string }
  | { type: 'popup'; popup: PopupFilter; raw: string }
  | { type: 'cosmetic'; filter: CosmeticFilter; raw: string }
  | { type: 'hostflag'; flag: HostFlagFilter; raw: string }
  | { type: 'badfilter'; target: string; raw: string }
  | { type: 'skip'; reason: string; raw: string };

export interface ParseOptions {
  /** Allow trusted-* scriptlets (only for first-party / trusted lists). */
  trusted?: boolean;
  /** Map of redirect resource names → extension paths. */
  redirects?: Record<string, string>;
}

/* ------------------------------------------------------------------------------------------ */
/* Helpers                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Common TLDs used to expand `entity.*` domain wildcards, which DNR cannot express. */
export const ENTITY_TLDS = [
  'com', 'net', 'org', 'co', 'io', 'in', 'co.in', 'co.uk', 'uk', 'de', 'fr', 'es', 'it', 'nl',
  'ru', 'pl', 'se', 'ch', 'at', 'be', 'pt', 'com.br', 'com.mx', 'ca', 'com.au', 'jp', 'co.jp',
  'tr', 'com.tr', 'to', 'cc', 'me', 'tv', 'xyz', 'ws', 'si', 'is', 'lol', 'top',
];

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const ASCII_RE = /^[\x20-\x7e]*$/;

/** Normalise a hostname to lowercase punycode; returns null if invalid. */
export function normalizeHost(input: string): string | null {
  let h = input.trim().toLowerCase();
  if (h.endsWith('.')) h = h.slice(0, -1);
  if (!h) return null;
  if (!ASCII_RE.test(h)) {
    try {
      h = new URL(`http://${h}/`).hostname;
    } catch {
      return null;
    }
  }
  if (h.length > 253 || !HOSTNAME_RE.test(h)) return null;
  return h;
}

/**
 * Shorter TLD list for scriptlets: every hostname becomes a content-script match pattern, and
 * registration cost grows with the pattern count. These cover rotating piracy / streaming domains.
 */
export const ENTITY_TLDS_SHORT = ['com', 'net', 'org', 'to', 'cc', 'io', 'co', 'me', 'tv', 'xyz', 'si', 'in'];

/** Expand a single domain token (may be `entity.*`) into concrete hostnames. */
export function expandDomain(token: string, tlds: string[] = ENTITY_TLDS): string[] {
  if (token.endsWith('.*')) {
    const base = token.slice(0, -2);
    const out: string[] = [];
    for (const tld of tlds) {
      const h = normalizeHost(`${base}.${tld}`);
      if (h) out.push(h);
    }
    return out;
  }
  if (token.includes('*') || token.startsWith('/')) return [];
  const h = normalizeHost(token);
  return h ? [h] : [];
}

/** Split a `a.com|~b.com` (or comma separated) domain list into include / exclude sets. */
export function parseDomainList(list: string, sep: string, tlds: string[] = ENTITY_TLDS): { include: string[]; exclude: string[] } {
  const include: string[] = [];
  const exclude: string[] = [];
  for (let tok of list.split(sep)) {
    tok = tok.trim();
    if (!tok) continue;
    const neg = tok.startsWith('~');
    if (neg) tok = tok.slice(1);
    const hosts = expandDomain(tok, tlds);
    (neg ? exclude : include).push(...hosts);
  }
  return { include, exclude };
}

const TYPE_MAP: Record<string, string[]> = {
  script: ['script'],
  image: ['image'],
  stylesheet: ['stylesheet'],
  css: ['stylesheet'],
  object: ['object'],
  'object-subrequest': ['object'],
  xmlhttprequest: ['xmlhttprequest'],
  xhr: ['xmlhttprequest'],
  subdocument: ['sub_frame'],
  frame: ['sub_frame'],
  ping: ['ping'],
  beacon: ['ping'],
  media: ['media'],
  font: ['font'],
  websocket: ['websocket'],
  other: ['other', 'csp_report', 'webtransport', 'webbundle'],
  document: ['main_frame'],
  doc: ['main_frame'],
};

const ALL_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest',
  'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other',
];

/** Options that make a filter impossible to express with DNR; such filters are skipped. */
const UNSUPPORTED_OPTIONS = new Set([
  'csp', 'header', 'permissions', 'replace', 'urltransform', 'uritransform', 'cookie', 'stealth',
  'network', 'app', 'extension', 'jsonprune', 'hls', 'referrerpolicy', 'inline-script',
  'inline-font', 'webrtc', 'cname', 'ipaddress', 'xmlprune', 'mp4', 'content',
  'genericblock', 'urlblock', 'jsinject', 'responseheader', 'requestheader',
]);

const IGNORED_OPTIONS = new Set(['_', '__', 'all-frames', 'reason', 'strict1p', 'strict3p']);

function splitOptions(options: string): string[] {
  // Options are comma separated; commas may be escaped (`\,`) inside values such as removeparam.
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < options.length; i++) {
    const c = options[i];
    if (c === '\\' && options[i + 1] === ',') {
      cur += ',';
      i++;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** RE2 (used by DNR) does not support look-around or back-references. */
export function isRe2Compatible(source: string): boolean {
  if (source.length > 250) return false;
  if (/\(\?[=!<]/.test(source)) return false;
  if (/\\[1-9]/.test(source)) return false;
  if (!ASCII_RE.test(source)) return false;
  // RE2 expands counted repetitions; large ones blow past Chrome's regex memory budget and can
  // stall extension loading entirely.
  let total = 1;
  for (const m of source.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
    const n = Number(m[2] || m[1]);
    if (n > 60) return false;
    total *= Math.max(1, n);
    if (total > 400) return false;
  }
  try {
    new RegExp(source);
  } catch {
    return false;
  }
  return true;
}

/** Find where the `$options` part of a network filter starts, or -1. */
function findOptionsIndex(line: string): number {
  if (line.startsWith('/')) {
    const close = line.lastIndexOf('/');
    if (close > 0) {
      const after = line.indexOf('$', close);
      return after;
    }
  }
  const idx = line.lastIndexOf('$');
  if (idx <= 0) return idx;
  // `$` immediately followed by something that does not look like options → part of the pattern.
  const rest = line.slice(idx + 1);
  if (!/^~?[a-z0-9_-]+(=|,|$)/i.test(rest)) return -1;
  return idx;
}

/* ------------------------------------------------------------------------------------------ */
/* Network filters                                                                             */
/* ------------------------------------------------------------------------------------------ */

function parseNetwork(raw: string, opts: ParseOptions): ParsedFilter {
  let line = raw;
  const exception = line.startsWith('@@');
  if (exception) line = line.slice(2);

  const optIdx = findOptionsIndex(line);
  let pattern = optIdx >= 0 ? line.slice(0, optIdx) : line;
  const optionList = optIdx >= 0 ? splitOptions(line.slice(optIdx + 1)) : [];

  const cond: DnrCondition = {};
  const action: DnrAction = { type: exception ? 'allow' : 'block' };
  let important = false;
  let includeTypes: string[] = [];
  let excludeTypes: string[] = [];
  let popup = false;
  let documentType = false;
  let removeParam: string | undefined;
  let redirect: string | undefined;
  /** `redirect-rule=`: redirect only, never block on its own. */
  let redirectOnly = false;
  let badfilter = false;
  const hostFlags: HostFlagFilter['flag'][] = [];
  let popupDomains: { include: string[]; exclude: string[] } | undefined;

  for (const option of optionList) {
    const eq = option.indexOf('=');
    let name = (eq >= 0 ? option.slice(0, eq) : option).toLowerCase();
    const value = eq >= 0 ? option.slice(eq + 1) : '';
    const negated = name.startsWith('~');
    if (negated) name = name.slice(1);

    if (IGNORED_OPTIONS.has(name)) continue;
    if (UNSUPPORTED_OPTIONS.has(name)) return { type: 'skip', reason: `option:${name}`, raw };

    switch (name) {
      case 'third-party':
      case '3p':
        cond.domainType = negated ? 'firstParty' : 'thirdParty';
        continue;
      case 'first-party':
      case '1p':
        cond.domainType = negated ? 'thirdParty' : 'firstParty';
        continue;
      case 'domain':
      case 'from': {
        const d = parseDomainList(value, '|');
        if (d.include.length === 0 && d.exclude.length === 0) return { type: 'skip', reason: 'domain:unresolvable', raw };
        if (value.split('|').some((t) => !t.startsWith('~')) && d.include.length === 0) {
          return { type: 'skip', reason: 'domain:unresolvable', raw };
        }
        if (d.include.length) cond.initiatorDomains = d.include;
        if (d.exclude.length) cond.excludedInitiatorDomains = d.exclude;
        popupDomains = d;
        continue;
      }
      case 'to': {
        const d = parseDomainList(value, '|');
        if (d.include.length) cond.requestDomains = d.include;
        if (d.exclude.length) cond.excludedRequestDomains = d.exclude;
        continue;
      }
      case 'denyallow': {
        const d = parseDomainList(value, '|');
        if (d.include.length) cond.excludedRequestDomains = d.include;
        continue;
      }
      case 'method': {
        const methods = value.toLowerCase().split('|');
        const inc = methods.filter((m) => !m.startsWith('~'));
        const exc = methods.filter((m) => m.startsWith('~')).map((m) => m.slice(1));
        if (inc.length) cond.requestMethods = inc;
        if (exc.length) cond.excludedRequestMethods = exc;
        continue;
      }
      case 'important':
        important = true;
        continue;
      case 'match-case':
        cond.isUrlFilterCaseSensitive = true;
        continue;
      case 'badfilter':
        badfilter = true;
        continue;
      case 'popup':
        popup = true;
        continue;
      case 'popunder':
        popup = true;
        continue;
      case 'all':
        includeTypes.push(...ALL_TYPES);
        popup = !exception;
        continue;
      case 'document':
      case 'doc':
        if (negated) excludeTypes.push('main_frame');
        else documentType = true;
        continue;
      case 'generichide':
      case 'ghide':
        hostFlags.push('generichide');
        continue;
      case 'elemhide':
      case 'ehide':
        hostFlags.push('elemhide');
        continue;
      case 'specifichide':
      case 'shide':
        hostFlags.push('specifichide');
        continue;
      case 'removeparam':
      case 'queryprune':
        if (!value || value.startsWith('/') || value.startsWith('~') || value.includes('|')) {
          return { type: 'skip', reason: 'removeparam:complex', raw };
        }
        removeParam = value;
        continue;
      case 'redirect':
      case 'rewrite':
        redirect = value.replace(/^abp-resource:/, '');
        continue;
      case 'redirect-rule':
        redirect = value;
        redirectOnly = true;
        continue;
      case 'empty':
        redirect = 'noop.txt';
        continue;
      default:
        break;
    }

    const mapped = TYPE_MAP[name];
    if (mapped) {
      (negated ? excludeTypes : includeTypes).push(...mapped);
      continue;
    }
    return { type: 'skip', reason: `option:unknown:${name}`, raw };
  }

  if (badfilter) {
    // Strip the badfilter option to obtain the canonical text of the filter it cancels.
    const target = raw.replace(/([$,])badfilter(?=,|$)/, '$1').replace(/[$,]$/, '').replace('$,', '$');
    return { type: 'badfilter', target, raw };
  }

  /* Pattern → urlFilter / regexFilter / requestDomains */
  if (pattern === '*' || pattern === '') pattern = '';
  let hostOnly: string | null = null;

  if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
    const source = pattern.slice(1, -1);
    if (!isRe2Compatible(source)) return { type: 'skip', reason: 'regex:incompatible', raw };
    cond.regexFilter = source;
  } else if (pattern) {
    const m = /^\|\|([a-z0-9.\-_]+)\^?\|?$/i.exec(pattern);
    // `||name.` (trailing dot) means "any TLD" — that stays a prefix urlFilter, not a host.
    if (m && !pattern.includes('*') && m[1].includes('.') && !m[1].endsWith('.')) {
      hostOnly = normalizeHost(m[1]);
      if (!hostOnly) return { type: 'skip', reason: 'host:invalid', raw };
    } else {
      if (!ASCII_RE.test(pattern)) return { type: 'skip', reason: 'pattern:non-ascii', raw };
      if (pattern.startsWith('||*')) pattern = pattern.slice(2);
      // A leading/trailing * is redundant in DNR.
      while (pattern.startsWith('*') && !pattern.startsWith('*^')) pattern = pattern.slice(1);
      if (pattern.length < 3 && !cond.initiatorDomains && !cond.requestDomains) {
        return { type: 'skip', reason: 'pattern:too-short', raw };
      }
      if (pattern) cond.urlFilter = pattern;
    }
  }

  /* Host flag exceptions (generichide, elemhide, specifichide) */
  if (hostFlags.length) {
    if (!exception) return { type: 'skip', reason: 'hostflag:not-exception', raw };
    const hosts = hostOnly ? [hostOnly] : cond.initiatorDomains ?? [];
    if (!hosts.length) return { type: 'skip', reason: 'hostflag:no-host', raw };
    // A filter like @@||site^$generichide,document still applies; we only report the flag here.
    return { type: 'hostflag', flag: { flag: hostFlags[0], hosts }, raw };
  }

  /* Popups are handled by the popup guard, not by DNR */
  if (popup && includeTypes.length === 0) {
    const pf: PopupFilter = { exception };
    if (hostOnly) pf.host = hostOnly;
    else if (cond.urlFilter) pf.re = urlFilterToRegex(cond.urlFilter);
    else if (cond.regexFilter) pf.re = cond.regexFilter;
    else return { type: 'skip', reason: 'popup:no-pattern', raw };
    if (popupDomains?.include.length) pf.domains = popupDomains.include;
    if (popupDomains?.exclude.length) pf.notDomains = popupDomains.exclude;
    return { type: 'popup', popup: pf, raw };
  }

  if (hostOnly) {
    cond.requestDomains = [hostOnly, ...(cond.requestDomains ?? [])].filter((v, i, a) => a.indexOf(v) === i);
  }

  if (removeParam && !cond.urlFilter && !cond.regexFilter) {
    // Only touch URLs that actually carry the parameter.
    cond.regexFilter = `[?&]${removeParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=`;
  }
  // Bare TLDs (`to=com`) are only safe when something else narrows the rule down.
  if (cond.requestDomains?.some((d) => !d.includes('.')) && !cond.urlFilter && !cond.regexFilter && !cond.initiatorDomains) {
    return { type: 'skip', reason: 'to:bare-tld', raw };
  }
  if (!cond.urlFilter && !cond.regexFilter && !cond.requestDomains && !cond.initiatorDomains) {
    return { type: 'skip', reason: 'pattern:matches-everything', raw };
  }

  /* Resource types */
  if (documentType) {
    if (exception) {
      action.type = 'allowAllRequests';
      includeTypes = ['main_frame', 'sub_frame'];
    } else includeTypes.push('main_frame');
  }
  if (includeTypes.length) cond.resourceTypes = [...new Set(includeTypes)];
  if (excludeTypes.length) cond.excludedResourceTypes = [...new Set(excludeTypes)];
  if (action.type === 'allowAllRequests' && cond.resourceTypes?.some((t) => t !== 'main_frame' && t !== 'sub_frame')) {
    return { type: 'skip', reason: 'allowAll:types', raw };
  }

  let priority: number = exception ? PRIORITY.allow : important ? PRIORITY.importantBlock : PRIORITY.block;

  if (removeParam) {
    if (exception) return { type: 'skip', reason: 'removeparam:exception', raw };
    action.type = 'redirect';
    action.redirect = { transform: { queryTransform: { removeParams: [removeParam] } } };
    priority = PRIORITY.removeparam;
    if (!cond.resourceTypes) cond.resourceTypes = ['main_frame', 'sub_frame', 'xmlhttprequest'];
  } else if (redirect && !exception) {
    const path = opts.redirects?.[redirect] ?? opts.redirects?.[redirect.replace(/:\d+$/, '')];
    if (path) {
      action.type = 'redirect';
      action.redirect = { extensionPath: path };
      priority = important ? PRIORITY.importantRedirect : PRIORITY.redirect;
      // DNR redirects need a resource type, otherwise main_frame might be redirected too.
      if (!cond.resourceTypes) cond.resourceTypes = ALL_TYPES.filter((t) => t !== 'main_frame');
    }
    // Unknown resource: uBO semantics are "redirect implies block", so keep it as a block.
    else if (redirectOnly) return { type: 'skip', reason: 'redirect-rule:unknown-resource', raw };
  } else if (redirectOnly) {
    return { type: 'skip', reason: 'redirect-rule:exception', raw };
  }

  return { type: 'network', rule: { priority, action, condition: cond }, raw };
}

/** Convert an ABP-style url pattern into an (approximate) JS regex source. */
export function urlFilterToRegex(filter: string): string {
  let re = '';
  let i = 0;
  if (filter.startsWith('||')) {
    re += '^[a-z-]+:\\/\\/(?:[^\\/?#]*\\.)?';
    i = 2;
  } else if (filter.startsWith('|')) {
    re += '^';
    i = 1;
  }
  for (; i < filter.length; i++) {
    const c = filter[i];
    if (c === '*') re += '.*';
    else if (c === '^') re += '(?:[^\\w.%-]|$)';
    else if (c === '|' && i === filter.length - 1) re += '$';
    else re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return re;
}

/* ------------------------------------------------------------------------------------------ */
/* Cosmetic filters                                                                            */
/* ------------------------------------------------------------------------------------------ */

/** Operators that need the HUSH procedural engine (cannot be expressed in plain CSS). */
export const PROCEDURAL_OPERATORS = [
  'has-text', 'contains', '-abp-contains', 'upward', 'xpath', 'matches-css', 'matches-css-before',
  'matches-css-after', 'min-text-length', 'matches-attr', 'matches-path', 'matches-prop', 'others',
  'remove', 'remove-attr', 'remove-class', 'watch-attr', 'if', 'if-not', 'nth-ancestor',
  'matches-media',
];
const PROCEDURAL_RE = new RegExp(`:(?:${PROCEDURAL_OPERATORS.map((o) => o.replace(/-/g, '\\-')).join('|')})\\(`);

const COSMETIC_SEPARATORS = ['#@?#', '#?#', '#@$#', '#$#', '#@%#', '#%#', '#@#', '##'];

/** Basic structural sanity check for a CSS selector (Node has no CSS parser). */
export function looksLikeValidSelector(sel: string): boolean {
  if (!sel || sel.length > 1000) return false;
  let depthParen = 0;
  let depthBracket = 0;
  let quote = '';
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depthParen++;
    else if (c === ')') depthParen--;
    else if (c === '[') depthBracket++;
    else if (c === ']') depthBracket--;
    else if ((c === '{' || c === '}') && depthBracket === 0) return false;
    if (depthParen < 0 || depthBracket < 0) return false;
  }
  return depthParen === 0 && depthBracket === 0 && !quote;
}

/** Split scriptlet arguments: `name, arg1, 'arg, 2', /re,gex/` */
export function splitScriptletArgs(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    while (i < src.length && src[i] === ' ') i++;
    let cur = '';
    const q = src[i];
    if (q === '"' || q === "'" || q === '`') {
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\' && src[i + 1] === q) {
          cur += q;
          i += 2;
          continue;
        }
        cur += src[i++];
      }
      i++; // closing quote
      while (i < src.length && src[i] !== ',') i++;
      i++;
      out.push(cur);
      continue;
    }
    while (i < src.length) {
      if (src[i] === '\\' && src[i + 1] === ',') {
        cur += ',';
        i += 2;
        continue;
      }
      if (src[i] === ',') break;
      cur += src[i++];
    }
    i++;
    out.push(cur.trim());
  }
  if (src.trim().endsWith(',')) out.push('');
  return out;
}

function parseCosmetic(raw: string, sepIndex: number, sep: string, opts: ParseOptions): ParsedFilter {
  const domainPart = raw.slice(0, sepIndex);
  let body = raw.slice(sepIndex + sep.length).trim();
  const exception = sep.includes('@');

  if (sep === '#%#' || sep === '#@%#') return { type: 'skip', reason: 'adguard-js', raw };
  if (body.startsWith('^')) return { type: 'skip', reason: 'html-filter', raw };

  // Domains (comma separated). Regex / path based domain targets are not supported.
  if (domainPart.includes('/') && !domainPart.startsWith('[')) return { type: 'skip', reason: 'domain:regex', raw };
  const isScriptlet = body.startsWith('+js(');
  const { include, exclude } = parseDomainList(domainPart, ',', isScriptlet ? ENTITY_TLDS_SHORT : ENTITY_TLDS);
  if (domainPart && include.length === 0 && domainPart.split(',').some((d) => !d.trim().startsWith('~'))) {
    return { type: 'skip', reason: 'domain:unresolvable', raw };
  }

  /* Scriptlets: ##+js(name, args...)  /  AdGuard //scriptlet('name', ...) */
  let scriptletSrc: string | null = null;
  if (body.startsWith('+js(') && body.endsWith(')')) scriptletSrc = body.slice(4, -1);
  else if (sep.includes('%')) return { type: 'skip', reason: 'adguard-js', raw };
  if (scriptletSrc !== null) {
    const parts = splitScriptletArgs(scriptletSrc);
    let name = (parts.shift() ?? '').trim();
    if (!name && exception) {
      // `#@#+js()` disables all scriptlets on the given domains.
      return {
        type: 'cosmetic',
        filter: { kind: 'scriptlet', exception, domains: include, notDomains: exclude, body: '*', args: [] },
        raw,
      };
    }
    name = name.replace(/\.js$/, '');
    if (!name) return { type: 'skip', reason: 'scriptlet:empty', raw };
    // Scriptlets whose arguments can carry code only come from trusted sources (bundled lists and
    // the user's own filters), never from data fetched at runtime.
    if ((name.startsWith('trusted-') || name === 'rpnt' || name === 'replace-node-text') && !opts.trusted && !exception) {
      return { type: 'skip', reason: 'scriptlet:untrusted', raw };
    }
    if (!exception && include.length === 0) {
      // Generic scriptlets run everywhere; only accept a small safe set.
      if (!opts.trusted) return { type: 'skip', reason: 'scriptlet:generic', raw };
    }
    return {
      type: 'cosmetic',
      filter: { kind: 'scriptlet', exception, domains: include, notDomains: exclude, body: name, args: parts },
      raw,
    };
  }

  /* AdGuard CSS injection: #$#selector { declarations } */
  if (sep === '#$#' || sep === '#@$#') {
    const m = /^(.+?)\s*\{([^}]*)\}\s*$/.exec(body);
    if (!m) return { type: 'skip', reason: 'css:malformed', raw };
    if (/remove\s*:\s*true/.test(m[2])) {
      body = `${m[1]}:remove()`;
    } else {
      return {
        type: 'cosmetic',
        filter: { kind: 'style', exception, domains: include, notDomains: exclude, body: m[1].trim(), style: m[2].trim() },
        raw,
      };
    }
  }

  // ABP / uBO aliases → standard CSS.
  body = body.replace(/:-abp-has\(/g, ':has(');

  /* uBO :style() → style filter */
  const styleMatch = /^(.*?):style\((.*)\)$/.exec(body);
  if (styleMatch && !PROCEDURAL_RE.test(styleMatch[1])) {
    if (/url\s*\(|expression|javascript:/i.test(styleMatch[2])) return { type: 'skip', reason: 'style:unsafe', raw };
    if (!looksLikeValidSelector(styleMatch[1])) return { type: 'skip', reason: 'selector:invalid', raw };
    return {
      type: 'cosmetic',
      filter: { kind: 'style', exception, domains: include, notDomains: exclude, body: styleMatch[1].trim(), style: styleMatch[2].trim() },
      raw,
    };
  }

  if (!looksLikeValidSelector(body)) return { type: 'skip', reason: 'selector:invalid', raw };
  const procedural = sep.includes('?') || PROCEDURAL_RE.test(body) || /:style\(/.test(body);
  if (procedural && include.length === 0 && !exception) {
    // Generic procedural filters are expensive on every page; skip them.
    return { type: 'skip', reason: 'procedural:generic', raw };
  }
  return {
    type: 'cosmetic',
    filter: { kind: procedural ? 'procedural' : 'hide', exception, domains: include, notDomains: exclude, body },
    raw,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Entry points                                                                                */
/* ------------------------------------------------------------------------------------------ */

export function parseFilter(line: string, opts: ParseOptions = {}): ParsedFilter | null {
  const raw = line.trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('[') || (raw.startsWith('#') && !raw.startsWith('##') && !raw.startsWith('#@#') && !raw.startsWith('#?#') && !raw.startsWith('#$#'))) {
    return null;
  }

  // Cosmetic separators. Find the earliest occurrence; prefer longer separators at the same index.
  let best = -1;
  let bestSep = '';
  for (const sep of COSMETIC_SEPARATORS) {
    const idx = raw.indexOf(sep);
    if (idx >= 0 && (best === -1 || idx < best || (idx === best && sep.length > bestSep.length))) {
      best = idx;
      bestSep = sep;
    }
  }
  // Network filters can legitimately contain `##` inside a URL fragment; treat as cosmetic only
  // when the domain part looks like a domain list.
  if (best >= 0 && /^[a-z0-9.,~*\-_\[\]]*$/i.test(raw.slice(0, best)) && !raw.startsWith('@@') && !raw.startsWith('||') && !raw.startsWith('|')) {
    return parseCosmetic(raw, best, bestSep, opts);
  }
  if (raw.includes('$$') || raw.includes('$@$')) return { type: 'skip', reason: 'html-filter', raw };
  return parseNetwork(raw, opts);
}

/** Evaluate `!#if` preprocessor directives used by uBO / AdGuard lists. */
export function preprocess(text: string, env: Record<string, boolean>): string[] {
  const out: string[] = [];
  const stack: boolean[] = [];
  const evalExpr = (expr: string): boolean => {
    // Supports !, &&, || and parentheses.
    const tokens = expr.match(/!|&&|\|\||\(|\)|[a-z0-9_]+/gi) ?? [];
    let pos = 0;
    const parseOr = (): boolean => {
      let v = parseAnd();
      while (tokens[pos] === '||') {
        pos++;
        const r = parseAnd();
        v = v || r;
      }
      return v;
    };
    const parseAnd = (): boolean => {
      let v = parseUnary();
      while (tokens[pos] === '&&') {
        pos++;
        const r = parseUnary();
        v = v && r;
      }
      return v;
    };
    const parseUnary = (): boolean => {
      const t = tokens[pos++];
      if (t === '!') return !parseUnary();
      if (t === '(') {
        const v = parseOr();
        pos++;
        return v;
      }
      return env[t ?? ''] ?? false;
    };
    return parseOr();
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('!#if ')) {
      stack.push(evalExpr(line.slice(5)));
      continue;
    }
    if (line.startsWith('!#else')) {
      if (stack.length) stack[stack.length - 1] = !stack[stack.length - 1];
      continue;
    }
    if (line.startsWith('!#endif')) {
      stack.pop();
      continue;
    }
    if (stack.every(Boolean)) out.push(line);
  }
  return out;
}

export const PREPROCESSOR_ENV: Record<string, boolean> = {
  ext_ublock: true,
  ext_ubol: true,
  env_chromium: true,
  env_mv3: true,
  cap_user_stylesheet: true,
  adguard: false,
  adguard_ext_chromium: false,
  env_firefox: false,
  env_safari: false,
  env_mobile: false,
  env_legacy: false,
  cap_html_filtering: false,
  ext_abp: false,
  false: false,
};
