/**
 * Popup / popunder guard (service-worker side).
 *
 * New tabs and windows opened by pages are watched for a few seconds. If their URL — or any URL
 * in their redirect chain — matches a popup filter or a known popunder network, the tab is closed
 * before the ad finishes loading. The MAIN-world guard script handles window.open abuse in-page.
 */
import type { PopupFilter } from '../filters/parser';
import { hostOf, isAllowlisted } from '../shared/storage';
import { countPopup } from './stats';

interface PopupData {
  hosts: string[];
  rules: PopupFilter[];
  exceptions: PopupFilter[];
}

const WATCH_MS = 6000;

let hosts = new Set<string>();
let rules: Array<PopupFilter & { regex?: RegExp }> = [];
let exceptions: Array<PopupFilter & { regex?: RegExp }> = [];
let loaded: Promise<void> | null = null;
let runtimePopups: PopupFilter[] = [];

/** New tab id → { opener host, deadline } */
const watched = new Map<number, { openerTab: number; openerHost: string; until: number }>();

let state = { enabled: true, allowlist: [] as string[] };

export function configurePopupGuard(enabled: boolean, allowlist: string[], runtime: PopupFilter[]) {
  state = { enabled, allowlist };
  if (runtime !== runtimePopups) {
    runtimePopups = runtime;
    loaded = null;
  }
}

function compile(list: PopupFilter[]) {
  return list.map((p) => {
    let regex: RegExp | undefined;
    if (p.re) {
      try {
        regex = new RegExp(p.re, 'i');
      } catch {
        regex = undefined;
      }
    }
    return { ...p, regex };
  });
}

function load(): Promise<void> {
  if (!loaded) {
    loaded = fetch(chrome.runtime.getURL('data/popup.json'))
      .then((r) => r.json() as Promise<PopupData>)
      .catch(() => ({ hosts: [], rules: [], exceptions: [] }) as PopupData)
      .then((data) => {
        const all = [...data.rules, ...runtimePopups.filter((p) => !p.exception)];
        hosts = new Set([...data.hosts, ...all.filter((p) => p.host && !p.domains).map((p) => p.host!)]);
        rules = compile(all.filter((p) => !(p.host && !p.domains)));
        exceptions = compile([...data.exceptions, ...runtimePopups.filter((p) => p.exception)]);
      });
  }
  return loaded;
}

function matchesFilter(p: PopupFilter & { regex?: RegExp }, url: string, host: string, openerHost: string): boolean {
  if (p.domains && !p.domains.some((d) => openerHost === d || openerHost.endsWith(`.${d}`))) return false;
  if (p.notDomains && p.notDomains.some((d) => openerHost === d || openerHost.endsWith(`.${d}`))) return false;
  if (p.host) return host === p.host || host.endsWith(`.${p.host}`);
  return !!p.regex && p.regex.test(url);
}

function hostListed(host: string): boolean {
  for (let h = host; h; ) {
    if (hosts.has(h)) return true;
    const dot = h.indexOf('.');
    if (dot === -1) return false;
    h = h.slice(dot + 1);
  }
  return false;
}

/** Is this URL, opened as a popup from `openerHost`, an ad? */
export async function isPopupAd(url: string, openerHost: string): Promise<boolean> {
  await load();
  const host = hostOf(url);
  if (!host) return false;
  // Same-site popups (e.g. "open in new tab" on a news site) are never closed.
  const base = (h: string) => h.split('.').slice(-2).join('.');
  if (openerHost && base(host) === base(openerHost)) return false;
  if (exceptions.some((p) => matchesFilter(p, url, host, openerHost))) return false;
  if (hostListed(host)) return true;
  return rules.some((p) => matchesFilter(p, url, host, openerHost));
}

async function check(tabId: number, url: string | undefined) {
  const w = watched.get(tabId);
  if (!w || !url) return;
  if (Date.now() > w.until) {
    watched.delete(tabId);
    return;
  }
  if (!state.enabled || isAllowlisted(w.openerHost, state.allowlist)) return;
  if (await isPopupAd(url, w.openerHost)) {
    watched.delete(tabId);
    try {
      await chrome.tabs.remove(tabId);
      // Return focus to the page the user was actually on.
      chrome.tabs.update(w.openerTab, { active: true }).catch(() => {});
      void countPopup(w.openerTab, url);
    } catch {
      /* already closed */
    }
  }
}

export function installPopupGuard() {
  chrome.webNavigation.onCreatedNavigationTarget.addListener(async (d) => {
    let openerHost = '';
    try {
      const opener = await chrome.tabs.get(d.sourceTabId);
      openerHost = hostOf(opener.url);
    } catch {
      /* opener gone */
    }
    watched.set(d.tabId, { openerTab: d.sourceTabId, openerHost, until: Date.now() + WATCH_MS });
    void check(d.tabId, d.url);
  });
  chrome.webNavigation.onBeforeNavigate.addListener((d) => {
    if (d.frameId === 0 && watched.has(d.tabId)) void check(d.tabId, d.url);
  });
  chrome.webNavigation.onCommitted.addListener((d) => {
    if (d.frameId === 0 && watched.has(d.tabId)) void check(d.tabId, d.url);
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.url && watched.has(tabId)) void check(tabId, info.url);
  });
  chrome.tabs.onRemoved.addListener((tabId) => watched.delete(tabId));
}

