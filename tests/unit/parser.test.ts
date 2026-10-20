import { describe, expect, it } from 'vitest';
import { parseFilter, preprocess, PREPROCESSOR_ENV, splitScriptletArgs, PRIORITY, urlFilterToRegex } from '../../src/filters/parser';
import { REDIRECTS } from '../../src/filters/redirects';
import { genericToken } from '../../src/filters/cosmetic-db';
import { hostAncestors } from '../../src/shared/hash';

const net = (line: string) => {
  const p = parseFilter(line, { redirects: REDIRECTS });
  if (p?.type !== 'network') throw new Error(`expected network, got ${p?.type}: ${JSON.stringify(p)}`);
  return p.rule;
};

describe('network filters', () => {
  it('turns host-only filters into requestDomains', () => {
    const r = net('||ads.example.com^');
    expect(r.condition).toEqual({ requestDomains: ['ads.example.com'] });
    expect(r.action.type).toBe('block');
    expect(r.priority).toBe(PRIORITY.block);
  });

  it('keeps url patterns', () => {
    expect(net('/banner/ads/*.gif').condition.urlFilter).toBe('/banner/ads/*.gif');
  });

  it('maps options', () => {
    const r = net('||cdn.example.com/ad.js$script,third-party,domain=a.com|~b.a.com');
    expect(r.condition.resourceTypes).toEqual(['script']);
    expect(r.condition.domainType).toBe('thirdParty');
    expect(r.condition.initiatorDomains).toEqual(['a.com']);
    expect(r.condition.excludedInitiatorDomains).toEqual(['b.a.com']);
  });

  it('handles exceptions and $document', () => {
    expect(net('@@||good.com^').action.type).toBe('allow');
    const doc = net('@@||good.com^$document');
    expect(doc.action.type).toBe('allowAllRequests');
    expect(doc.condition.resourceTypes).toEqual(['main_frame', 'sub_frame']);
  });

  it('gives $important a higher priority than exceptions', () => {
    expect(net('||x.com^$important').priority).toBeGreaterThan(net('@@||x.com^').priority);
  });

  it('converts redirects to bundled resources', () => {
    const r = net('||googletagservices.com/tag/js/gpt.js$script,redirect=googletagservices_gpt.js');
    expect(r.action.type).toBe('redirect');
    expect(r.action.redirect?.extensionPath).toBe('/web_accessible_resources/googletagservices_gpt.js');
    expect(r.priority).toBeGreaterThan(PRIORITY.block);
  });

  it('serves the IMA SDK stand-in so video players do not stall', () => {
    const r = net('||imasdk.googleapis.com/js/sdkloader/ima3.js$script,redirect=google-ima.js');
    expect(r.action.redirect?.extensionPath).toBe('/web_accessible_resources/google-ima.js');
  });

  it('supports redirect-rule, which never blocks on its own', () => {
    const r = net('||cdn.example.com/ads.js$script,redirect-rule=noopjs,domain=site.com');
    expect(r.action.type).toBe('redirect');
    expect(r.action.redirect?.extensionPath).toBe('/web_accessible_resources/noop.js');
    expect(parseFilter('||cdn.example.com/ads.js$redirect-rule=unknown-thing')?.type).toBe('skip');
    expect(parseFilter('@@||cdn.example.com/ads.js$redirect-rule=noopjs')?.type).toBe('skip');
  });

  it('keeps an unknown redirect as a block', () => {
    expect(net('||ads.example.com/x.js$script,redirect=not-a-resource').action.type).toBe('block');
  });

  it('expands entity domains', () => {
    const r = net('||ads.net^$domain=google.*');
    expect(r.condition.initiatorDomains).toContain('google.com');
    expect(r.condition.initiatorDomains).toContain('google.co.in');
  });

  it('supports removeparam', () => {
    const r = net('$removeparam=utm_source');
    expect(r.action.redirect?.transform?.queryTransform?.removeParams).toEqual(['utm_source']);
  });

  it('rejects regexes RE2 cannot run', () => {
    expect(parseFilter('/ad(?=s)/')?.type).toBe('skip');
    expect(net('/^https:\\/\\/[a-z]+\\.ads\\./').condition.regexFilter).toBe('^https:\\/\\/[a-z]+\\.ads\\.');
  });

  it('routes $popup filters to the popup guard', () => {
    const p = parseFilter('||popads.net^$popup');
    expect(p?.type).toBe('popup');
    if (p?.type === 'popup') expect(p.popup.host).toBe('popads.net');
  });

  it('reports badfilter targets', () => {
    const p = parseFilter('||x.com^$script,badfilter');
    expect(p).toMatchObject({ type: 'badfilter', target: '||x.com^$script' });
  });

  it('reports host flags', () => {
    expect(parseFilter('@@||site.com^$generichide')).toMatchObject({ type: 'hostflag', flag: { flag: 'generichide', hosts: ['site.com'] } });
  });

  it('skips options DNR cannot express', () => {
    expect(parseFilter('||x.com^$csp=script-src none')?.type).toBe('skip');
  });
});

describe('cosmetic filters', () => {
  it('parses hide filters with domains', () => {
    const p = parseFilter('example.com,~sub.example.com##.ad');
    expect(p).toMatchObject({ type: 'cosmetic', filter: { kind: 'hide', domains: ['example.com'], notDomains: ['sub.example.com'], body: '.ad' } });
  });

  it('detects procedural filters', () => {
    const p = parseFilter('x.com##div:has-text(Sponsored):upward(2)');
    expect(p).toMatchObject({ type: 'cosmetic', filter: { kind: 'procedural' } });
  });

  it('keeps native :has as plain css', () => {
    expect(parseFilter('x.com##div:has(> .ad)')).toMatchObject({ filter: { kind: 'hide' } });
  });

  it('parses :style()', () => {
    expect(parseFilter('x.com##body:style(overflow: auto !important)')).toMatchObject({ filter: { kind: 'style', body: 'body', style: 'overflow: auto !important' } });
  });

  it('parses scriptlets with quoted args', () => {
    const p = parseFilter("x.com##+js(set-constant, 'a.b', '1,2')", { trusted: true });
    expect(p).toMatchObject({ filter: { kind: 'scriptlet', body: 'set-constant', args: ['a.b', '1,2'] } });
  });

  it('refuses trusted scriptlets from untrusted lists', () => {
    expect(parseFilter('x.com##+js(trusted-set-cookie, a, b)')?.type).toBe('skip');
  });

  it('does not treat URL fragments as cosmetic', () => {
    expect(parseFilter('||example.com/page##anchor')?.type).toBe('network');
  });

  it('indexes generic selectors by token', () => {
    expect(genericToken('.ad-box > img')).toBe('.ad-box');
    expect(genericToken('div#sponsor')).toBe('#sponsor');
    expect(genericToken('[id^="ad-"]')).toBeNull();
  });
});

describe('helpers', () => {
  it('splits scriptlet args', () => {
    expect(splitScriptletArgs('a, b\\, c, /x,y/')).toEqual(['a', 'b, c', '/x', 'y/']);
    expect(splitScriptletArgs("'x, y', z")).toEqual(['x, y', 'z']);
  });

  it('evaluates preprocessor directives', () => {
    const out = preprocess('a\n!#if env_firefox\nb\n!#else\nc\n!#endif\n!#if env_chromium && !env_safari\nd\n!#endif', PREPROCESSOR_ENV);
    expect(out.filter(Boolean)).toEqual(['a', 'c', 'd']);
  });

  it('builds host ancestors', () => {
    expect(hostAncestors('a.b.example.com')).toEqual(['a.b.example.com', 'b.example.com', 'example.com']);
  });

  it('converts url filters to regex', () => {
    const re = new RegExp(urlFilterToRegex('||ads.com^'));
    expect(re.test('https://x.ads.com/a')).toBe(true);
    expect(re.test('https://ads.com.evil.org/')).toBe(false);
  });
});

describe('safety', () => {
  it('keeps `||name.` as an any-TLD prefix, never a bare domain', () => {
    const r = net('||revanced.$doc');
    expect(r.condition.requestDomains).toBeUndefined();
    expect(r.condition.urlFilter).toBe('||revanced.');
  });

  it('refuses unrestricted bare-TLD request domains', () => {
    expect(parseFilter('*$script,to=com')?.type).toBe('skip');
    expect(net('*$script,to=com,domain=piracy.example').condition.requestDomains).toEqual(['com']);
  });
});
