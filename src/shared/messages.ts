/** Messages exchanged between content scripts / UI pages and the service worker. */

export interface TabStats {
  host: string;
  blocked: number;
  ads: number;
  trackers: number;
  popups: number;
  cosmetic: number;
  skippedVideoAds: number;
}

export interface LogEntry {
  t: number;
  tabId: number;
  url: string;
  type: string;
  kind: 'ad' | 'tracker' | 'popup' | 'cosmetic' | 'redirect' | 'malware' | 'video';
  initiator?: string;
}

export interface GlobalStats {
  since: number;
  total: number;
  ads: number;
  trackers: number;
  popups: number;
  cosmetic: number;
  videoAds: number;
  /** Estimated bytes saved. */
  bytes: number;
  /** YYYY-MM-DD → blocked that day. */
  daily: Record<string, number>;
  /** Blocked request hosts → count (top N kept). */
  domains: Record<string, number>;
  /** Sites (top frame hosts) → count (top N kept). */
  sites: Record<string, number>;
}

export type Message =
  | { type: 'getPopupState'; tabId: number }
  | { type: 'toggleSite'; host: string; paused: boolean }
  | { type: 'getStats' }
  | { type: 'resetStats' }
  | { type: 'settingsChanged' }
  | { type: 'userFiltersChanged' }
  | { type: 'insertCSS'; css: string }
  | { type: 'removeCSS'; css: string }
  | { type: 'genericSelectors'; tokens: string[]; rulesets?: string[] }
  | { type: 'cosmeticHits'; count: number }
  | { type: 'popupBlocked'; url: string; reason: string }
  | { type: 'videoAdSkipped'; site: 'youtube' | 'twitch' }
  | { type: 'openPicker'; tabId: number; mode: 'picker' | 'zapper' }
  | { type: 'pickerResult'; host: string; selector: string }
  | { type: 'addUserFilter'; filter: string }
  | { type: 'getLog'; tabId?: number }
  | { type: 'getBuildInfo' }
  | { type: 'checkHotfix' }
  | { type: 'allowOnce'; host: string }
  | { type: 'getBlockedUrl' }
  | { type: 'reportIssue'; url: string; note: string };

export interface PopupState {
  tabId: number;
  url: string;
  host: string;
  paused: boolean;
  supported: boolean;
  stats: TabStats;
  totals: GlobalStats;
  settings: import('./constants').Settings;
  isBrave: boolean;
}

export const send = <T = unknown>(msg: Message): Promise<T> => chrome.runtime.sendMessage(msg) as Promise<T>;
