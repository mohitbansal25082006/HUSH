/** uBO / AdGuard redirect resource names → bundled HUSH resources. */
const R = '/web_accessible_resources/';

const resources: Record<string, string[]> = {
  'noop.js': ['noopjs', 'noop.js', 'noopjs.js', 'abp-resource:blank-js', 'blank-js', 'noop-js'],
  'noop.txt': ['nooptext', 'noop.txt', 'nooptext', 'blank-text', 'empty'],
  'noop.html': ['noopframe', 'noop.html', 'blank-html', 'noopframe.html'],
  'noop.css': ['noop.css', 'blank-css', 'noopcss'],
  'noop.json': ['noop.json', 'noopjson', 'empty.json'],
  '1x1.gif': ['1x1.gif', '1x1-transparent.gif', '1x1-transparent-gif', 'abp-resource:1x1-transparent-gif'],
  '2x2.png': ['2x2.png', '2x2-transparent.png', '2x2-transparent-png', 'abp-resource:2x2-transparent-png'],
  '3x2.png': ['3x2.png', '3x2-transparent.png', '3x2-transparent-png', 'abp-resource:3x2-transparent-png'],
  '32x32.png': ['32x32.png', '32x32-transparent.png', '32x32-transparent-png', 'abp-resource:32x32-transparent-png'],
  'noop-0.1s.mp3': ['noop-0.1s.mp3', 'noopmp3-0.1s', 'abp-resource:blank-mp3', 'blank-mp3', 'noop-1s.mp3'],
  'googlesyndication_adsbygoogle.js': ['googlesyndication_adsbygoogle.js', 'googlesyndication.com/adsbygoogle.js', 'googlesyndication-adsbygoogle'],
  'googletagservices_gpt.js': ['googletagservices_gpt.js', 'googletagservices.com/gpt.js', 'googletagservices-gpt'],
  'google-analytics_analytics.js': ['google-analytics_analytics.js', 'google-analytics.com/analytics.js', 'googletagmanager_gtag.js', 'googletagmanager.com/gtag.js', 'google-analytics-ga'],
  'google-analytics_ga.js': ['google-analytics_ga.js', 'google-analytics.com/ga.js'],
  'googletagmanager_gtm.js': ['googletagmanager_gtm.js', 'googletagmanager.com/gtm.js', 'googletagmanager-gtm'],
  'amazon_apstag.js': ['amazon_apstag.js', 'amazon-adsystem.com/aax2/amzn_ads.js', 'amazon-apstag', 'amazon_ads.js'],
  'scorecardresearch_beacon.js': ['scorecardresearch_beacon.js', 'scorecardresearch.com/beacon.js', 'scorecardresearch-beacon'],
  'prebid-ads.js': ['prebid-ads.js', 'prebid-ads'],
  'fuckadblock.js': ['fuckadblock.js-3.2.0', 'fuckadblock.js', 'nofab.js', 'nofab', 'fuckadblock'],
  'google-ima.js': ['google-ima.js', 'google-ima3', 'googlesyndication_ima3.js', 'ima3.js'],
  'nobab.js': ['nobab.js', 'nobab', 'nobab2.js', 'nobab2', 'bab-defuser.js'],
  'fingerprint2.js': ['fingerprint2.js', 'fingerprintjs2'],
  'fingerprint3.js': ['fingerprint3.js', 'fingerprintjs3'],
  'chartbeat.js': ['chartbeat.js', 'chartbeat'],
  'noop-vast2.xml': ['noopvast-2.0', 'noop-vast2.xml', 'empty-vast2'],
  'noop-vast3.xml': ['noopvast-3.0', 'noop-vast3.xml', 'empty-vast3'],
  'noop-vast4.xml': ['noopvast-4.0', 'noop-vast4.xml', 'empty-vast4'],
  'noop-vmap1.xml': ['noopvmap-1.0', 'noop-vmap1.0.xml', 'noop-vmap1.xml', 'empty-vmap1'],
};

export const REDIRECTS: Record<string, string> = {};
for (const [file, names] of Object.entries(resources)) {
  for (const n of names) REDIRECTS[n] = R + file;
}
