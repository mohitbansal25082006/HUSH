/**
 * Blocking statistics, the live request logger and the toolbar badge.
 *
 * DNR does not report matches to packed extensions, so blocked requests are observed through
 * webRequest.onErrorOccurred (net::ERR_BLOCKED_BY_CLIENT) and redirects to our own resources
 * through webRequest.onBeforeRedirect. Both listeners are passive (non-blocking).
 */
import type { GlobalStats, LogEntry, TabStats } from '../shared/messages';
import { KEYS } from '../shared/constants';
import { formatCount, hostOf } from '../shared/storage';

const TOP_N = 300;
const LOG_PER_TAB = 400;
const LOG_GLOBAL = 1000;
/** Rough average transfer size of a blocked ad / tracker request, used for "data saved". */
const AVG_BYTES: Record<string, number> = {
  script: 42_000, image: 18_000, sub_frame: 95_000, xmlhttprequest: 3_000, media: 250_000,
  stylesheet: 12_000, font: 30_000, ping: 500, other: 4_000,
};

const TRACKER_RE = /analytic|track|pixel|beacon|metric|telemetry|collect|stats?\b|\blog\b|events?\.|insight|measure|scorecard|segment|hotjar|clarity|mixpanel|amplitude|fullstory|optimizely|quantserve|chartbeat|newrelic|nr-data|sentry|datadog|matomo|piwik|tagmanager|gtag|fbevents|connect\.facebook|bat\.bing|ads-twitter|snap\.licdn|clarity\.ms/i;

const tabs = new Map<number, TabStats>();
const tabLogs = new Map<number, LogEntry[]>();
const globalLog: LogEntry[] = [];
const listeners = new Set<chrome.runtime.Port>();

let totals: GlobalStats | null = null;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let badgeEnabled = true;
const badgeTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const emptyTabStats = (host = ''): TabStats => ({ host, blocked: 0, ads: 0, trackers: 0, popups: 0, cosmetic: 0, skippedVideoAds: 0 });

export function emptyTotals(): GlobalStats {
  return { since: Date.now(), total: 0, ads: 0, trackers: 0, popups: 0, cosmetic: 0, videoAds: 0, bytes: 0, daily: {}, domains: {}, sites: {} };
}

export async function loadTotals(): Promise<GlobalStats> {
  if (!totals) {
    const { [KEYS.stats]: s } = await chrome.storage.local.get(KEYS.stats);
    totals = { ...emptyTotals(), ...(s ?? {}) };
    // Restore per-tab counters after a service-worker restart.
    try {
      const { tabStats } = await chrome.storage.session.get('tabStats');
      if (tabStats) for (const [id, st] of Object.entries(tabStats as Record<string, TabStats>)) if (!tabs.has(+id)) tabs.set(+id, st);
    } catch {
      /* session storage unavailable */
    }
  }
  return totals!;
}

export function setBadgeEnabled(on: boolean) {
  badgeEnabled = on;
  if (!on) chrome.action.setBadgeText({ text: '' }).catch(() => {});
}

function trim(map: Record<string, number>) {
  const keys = Object.keys(map);
  if (keys.length <= TOP_N * 1.5) return map;
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, TOP_N));
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = undefined;
    if (!dirty || !totals) return;
    dirty = false;
    totals.domains = trim(totals.domains);
    totals.sites = trim(totals.sites);
    const days = Object.keys(totals.daily).sort();
    if (days.length > 90) for (const d of days.slice(0, days.length - 90)) delete totals.daily[d];
    await chrome.storage.local.set({ [KEYS.stats]: totals });
    try {
      await chrome.storage.session.set({ tabStats: Object.fromEntries(tabs) });
    } catch {
      /* ignore */
    }
  }, 1500);
}

function updateBadge(tabId: number) {
  if (!badgeEnabled || tabId < 0) return;
  if (badgeTimers.has(tabId)) return;
  badgeTimers.set(
    tabId,
    setTimeout(() => {
      badgeTimers.delete(tabId);
      const st = tabs.get(tabId);
      const n = st ? st.blocked + st.popups + st.cosmetic : 0;
      chrome.action.setBadgeText({ tabId, text: n ? formatCount(n) : '' }).catch(() => {});
    }, 250),
  );
}

export function tabStats(tabId: number): TabStats {
  return tabs.get(tabId) ?? emptyTabStats();
}

export function resetTab(tabId: number, host: string) {
  tabs.set(tabId, emptyTabStats(host));
  tabLogs.delete(tabId);
  updateBadge(tabId);
}

export function forgetTab(tabId: number) {
  tabs.delete(tabId);
  tabLogs.delete(tabId);
}

function ensureTab(tabId: number): TabStats {
  let st = tabs.get(tabId);
  if (!st) {
    st = emptyTabStats();
    tabs.set(tabId, st);
  }
  return st;
}

function pushLog(entry: LogEntry) {
  globalLog.push(entry);
  if (globalLog.length > LOG_GLOBAL) globalLog.splice(0, globalLog.length - LOG_GLOBAL);
  if (entry.tabId >= 0) {
    let l = tabLogs.get(entry.tabId);
    if (!l) tabLogs.set(entry.tabId, (l = []));
    l.push(entry);
    if (l.length > LOG_PER_TAB) l.splice(0, l.length - LOG_PER_TAB);
  }
  for (const port of listeners) {
    try {
      port.postMessage({ type: 'log', entry });
    } catch {
      listeners.delete(port);
    }
  }
}

export function getLog(tabId?: number): LogEntry[] {
  return tabId === undefined ? globalLog.slice() : (tabLogs.get(tabId) ?? []).slice();
}

export function addLogListener(port: chrome.runtime.Port) {
  listeners.add(port);
  port.onDisconnect.addListener(() => listeners.delete(port));
}

const today = () => new Date().toISOString().slice(0, 10);

async function count(tabId: number, kind: LogEntry['kind'], url: string, type: string, initiator?: string) {
  const t = await loadTotals();
  const st = ensureTab(tabId);
  const day = today();
  switch (kind) {
    case 'ad':
    case 'redirect':
    case 'malware':
      st.blocked++;
      st.ads++;
      t.ads++;
      break;
    case 'tracker':
      st.blocked++;
      st.trackers++;
      t.trackers++;
      break;
    case 'popup':
      st.popups++;
      t.popups++;
      break;
    case 'cosmetic':
      st.cosmetic++;
      t.cosmetic++;
      break;
    case 'video':
      st.skippedVideoAds++;
      t.videoAds++;
      break;
  }
  t.total++;
  t.daily[day] = (t.daily[day] ?? 0) + 1;
  if (kind !== 'cosmetic') {
    t.bytes += AVG_BYTES[type] ?? AVG_BYTES.other;
    const h = hostOf(url);
    if (h) t.domains[h] = (t.domains[h] ?? 0) + 1;
  }
  if (st.host) t.sites[st.host] = (t.sites[st.host] ?? 0) + 1;
  if (kind !== 'cosmetic') pushLog({ t: Date.now(), tabId, url, type, kind, initiator });
  updateBadge(tabId);
  scheduleSave();
}

/** Cosmetic hits are reported in batches by content scripts. */
export async function countCosmetic(tabId: number, n: number) {
  if (n <= 0) return;
  const t = await loadTotals();
  const st = ensureTab(tabId);
  st.cosmetic += n;
  t.cosmetic += n;
  t.total += n;
  const day = today();
  t.daily[day] = (t.daily[day] ?? 0) + n;
  if (st.host) t.sites[st.host] = (t.sites[st.host] ?? 0) + n;
  updateBadge(tabId);
  scheduleSave();
}

export const countPopup = (tabId: number, url: string) => count(tabId, 'popup', url, 'popup');
export const countVideoAd = (tabId: number, url: string) => count(tabId, 'video', url, 'media');

export async function resetTotals() {
  totals = emptyTotals();
  await chrome.storage.local.set({ [KEYS.stats]: totals });
}

export function installStatsListeners() {
  const filter = { urls: ['<all_urls>'] };
  const extOrigin = chrome.runtime.getURL('');

  chrome.webRequest.onErrorOccurred.addListener((d) => {
    if (d.error !== 'net::ERR_BLOCKED_BY_CLIENT') return;
    if (d.type === 'main_frame') return; // handled by the malware page / popup guard
    const kind = TRACKER_RE.test(d.url) || d.type === 'ping' ? 'tracker' : 'ad';
    void count(d.tabId, kind, d.url, d.type, d.initiator);
  }, filter);

  chrome.webRequest.onBeforeRedirect.addListener((d) => {
    if (!d.redirectUrl.startsWith(extOrigin) && !d.redirectUrl.startsWith('chrome-extension://')) return;
    if (d.type === 'main_frame') {
      if (d.redirectUrl.includes('blocked.html')) void count(d.tabId, 'malware', d.url, d.type);
      return;
    }
    void count(d.tabId, 'redirect', d.url, d.type, d.initiator);
  }, filter);
}
