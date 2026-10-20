(function() {
  'use strict';
  const w = window;
  const noopfn = function() {};
  const _Q = (w.apstag && w.apstag._Q) || [];
  const apstag = {
    _Q,
    fetchBids(a, b) { if (typeof b === 'function') b([]); },
    init: noopfn, setDisplayBids: noopfn, targetingKeys: noopfn,
  };
  w.apstag = apstag;
  _Q.push = function(prefix, args) {
    try { if (prefix === 'f') apstag.fetchBids(...args); } catch (e) {}
  };
  for (const cmd of _Q) _Q.push(cmd);
})();
