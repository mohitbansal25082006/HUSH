(function() {
  'use strict';
  const noopfn = function() {};
  const Fab = function() {};
  Fab.prototype.check = noopfn;
  Fab.prototype.clearEvent = noopfn;
  Fab.prototype.emitEvent = noopfn;
  Fab.prototype.on = function(a, b) { if (!a) b(); return this; };
  Fab.prototype.onDetected = function() { return this; };
  Fab.prototype.onNotDetected = function(a) { a(); return this; };
  Fab.prototype.setOption = noopfn;
  Fab.prototype.options = { set: noopfn, get: noopfn };
  const fab = new Fab();
  for (const n of ['FuckAdBlock', 'BlockAdBlock', 'SniffAdBlock']) {
    try { Object.defineProperty(window, n, { get() { return Fab; }, set() {} }); } catch (e) { window[n] = Fab; }
  }
  for (const n of ['blockAdBlock', 'fuckAdBlock', 'sniffAdBlock']) {
    try { Object.defineProperty(window, n, { get() { return fab; }, set() {} }); } catch (e) { window[n] = fab; }
  }
})();
