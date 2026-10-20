(function() {
  'use strict';
  // Stand-in for fingerprintjs2: returns a fixed, meaningless fingerprint.
  const hash = '74cc6d0b0f4a6fb7cb8ae0f8a4f9c3b1';
  const components = [{ key: 'hush', value: true }];
  const Fp = function() {};
  Fp.get = function(opts, cb) { if (typeof opts === 'function') cb = opts; setTimeout(() => cb && cb(components)); };
  Fp.getPromise = function() { return Promise.resolve(components); };
  Fp.getV18 = function(opts, cb) { if (typeof opts === 'function') cb = opts; setTimeout(() => cb && cb(hash, components)); };
  Fp.x64hash128 = function() { return hash; };
  Fp.VERSION = '2.1.0';
  Fp.prototype.get = function(cb) { setTimeout(() => cb && cb(hash, components)); };
  window.Fingerprint2 = Fp;
})();
