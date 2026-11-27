import { expect, it } from 'vitest';
import { hasRemoteCodeLoader } from '../../compiler/check-store-build';
import { compileRuntimeFilters } from '../../src/background/runtime-filters';

it('detects remote loaders in generated scriptlet arguments and repackaged workers', () => {
  const scriptlet = 'const ARGS = ' + JSON.stringify([[
    'script', 'pattern', 'const script = document.createElement("script"); script.src = "https://example.com/entry.js";',
  ]]);
  expect(hasRemoteCodeLoader('scriptlets/example.js', scriptlet)).toBe(true);
  expect(hasRemoteCodeLoader('worker.js', 'new Worker(URL.createObjectURL(new Blob([code],{type:"text/javascript"})))')).toBe(true);
  expect(hasRemoteCodeLoader('popup.html', '<script type="module" src="//example.com/main.js"></script>')).toBe(true);
  expect(hasRemoteCodeLoader('popup.html', '<script type="module" src="/chunks/popup.js"></script>')).toBe(false);
  expect(hasRemoteCodeLoader('background.js', 'const response = fetch("https://example.com/filters.json");')).toBe(false);
});

it('applies only network and ordinary element-hiding rules from hotfixes', () => {
  const filters = [
    '||ads.example.com^',
    'example.com##.ad',
    'example.com##.ad:has-text(sponsored)',
    'example.com##+js(set-constant, canRunAds, true)',
    'example.com#@#+js()',
  ].join('\n');
  const hotfix = compileRuntimeFilters(filters, 'hotfix');
  expect(hotfix.counts).toEqual({ network: 1, cosmetic: 1, scriptlets: 0, popups: 0 });
  expect(hotfix.scriptlets).toEqual([]);
  expect(hotfix.noScriptletHosts).toEqual([]);
  expect(compileRuntimeFilters(filters, 'user').scriptlets).toHaveLength(1);
});

it('rejects every alias of the removed script text insertion mechanism', () => {
  const names = ['rpnt', 'replace-node-text', 'trusted-rpnt', 'trusted-replace-node-text'];
  const filters = names.map((name) => `example.com##+js(${name}, script, pattern, replacement)`).join('\n');
  const compiled = compileRuntimeFilters(filters, 'user');
  expect(compiled.scriptlets).toEqual([]);
  expect(compiled.errors).toHaveLength(names.length);
});
