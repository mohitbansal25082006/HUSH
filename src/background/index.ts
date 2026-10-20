/**
 * HUSH service worker.
 *
 * Blocking itself never depends on this worker being alive: network rules live in DNR, cosmetic
 * data in storage (read directly by content scripts) and scriptlets are registered content
 * scripts. The worker only (re)configures those, counts statistics and runs the popup guard.
 */
import { KEYS, RULESETS, HOTFIX_INTERVAL_MINUTES, type Settings } from '../shared/constants';
import type { Message, PopupState } from '../shared/messages';
import { getAllowlist, getSettings, getUserFilters, hostOf, isAllowlisted, saveSettings, setAllowlist, setUserFilters } from '../shared/storage';
import { applyDynamicRules, applyStaticRulesets, allowHostForSession, rulesetIndex } from './rules';
import { genericSelectorsFor, syncCosmeticStore, warmGeneric } from './cosmetic';
import { injectRuntimeScriptlets, syncContentScripts, type RuntimeScriptlet } from './scriptlets';
import { compileRuntimeFilters, storeRuntimeCosmetic, type CompiledRuntime } from './runtime-filters';
import {
  addLogListener, countCosmetic, countPopup, countVideoAd, forgetTab, getLog, installStatsListeners,
  loadTotals, resetTab, resetTotals, setBadgeEnabled, tabStats,
} from './stats';
import { configurePopupGuard, installPopupGuard } from './popup-guard';
import { checkHotfix, getHotfix } from './hotfix';

let runtimeScriptlets: RuntimeScriptlet[] = [];
let lastCompiled: CompiledRuntime | null = null;
const blockedUrls = new Map<number, string>();

/* ------------------------------------------------------------------------------------------ */
/* Configuration pipeline                                                                      */
/* ------------------------------------------------------------------------------------------ */

let running: Promise<void> | null = null;
let again = false;

/**
 * Re-apply every piece of configuration. Calls are coalesced: while a run is in flight, any
 * number of new requests result in exactly one follow-up run.
 */
function reconfigure(reason: string): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try {
        await doReconfigure(reason);
      } catch (e) {
        console.error('[HUSH] reconfigure failed', e);
      }
    } while (again);
    running = null;
  })();
  return running;
}

async function compileRuntime(): Promise<CompiledRuntime> {
  const [user, hotfix, settings] = await Promise.all([getUserFilters(), getHotfix(), getSettings()]);
  // Hotfixes are fetched data: compiled untrusted, so they can never smuggle code into pages.
  const hot = settings.hotfixes && hotfix?.filters ? compileRuntimeFilters(hotfix.filters, false) : null;
  const mine = compileRuntimeFilters(user, true);
  const merged: CompiledRuntime = {
    network: [...(hot?.network ?? []), ...mine.network],
    cosmetic: { hosts: { ...(hot?.cosmetic.hosts ?? {}) }, generic: [...(hot?.cosmetic.generic ?? []), ...mine.cosmetic.generic] },
    scriptlets: [...(hot?.scriptlets ?? []), ...mine.scriptlets],
    popups: [...(hot?.popups ?? []), ...mine.popups],
    noScriptletHosts: [...(hot?.noScriptletHosts ?? []), ...mine.noScriptletHosts],
    errors: mine.errors,
    counts: mine.counts,
  };
  for (const [host, entry] of Object.entries(mine.cosmetic.hosts)) {
    const target = (merged.cosmetic.hosts[host] ??= {});
    for (const k of ['h', 'p', 's', 'x'] as const) if (entry[k]) target[k] = [...(target[k] ?? []), ...entry[k]!];
    if (entry.f) target.f = (target.f ?? 0) | entry.f;
  }
  return merged;
}

async function doReconfigure(reason: string) {
  const t0 = performance.now();
  const [settings, allowlist] = await Promise.all([getSettings(), getAllowlist()]);
  const compiled = await compileRuntime();
  lastCompiled = compiled;
  runtimeScriptlets = settings.enabled && settings.scriptlets ? compiled.scriptlets : [];

  // Per-step timings are kept for diagnostics (visible in storage.session.lastConfigure).
  const steps: Record<string, number> = {};
  let mark = performance.now();
  const step = (name: string) => {
    const now = performance.now();
    steps[name] = Math.round(now - mark);
    mark = now;
  };
  step('compile');
  const staticResult = await applyStaticRulesets(settings);
  step('static');
  const dynamicResult = await applyDynamicRules(settings, allowlist, compiled.network);
  step('dynamic');
  await storeRuntimeCosmetic(compiled.cosmetic);
  await syncCosmeticStore(settings, RULESETS.map((r) => r.id));
  step('cosmetic');
  const scriptResult = await syncContentScripts(settings, allowlist, compiled.noScriptletHosts);
  step('scripts');
  configurePopupGuard(settings.enabled && settings.popupGuard, allowlist, compiled.popups);
  setBadgeEnabled(settings.badge && settings.enabled);
  await chrome.action.setBadgeBackgroundColor({ color: settings.enabled ? '#7c5cff' : '#5b5f73' });
  await chrome.storage.session
    .set({ lastConfigure: { at: Date.now(), reason, ms: Math.round(performance.now() - t0), steps, staticResult, dynamicResult, scriptResult } })
    .catch(() => {});
}

/** Called synchronously from the background entrypoint so every listener is registered on wake-up. */
export function startBackground(): void {
  /* ------------------------------------------------------------------------------------------ */
  /* Lifecycle                                                                                   */
  /* ------------------------------------------------------------------------------------------ */

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      const lang = navigator.language || 'en';
      const settings = await getSettings();
      // Suggest regional lists that match the browser language.
      for (const r of RULESETS) {
        if (r.group === 'regional' && r.languages?.some((l) => lang === l || lang.startsWith(`${l}-`) || lang.startsWith(l))) {
          settings.rulesets[r.id] = true;
        }
      }
      await saveSettings({ rulesets: settings.rulesets });
      chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
    }
    createContextMenus();
    chrome.alarms.create('hotfix', { periodInMinutes: HOTFIX_INTERVAL_MINUTES, delayInMinutes: 1 });
    await reconfigure(`installed:${details.reason}`);
  });

  chrome.runtime.onStartup.addListener(() => {
    void reconfigure('startup');
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'hotfix') return;
    const settings = await getSettings();
    if (!settings.hotfixes || !settings.hotfixUrl) return;
    const { updated } = await checkHotfix(settings.hotfixUrl);
    if (updated) await reconfigure('hotfix');
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEYS.settings] || changes[KEYS.allowlist] || changes[KEYS.userFilters]) void reconfigure('storage');
  });

  /* ------------------------------------------------------------------------------------------ */
  /* Tabs & navigation                                                                           */
  /* ------------------------------------------------------------------------------------------ */

  chrome.webNavigation.onCommitted.addListener(async (d) => {
    const host = hostOf(d.url);
    if (d.frameId === 0) resetTab(d.tabId, host);
    if (!host || runtimeScriptlets.length === 0) return;
    const allowlist = await getAllowlist();
    if (isAllowlisted(host, allowlist)) return;
    void injectRuntimeScriptlets(d.tabId, d.frameId, host, runtimeScriptlets);
  });

  chrome.webNavigation.onBeforeNavigate.addListener((d) => {
    if (d.frameId === 0 && /^https?:/.test(d.url)) blockedUrls.set(d.tabId, d.url);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    forgetTab(tabId);
    blockedUrls.delete(tabId);
  });

  /* ------------------------------------------------------------------------------------------ */
  /* Context menus & commands                                                                    */
  /* ------------------------------------------------------------------------------------------ */

  function createContextMenus() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'hush-picker', title: 'Block element…', contexts: ['all'] });
      chrome.contextMenus.create({ id: 'hush-zapper', title: 'Zap element (temporary)', contexts: ['all'] });
      chrome.contextMenus.create({ id: 'hush-sep', type: 'separator', contexts: ['all'] });
      chrome.contextMenus.create({ id: 'hush-pause', title: 'Pause HUSH on this site', contexts: ['all'] });
    });
  }

  async function openPicker(tabId: number, mode: 'picker' | 'zapper') {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: (m: string) => ((window as unknown as { __hushPickerMode: string }).__hushPickerMode = m), args: [mode] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/picker.js'] });
    } catch (e) {
      console.warn('[HUSH] picker injection failed', e);
    }
  }

  async function toggleSite(host: string, paused: boolean) {
    const list = await getAllowlist();
    const next = paused ? [...list, host] : list.filter((h) => h !== host && !host.endsWith(`.${h}`));
    await setAllowlist(next);
    await reconfigure('allowlist');
  }

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    if (info.menuItemId === 'hush-picker') void openPicker(tab.id, 'picker');
    else if (info.menuItemId === 'hush-zapper') void openPicker(tab.id, 'zapper');
    else if (info.menuItemId === 'hush-pause') {
      const host = hostOf(tab.url);
      if (host) {
        await toggleSite(host, true);
        chrome.tabs.reload(tab.id);
      }
    }
  });

  chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    if (command === 'open-picker') void openPicker(tab.id, 'picker');
    if (command === 'open-zapper') void openPicker(tab.id, 'zapper');
  });

  /* ------------------------------------------------------------------------------------------ */
  /* Messaging                                                                                   */
  /* ------------------------------------------------------------------------------------------ */

  async function isBrave(): Promise<boolean> {
    const nav = navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } };
    try {
      return !!(nav.brave && (await nav.brave.isBrave()));
    } catch {
      return false;
    }
  }

  async function handle(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
    const tabId = sender.tab?.id ?? -1;
    switch (msg.type) {
      case 'getPopupState': {
        const tab = await chrome.tabs.get(msg.tabId).catch(() => null);
        const url = tab?.url ?? '';
        const host = hostOf(url);
        const [settings, allowlist, totals] = await Promise.all([getSettings(), getAllowlist(), loadTotals()]);
        const state: PopupState = {
          tabId: msg.tabId,
          url,
          host,
          paused: isAllowlisted(host, allowlist),
          supported: !!host,
          stats: tabStats(msg.tabId),
          totals,
          settings,
          isBrave: await isBrave(),
        };
        return state;
      }
      case 'toggleSite':
        await toggleSite(msg.host, msg.paused);
        return true;
      case 'getStats':
        return loadTotals();
      case 'resetStats':
        await resetTotals();
        return true;
      case 'settingsChanged':
      case 'userFiltersChanged':
        await reconfigure(msg.type);
        return { errors: lastCompiled?.errors ?? [], counts: lastCompiled?.counts };
      case 'insertCSS':
        if (tabId < 0) return false;
        await chrome.scripting.insertCSS({ target: { tabId, frameIds: [sender.frameId ?? 0] }, css: msg.css, origin: 'USER' });
        return true;
      case 'removeCSS':
        if (tabId < 0) return false;
        await chrome.scripting.removeCSS({ target: { tabId, frameIds: [sender.frameId ?? 0] }, css: msg.css, origin: 'USER' }).catch(() => {});
        return true;
      case 'genericSelectors':
        return genericSelectorsFor(msg.tokens, await getSettings());
      case 'cosmeticHits':
        if (tabId >= 0) await countCosmetic(tabId, msg.count);
        return true;
      case 'popupBlocked':
        if (tabId >= 0) await countPopup(tabId, msg.url);
        return true;
      case 'videoAdSkipped':
        if (tabId >= 0) await countVideoAd(tabId, sender.tab?.url ?? '');
        return true;
      case 'openPicker':
        await openPicker(msg.tabId, msg.mode);
        return true;
      case 'pickerResult':
      case 'addUserFilter': {
        const line = msg.type === 'pickerResult' ? `${msg.host}##${msg.selector}` : msg.filter;
        const text = await getUserFilters();
        const lines = text.split('\n');
        if (!lines.includes(line)) {
          await setUserFilters(`${text.replace(/\n*$/, '')}${text.trim() ? '\n' : ''}${line}\n`);
        }
        return true;
      }
      case 'getLog':
        return getLog(msg.tabId);
      case 'getBuildInfo': {
        const [build, index, hotfix, dyn] = await Promise.all([
          fetch(chrome.runtime.getURL('data/build.json')).then((r) => r.json()).catch(() => null),
          rulesetIndex(),
          getHotfix(),
          chrome.declarativeNetRequest.getDynamicRules(),
        ]);
        const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
        let available = 0;
        try {
          available = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
        } catch {
          /* older Chrome */
        }
        return { build, index, enabled, hotfix, dynamicRules: dyn.length, availableStatic: available, version: chrome.runtime.getManifest().version };
      }
      case 'checkHotfix': {
        const res = await checkHotfix((await getSettings()).hotfixUrl);
        if (res.updated) await reconfigure('hotfix-manual');
        return res;
      }
      case 'allowOnce':
        await allowHostForSession(msg.host);
        return true;
      case 'getBlockedUrl': {
        const id = sender.tab?.id ?? -1;
        return blockedUrls.get(id) ?? '';
      }
      case 'reportIssue':
        return true;
    }
  }

  chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    handle(msg, sender).then(sendResponse, (e) => {
      console.warn('[HUSH] message failed', msg.type, e);
      sendResponse(null);
    });
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'logger') addLogListener(port);
  });

  /* ------------------------------------------------------------------------------------------ */
  /* Boot                                                                                        */
  /* ------------------------------------------------------------------------------------------ */

  installStatsListeners();
  installPopupGuard();
  // Each wake-up: make sure the popup guard knows the current allowlist / runtime popup filters.
  void (async () => {
    const [settings, allowlist]: [Settings, string[]] = await Promise.all([getSettings(), getAllowlist()]);
    setBadgeEnabled(settings.badge && settings.enabled);
    if (settings.enabled && settings.cosmetic) warmGeneric(settings);
    if (!lastCompiled) {
      const compiled = await compileRuntime();
      lastCompiled = compiled;
      runtimeScriptlets = settings.enabled && settings.scriptlets ? compiled.scriptlets : [];
      configurePopupGuard(settings.enabled && settings.popupGuard, allowlist, compiled.popups);
    }
  })();
}
