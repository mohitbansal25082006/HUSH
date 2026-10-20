/** Static ruleset selection and dynamic / session rule management. */
import { PRIORITY, type DnrRule } from '../filters/parser';
import { TRACKING_PARAMS, type Settings } from '../shared/constants';

const DNR = chrome.declarativeNetRequest;

const ID_ALLOW_DOC = 2;
const ID_ALLOW_INIT = 3;
/** One rule per tracking parameter, ids 10..(10 + TRACKING_PARAMS.length). */
const ID_TRACKING_START = 10;
const ID_RUNTIME_START = 100;
/** Chrome allows 30k dynamic rules, of which 5k may be "unsafe" (redirect / modifyHeaders). */
const MAX_DYNAMIC = 29_000;
const MAX_UNSAFE = 4_800;

let indexCache: Array<{ id: string; rules: number }> | null = null;

export async function rulesetIndex(): Promise<Array<{ id: string; rules: number; regex: number; enabled: boolean }>> {
  if (!indexCache) {
    try {
      indexCache = await (await fetch(chrome.runtime.getURL('rulesets/index.json'))).json();
    } catch {
      indexCache = [];
    }
  }
  return indexCache as Array<{ id: string; rules: number; regex: number; enabled: boolean }>;
}

export async function applyStaticRulesets(settings: Settings): Promise<{ ok: boolean; error?: string }> {
  const index = await rulesetIndex();
  const available = new Set(index.map((r) => r.id));
  const want = settings.enabled ? Object.keys(settings.rulesets).filter((id) => settings.rulesets[id] && available.has(id)) : [];
  const current = await DNR.getEnabledRulesets();
  const enableRulesetIds = want.filter((id) => !current.includes(id));
  const disableRulesetIds = current.filter((id) => !want.includes(id));
  if (!enableRulesetIds.length && !disableRulesetIds.length) return { ok: true };
  try {
    await DNR.updateEnabledRulesets({ enableRulesetIds, disableRulesetIds });
    return { ok: true };
  } catch (e) {
    console.warn('[HUSH] updateEnabledRulesets failed', e);
    return { ok: false, error: String((e as Error).message ?? e) };
  }
}

function trackingRules(): chrome.declarativeNetRequest.Rule[] {
  // One small regex per parameter: a single big alternation exceeds Chrome's regex memory limit.
  return TRACKING_PARAMS.map((p, i) => ({
    id: ID_TRACKING_START + i,
    priority: PRIORITY.removeparam,
    action: {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { transform: { queryTransform: { removeParams: [p] } } },
    },
    condition: {
      regexFilter: `[?&]${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=`,
      resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
    },
  }));
}

function allowlistRules(sites: string[]): chrome.declarativeNetRequest.Rule[] {
  if (!sites.length) return [];
  return [
    {
      id: ID_ALLOW_DOC,
      priority: PRIORITY.userAllowlist,
      action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
      condition: {
        requestDomains: sites,
        resourceTypes: ['main_frame', 'sub_frame'] as chrome.declarativeNetRequest.ResourceType[],
      },
    },
    {
      id: ID_ALLOW_INIT,
      priority: PRIORITY.userAllowlist,
      action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
      condition: { initiatorDomains: sites },
    },
  ];
}

export async function applyDynamicRules(settings: Settings, allowlist: string[], runtime: DnrRule[]): Promise<{ added: number; dropped: number }> {
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  let dropped = 0;
  if (settings.enabled) {
    if (settings.stripTracking) rules.push(...trackingRules());
    rules.push(...allowlistRules(allowlist));
    let id = ID_RUNTIME_START;
    let unsafe = 0;
    for (const r of runtime) {
      const re = r.condition.regexFilter;
      if (re && !(await DNR.isRegexSupported({ regex: re, isCaseSensitive: !!r.condition.isUrlFilterCaseSensitive })).isSupported) {
        dropped++;
        continue;
      }
      if (rules.length >= MAX_DYNAMIC) {
        dropped++;
        continue;
      }
      if (r.action.type === 'redirect' || r.action.type === 'modifyHeaders') {
        if (unsafe >= MAX_UNSAFE) {
          dropped++;
          continue;
        }
        unsafe++;
      }
      rules.push({ ...(r as unknown as chrome.declarativeNetRequest.Rule), id: id++ });
    }
  }

  const existing = await DNR.getDynamicRules();
  try {
    await DNR.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id), addRules: rules });
    return { added: rules.length, dropped };
  } catch (e) {
    // One invalid rule rejects the whole batch: fall back to adding rules one by one.
    console.warn('[HUSH] dynamic rules batch failed, retrying individually', e);
    await DNR.updateDynamicRules({ removeRuleIds: (await DNR.getDynamicRules()).map((r) => r.id) });
    let added = 0;
    for (const rule of rules) {
      try {
        await DNR.updateDynamicRules({ addRules: [rule] });
        added++;
      } catch {
        dropped++;
      }
    }
    return { added, dropped };
  }
}

/** "Proceed anyway" from the malware warning page — allowed for this browser session only. */
export async function allowHostForSession(host: string): Promise<void> {
  const existing = await DNR.getSessionRules();
  const id = existing.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  await DNR.updateSessionRules({
    addRules: [
      {
        id,
        priority: PRIORITY.malwareDocument + 1,
        action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
        condition: { requestDomains: [host], resourceTypes: ['main_frame', 'sub_frame'] as chrome.declarativeNetRequest.ResourceType[] },
      },
    ],
  });
}
