(function() {
  'use strict';
  // Stand-in for FingerprintJS v3: load() resolves to an agent whose visitorId is fixed.
  const result = { visitorId: '74cc6d0b0f4a6fb7cb8ae0f8a4f9c3b1', confidence: { score: 0.5 }, components: {}, version: '3.4.2' };
  const agent = { get: () => Promise.resolve(result) };
  const FingerprintJS = { load: () => Promise.resolve(agent), hashComponents: () => result.visitorId, componentsToDebugString: () => '' };
  window.FingerprintJS = FingerprintJS;
})();
