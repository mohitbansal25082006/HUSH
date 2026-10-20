(function() {
  'use strict';
  // Stand-in for BlockAdBlock: always reports "no ad blocker".
  const noopfn = function() {};
  const Bab = function() {};
  Bab.prototype.check = noopfn;
  Bab.prototype.clearEvent = noopfn;
  Bab.prototype.emitEvent = noopfn;
  Bab.prototype.on = function(a, b) { if (!a) b(); return this; };
  Bab.prototype.onDetected = function() { return this; };
  Bab.prototype.onNotDetected = function(a) { a(); return this; };
  Bab.prototype.setOption = noopfn;
  const bab = new Bab();
  try { Object.defineProperty(window, 'BlockAdBlock', { get() { return Bab; }, set() {} }); } catch (e) { window.BlockAdBlock = Bab; }
  try { Object.defineProperty(window, 'blockAdBlock', { get() { return bab; }, set() {} }); } catch (e) { window.blockAdBlock = bab; }
  // nobab2: some sites look for a random global that holds the detector instance.
  for (const k of Object.keys(window)) {
    try { const v = window[k]; if (v && typeof v === 'object' && typeof v.onDetected === 'function' && v !== bab) window[k] = bab; } catch (e) {}
  }
})();
