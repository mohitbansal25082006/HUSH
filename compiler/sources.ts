/** Upstream filter lists compiled into each HUSH ruleset. */
export interface ListSource {
  id: string;
  url: string;
  /** `hosts` = hosts-file format (`0.0.0.0 domain`). */
  format?: 'abp' | 'hosts';
  /** Trusted lists may use trusted-* scriptlets and generic scriptlets. */
  trusted?: boolean;
  /** Local file path (relative to repo root) instead of a URL. */
  file?: string;
}

const UBO = 'https://ublockorigin.github.io/uAssets/filters';
const AG = 'https://filters.adtidy.org/extension/ublock/filters';

export const SOURCES: Record<string, ListSource[]> = {
  'hush-ads': [
    { id: 'hush', url: '', file: 'filters/hush.txt', trusted: true },
    { id: 'easylist', url: 'https://easylist.to/easylist/easylist.txt' },
    { id: 'ubo-filters', url: `${UBO}/filters.txt`, trusted: true },
    { id: 'ubo-quick-fixes', url: `${UBO}/quick-fixes.txt`, trusted: true },
    { id: 'ubo-unbreak', url: `${UBO}/unbreak.txt`, trusted: true },
    { id: 'adguard-base', url: `${AG}/2.txt` },
  ],
  'hush-privacy': [
    { id: 'easyprivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
    { id: 'ubo-privacy', url: `${UBO}/privacy.txt`, trusted: true },
  ],
  'hush-malware': [
    { id: 'ubo-badware', url: `${UBO}/badware.txt`, trusted: true },
    { id: 'ubo-resource-abuse', url: `${UBO}/resource-abuse.txt`, trusted: true },
    { id: 'urlhaus', url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt' },
  ],
  'hush-annoyances': [
    { id: 'ubo-annoyances-cookies', url: `${UBO}/annoyances-cookies.txt`, trusted: true },
    { id: 'ubo-annoyances-others', url: `${UBO}/annoyances-others.txt`, trusted: true },
    { id: 'adguard-cookies', url: `${AG}/18.txt` },
    { id: 'adguard-popups', url: `${AG}/19.txt` },
    { id: 'adguard-mobile-app-banners', url: `${AG}/20.txt` },
    { id: 'adguard-other-annoyances', url: `${AG}/21.txt` },
    { id: 'adguard-widgets', url: `${AG}/22.txt` },
    { id: 'easylist-cookie', url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt' },
  ],
  'hush-hosts': [
    {
      id: 'peter-lowe',
      url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext',
      format: 'hosts',
    },
  ],
  'hush-mobile': [{ id: 'adguard-mobile', url: `${AG}/11.txt` }],
  'hush-region-in': [{ id: 'indianlist', url: 'https://easylist-downloads.adblockplus.org/indianlist.txt' }],
  'hush-region-de': [{ id: 'easylist-germany', url: 'https://easylist.to/easylistgermany/easylistgermany.txt' }],
  'hush-region-fr': [{ id: 'liste-fr', url: 'https://easylist-downloads.adblockplus.org/liste_fr.txt' }],
  'hush-region-es': [{ id: 'easylist-spanish', url: 'https://easylist-downloads.adblockplus.org/easylistspanish.txt' }],
  'hush-region-ru': [{ id: 'ruadlist', url: 'https://easylist-downloads.adblockplus.org/ruadlist.txt' }],
  'hush-region-cn': [{ id: 'easylist-china', url: 'https://easylist-downloads.adblockplus.org/easylistchina.txt' }],
  'hush-region-jp': [{ id: 'adguard-japanese', url: `${AG}/7.txt` }],
};
