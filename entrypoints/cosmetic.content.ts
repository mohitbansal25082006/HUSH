/**
 * HUSH cosmetic engine (isolated world, every frame, document_start).
 *
 * 1. One chrome.storage.local read pulls everything this hostname needs: settings, allowlist,
 *    host-specific selectors of every enabled ruleset, global exceptions and user filters.
 * 2. Hide CSS is applied instantly through a constructable stylesheet, then handed to the
 *    service worker which re-inserts it as a USER stylesheet (unremovable, invisible to the page)
 *    and the temporary sheet is dropped.
 * 3. A generic "surveyor" reports class/id tokens seen in the DOM and receives matching generic
 *    selectors. Procedural filters run only on sites that have them.
 */
import { DEFAULT_SETTINGS, FLAG, HOST_BUCKETS, KEYS, RULESETS, type Settings } from '../src/shared/constants';
import { bucketOf, hostAncestors } from '../src/shared/hash';
import { isAllowlisted } from '../src/shared/storage';
import type { HostEntry, RuntimeCosmeticDb } from '../src/filters/cosmetic-db';
import { applyProcedural, compileProcedural, type Compiled } from '../src/content/procedural';
import { startCookieAutoReject } from '../src/content/cookies';
import { startOverlayKiller } from '../src/content/overlay';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  main() {
    void boot();
  },
});

const send = (msg: unknown) => chrome.runtime.sendMessage(msg).catch(() => null);

function frameHost(): string {
  if (location.hostname) return location.hostname;
  try {
    return new URL(document.referrer || location.ancestorOrigins?.[0] || '').hostname;
  } catch {
    return '';
  }
}

async function boot() {
  const host = frameHost();
  if (!host) return;
  const ancestors = hostAncestors(host);
  const rids = RULESETS.map((r) => r.id);

  const keys: string[] = [KEYS.settings, KEYS.allowlist, KEYS.runtimeCosmetic];
  for (const a of ancestors) {
    const b = bucketOf(a, HOST_BUCKETS);
    keys.push(KEYS.exceptions(b));
    for (const rid of rids) keys.push(KEYS.spec(rid, b));
  }
  for (const rid of rids) keys.push(KEYS.complex(rid));

  let data: Record<string, unknown>;
  try {
    data = await chrome.storage.local.get(keys);
  } catch {
    return; // extension context invalidated
  }

  const settings: Settings = { ...DEFAULT_SETTINGS, ...((data[KEYS.settings] as Partial<Settings>) ?? {}) };
  const allowlist = (data[KEYS.allowlist] as string[]) ?? [];
  if (!settings.enabled) return;
  const topHost = (() => {
    try {
      return window.top === window ? host : new URL(location.ancestorOrigins?.[location.ancestorOrigins.length - 1] ?? '').hostname || host;
    } catch {
      return host;
    }
  })();
  if (isAllowlisted(host, allowlist) || isAllowlisted(topHost, allowlist)) return;

  const isTop = window.top === window;
  // The MAIN-world popup guard reports what it stopped through a DOM event.
  document.addEventListener('hush:popup', (e) => send({ type: 'popupBlocked', url: String((e as CustomEvent).detail ?? ''), reason: 'guard' }));
  // The Twitch shield reports stitched-in ads it swapped out (once per ad break).
  let lastTwitchAd = 0;
  document.addEventListener('hush:twitch-ad', () => {
    if (Date.now() - lastTwitchAd < 30_000) return;
    lastTwitchAd = Date.now();
    send({ type: 'videoAdSkipped', site: 'twitch' });
  });
  if (settings.cookieAutoReject && isTop) startCookieAutoReject();
  if (settings.overlayKiller && settings.popupGuard) {
    startOverlayKiller(() => send({ type: 'popupBlocked', url: location.href, reason: 'overlay' }));
  }
  if (!settings.cosmetic) return;

  /* ---------------- Gather selectors ---------------- */
  let flags = 0;
  const exceptions = new Set<string>();
  for (const a of ancestors) {
    const exc = (data[KEYS.exceptions(bucketOf(a, HOST_BUCKETS))] as Record<string, HostEntry> | null)?.[a];
    if (exc) {
      flags |= exc.f ?? 0;
      exc.x?.forEach((s) => exceptions.add(s));
    }
  }
  const rt = (data[KEYS.runtimeCosmetic] as RuntimeCosmeticDb | undefined) ?? { hosts: {}, generic: [] };
  for (const a of ancestors) {
    const e = rt.hosts[a];
    if (e) {
      flags |= e.f ?? 0;
      e.x?.forEach((s) => exceptions.add(s));
    }
  }
  if (flags & FLAG.elemhide) return;

  const hide = new Set<string>();
  const styles = new Set<string>();
  const procedural = new Set<string>();
  const addEntry = (e: HostEntry | undefined) => {
    if (!e) return;
    e.h?.forEach((s) => hide.add(s));
    e.s?.forEach((s) => styles.add(s));
    e.p?.forEach((s) => procedural.add(s));
  };
  if (!(flags & FLAG.specifichide)) {
    for (const a of ancestors) {
      const b = bucketOf(a, HOST_BUCKETS);
      for (const rid of rids) {
        if (!settings.rulesets[rid]) continue;
        addEntry((data[KEYS.spec(rid, b)] as Record<string, HostEntry> | null)?.[a]);
      }
    }
  }
  for (const a of ancestors) addEntry(rt.hosts[a]);

  const generic = !(flags & FLAG.generichide);
  if (generic) {
    for (const rid of rids) {
      if (!settings.rulesets[rid]) continue;
      (data[KEYS.complex(rid)] as string[] | undefined)?.forEach((s) => hide.add(s));
    }
    rt.generic.forEach((s) => hide.add(s));
  }
  for (const x of exceptions) {
    hide.delete(x);
    styles.delete(x);
    procedural.delete(x);
  }

  /* ---------------- Inject ---------------- */
  const injector = createInjector();
  const specificHide = [...hide];
  injector.add(specificHide.map((s) => `${s}{display:none!important}`).join('\n') + '\n' + [...styles].map(styleRule).join('\n'));
  const hits = createHitCounter(specificHide);

  /* ---------------- Procedural ---------------- */
  let compiled: Compiled[] = [];
  if (procedural.size) {
    const run = () => {
      if (!compiled.length) compiled = [...procedural].map(compileProcedural).filter((c): c is Compiled => !!c);
      const n = applyProcedural(compiled, (css) => injector.add(css));
      if (n) hits.add(n);
    };
    onDomReady(() => {
      run();
      observe(run, 120);
    });
  }

  /* ---------------- Generic surveyor ---------------- */
  if (generic) {
    const seen = new Set<string>();
    const pending = new Set<string>();
    const collect = (root: ParentNode) => {
      const els = root.querySelectorAll('[id],[class]');
      const visit = (el: Element) => {
        if (el.id) {
          const t = `#${el.id}`;
          if (!seen.has(t)) {
            seen.add(t);
            pending.add(t);
          }
        }
        const cl = el.classList;
        for (let i = 0; i < cl.length; i++) {
          const t = `.${cl[i]}`;
          if (!seen.has(t)) {
            seen.add(t);
            pending.add(t);
          }
        }
      };
      if (root instanceof Element) visit(root);
      els.forEach(visit);
    };
    let inflight = false;
    const flush = async () => {
      if (inflight || pending.size === 0) return;
      inflight = true;
      const tokens = [...pending].slice(0, 2000);
      tokens.forEach((t) => pending.delete(t));
      const sels = ((await send({ type: 'genericSelectors', tokens })) as string[] | null) ?? [];
      const fresh = sels.filter((s) => !hide.has(s) && !exceptions.has(s));
      if (fresh.length) {
        fresh.forEach((s) => hide.add(s));
        specificHide.push(...fresh);
        injector.add(fresh.map((s) => `${s}{display:none!important}`).join('\n'));
      }
      inflight = false;
      if (pending.size) void flush();
    };
    onDomReady(() => {
      collect(document);
      void flush();
      observe((added) => {
        for (const n of added) if (n instanceof Element) collect(n);
        void flush();
      }, 150);
    });
  }

  /* ---------------- Hit counting (for the badge & stats) ---------------- */
  onDomReady(() => setTimeout(() => hits.count(), 800));
  addEventListener('load', () => setTimeout(() => hits.count(), 1500), { once: true });
}

/* ------------------------------------------------------------------------------------------ */

function styleRule(rule: string): string {
  // `selector{decls}` — make every declaration important so the page cannot override it.
  const i = rule.indexOf('{');
  if (i === -1) return '';
  const decls = rule.slice(i + 1, rule.lastIndexOf('}')).split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => (d.includes('!important') ? d : `${d} !important`)).join(';');
  return `${rule.slice(0, i)}{${decls}}`;
}

function onDomReady(fn: () => void) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

/** MutationObserver with batching; the callback receives the added nodes since the last call. */
function observe(cb: (added: Node[]) => void, delay: number) {
  let buffer: Node[] = [];
  let timer = 0;
  const mo = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) buffer.push(n);
    if (!buffer.length || timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      const added = buffer;
      buffer = [];
      const go = () => cb(added);
      if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 300 });
      else go();
    }, delay);
  });
  mo.observe(document.documentElement ?? document, { childList: true, subtree: true });
}

/** Instant constructable stylesheet → swapped for an unremovable USER stylesheet by the worker. */
function createInjector() {
  const sheets: CSSStyleSheet[] = [];
  return {
    add(css: string) {
      if (!css.trim()) return;
      let sheet: CSSStyleSheet | null = null;
      try {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        sheets.push(sheet);
      } catch {
        sheet = null;
      }
      send({ type: 'insertCSS', css }).then((ok) => {
        if (ok && sheet) {
          document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
        }
      });
    },
  };
}

function createHitCounter(selectors: string[]) {
  let manual = 0;
  const counted = new WeakSet<Element>();
  const count = () => {
    let n = 0;
    for (let i = 0; i < selectors.length; i += 40) {
      const chunk = selectors.slice(i, i + 40);
      let els: NodeListOf<Element>;
      try {
        els = document.querySelectorAll(chunk.join(','));
      } catch {
        // An invalid selector in the chunk: fall back to one by one.
        const all: Element[] = [];
        for (const s of chunk) {
          try {
            document.querySelectorAll(s).forEach((e) => all.push(e));
          } catch {
            /* skip */
          }
        }
        els = all as unknown as NodeListOf<Element>;
      }
      els.forEach((e) => {
        if (!counted.has(e)) {
          counted.add(e);
          n++;
        }
      });
    }
    const delta = n + manual;
    manual = 0;
    if (delta > 0) send({ type: 'cosmeticHits', count: delta });
  };
  return {
    count,
    add(n: number) {
      manual += n;
      setTimeout(count, 500);
    },
  };
}
