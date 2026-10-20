(function() {
  'use strict';
  // Stand-in for Chartbeat: keeps pSUPERFLY calls from throwing.
  const noopfn = function() {};
  window.pSUPERFLY = { activity: noopfn, virtualPage: noopfn };
})();
