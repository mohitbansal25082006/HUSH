/** Shared between the build-time compiler and the extension runtime. Keep dependency free. */

export type ProtectionLevel = 'balanced' | 'strict' | 'ninja';

export interface RulesetInfo {
  id: string;
  name: string;
  description: string;
  group: 'core' | 'extra' | 'regional';
  /** Levels at which this ruleset is enabled by default. Regional sets are opt-in. */
  levels: ProtectionLevel[];
  /** Browser language prefixes for which a regional list is suggested during onboarding. */
  languages?: string[];
}

export const RULESETS: RulesetInfo[] = [
  {
    id: 'hush-ads',
    name: 'Ads',
    description: 'EasyList, uBlock filters, AdGuard Base and HUSH’s own YouTube, Twitch & social filters.',
    group: 'core',
    levels: ['balanced', 'strict', 'ninja'],
  },
  {
    id: 'hush-privacy',
    name: 'Trackers & privacy',
    description: 'EasyPrivacy and uBlock Privacy — analytics, fingerprinting, beacons and tracking pixels.',
    group: 'core',
    levels: ['balanced', 'strict', 'ninja'],
  },
  {
    id: 'hush-malware',
    name: 'Malware, scams & miners',
    description: 'uBlock Badware risks, URLhaus malicious URLs and resource-abuse (crypto miners).',
    group: 'core',
    levels: ['balanced', 'strict', 'ninja'],
  },
  {
    id: 'hush-annoyances',
    name: 'Annoyances & cookie banners',
    description: 'Cookie notices, newsletter popups, “open in app” banners, social widgets and chat bubbles.',
    group: 'core',
    levels: ['balanced', 'strict', 'ninja'],
  },
  {
    id: 'hush-hosts',
    name: 'Ad server blocklist',
    description: 'Peter Lowe’s ad and tracking server list — blocks entire ad-serving domains.',
    group: 'extra',
    levels: ['strict', 'ninja'],
  },
  {
    id: 'hush-mobile',
    name: 'Mobile & extra ads',
    description: 'AdGuard Mobile Ads filter — catches ad networks that mostly target mobile sites.',
    group: 'extra',
    levels: ['strict', 'ninja'],
  },
  { id: 'hush-region-in', name: 'India', description: 'IndianList — ads on Indian websites (Hindi, Tamil, Telugu, Bengali…).', group: 'regional', levels: [], languages: ['hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'en-IN'] },
  { id: 'hush-region-de', name: 'Germany', description: 'EasyList Germany.', group: 'regional', levels: [], languages: ['de'] },
  { id: 'hush-region-fr', name: 'France', description: 'Liste FR.', group: 'regional', levels: [], languages: ['fr'] },
  { id: 'hush-region-es', name: 'Spanish', description: 'EasyList Spanish.', group: 'regional', levels: [], languages: ['es'] },
  { id: 'hush-region-ru', name: 'Russia', description: 'RU AdList.', group: 'regional', levels: [], languages: ['ru', 'uk', 'be'] },
  { id: 'hush-region-cn', name: 'China', description: 'EasyList China.', group: 'regional', levels: [], languages: ['zh'] },
  { id: 'hush-region-jp', name: 'Japan', description: 'AdGuard Japanese filter.', group: 'regional', levels: [], languages: ['ja'] },
];

export function rulesetsForLevel(level: ProtectionLevel): string[] {
  return RULESETS.filter((r) => r.levels.includes(level)).map((r) => r.id);
}

export interface Settings {
  enabled: boolean;
  level: ProtectionLevel;
  /** Explicit ruleset on/off state (overrides level defaults once the user touches it). */
  rulesets: Record<string, boolean>;
  popupGuard: boolean;
  strictPopups: boolean;
  overlayKiller: boolean;
  cookieAutoReject: boolean;
  blockNotificationPrompts: boolean;
  youtube: boolean;
  twitch: boolean;
  stripTracking: boolean;
  cosmetic: boolean;
  scriptlets: boolean;
  hotfixes: boolean;
  badge: boolean;
  theme: 'auto' | 'dark' | 'light';
  motion: 'full' | 'reduced';
  onboarded: boolean;
  /** Where signed hotfixes are fetched from. Empty = not set up. */
  hotfixUrl: string;
}

/**
 * Default hotfix channel (signed filter deltas fetched every few hours). Empty until you host
 * hotfix/hotfix.json somewhere; it can also be set from Dashboard → Filter lists.
 * For local development: `npm run hotfix:serve` and use http://localhost:8787/hotfix.json
 */
export const HOTFIX_URL = '';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  level: 'balanced',
  rulesets: Object.fromEntries(RULESETS.map((r) => [r.id, r.levels.includes('balanced')])),
  popupGuard: true,
  strictPopups: true,
  overlayKiller: true,
  cookieAutoReject: true,
  blockNotificationPrompts: true,
  youtube: true,
  twitch: true,
  stripTracking: true,
  cosmetic: true,
  scriptlets: true,
  hotfixes: true,
  badge: true,
  theme: 'auto',
  motion: 'full',
  onboarded: false,
  hotfixUrl: HOTFIX_URL,
};

/** Number of buckets used to shard the cosmetic database in chrome.storage.local. */
export const HOST_BUCKETS = 512;

/** chrome.storage.local keys. */
export const KEYS = {
  settings: 'settings',
  allowlist: 'allowlist',
  userFilters: 'userFilters',
  stats: 'stats',
  hotfix: 'hotfix',
  cosmeticVersion: 'cosVersion',
  /** Runtime cosmetic DB (user filters + hotfixes) — small, read on every page. */
  runtimeCosmetic: 'c:rt',
  /** `c:<rulesetId>:s:<bucket>` — host specific cosmetics. */
  spec: (rid: string, bucket: number) => `c:${rid}:s:${bucket}`,
  /** `c:<rulesetId>:x` — complex generic selectors applied everywhere. */
  complex: (rid: string) => `c:${rid}:x`,
  /** Global per-host exceptions & flags, shared by every ruleset. */
  exceptions: (bucket: number) => `c:_:e:${bucket}`,
} as const;

/** Bit flags in cosmetic exception entries. */
export const FLAG = {
  generichide: 1,
  elemhide: 2,
  specifichide: 4,
  noscriptlets: 8,
} as const;

/** Query parameters stripped from navigations when "Strip tracking parameters" is on. */
export const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name',
  'utm_cid', 'utm_reader', 'utm_viz_id', 'utm_pubreferrer', 'utm_swu', 'fbclid', 'gclid', 'gclsrc',
  'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid', 'mc_eid', 'yclid', 'ysclid', '_hsenc', '_hsmi',
  'mkt_tok', 'igshid', 'igsh', 'twclid', 'ttclid', 'li_fat_id', 'epik', 'oly_anon_id', 'oly_enc_id',
  '__s', 'vero_id', 'rb_clickid', 's_cid', 'srsltid', 'si', 'ref_src', 'ref_url',
];

export const HOTFIX_INTERVAL_MINUTES = 360;
