import { defineConfig } from 'wxt';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Rulesets are produced by `npm run filters` (compiler/build-filters.ts).
// The compiler writes a small index so the manifest always matches what is on disk.
function loadRulesets() {
  const index = resolve(__dirname, 'public/rulesets/index.json');
  if (!existsSync(index)) return [];
  const sets = JSON.parse(readFileSync(index, 'utf8')) as Array<{ id: string; enabled: boolean }>;
  return sets.map((s) => ({ id: s.id, enabled: s.enabled, path: `rulesets/${s.id}.json` }));
}

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string; homepage: string };

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  publicDir: 'public',
  outDir: '.output',
  // Branded Chrome ignores --load-extension, so dev mode only builds; load the folder once by hand.
  webExt: { disabled: true },
  manifest: {
    name: 'HUSH — Ad & Popup Blocker',
    short_name: 'HUSH',
    description:
      'Silence the web. Blocks ads, popups, popunders, trackers, YouTube & Twitch ads, cookie banners and anti-adblock walls.',
    version: pkg.version,
    homepage_url: pkg.homepage,
    minimum_chrome_version: '122',
    permissions: [
      'declarativeNetRequest',
      'scripting',
      'storage',
      'unlimitedStorage',
      'tabs',
      'webNavigation',
      'webRequest',
      'alarms',
      'contextMenus',
    ],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'HUSH' },
    declarative_net_request: { rule_resources: loadRulesets() },
    web_accessible_resources: [
      {
        resources: ['/web_accessible_resources/*', '/blocked.html'],
        matches: ['<all_urls>'],
        use_dynamic_url: true,
      },
    ],
    commands: {
      'open-picker': {
        suggested_key: { default: 'Alt+Shift+H' },
        description: 'Block an element on this page',
      },
      'open-zapper': {
        suggested_key: { default: 'Alt+Shift+Z' },
        description: 'Zap (temporarily remove) an element',
      },
    },
  },
});
