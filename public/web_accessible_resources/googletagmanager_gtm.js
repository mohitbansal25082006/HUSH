(function() {
  'use strict';
  const noopfn = function() {};
  const w = window;
  w.ga = w.ga || noopfn;
  const dl = w.dataLayer;
  if (dl instanceof Object === false) return;
  if (dl.hide instanceof Object && typeof dl.hide.end === 'function') { dl.hide.end(); dl.hide.end = function() {}; }
  if (typeof dl.push !== 'function') return;
  const doCallback = function(item) {
    if (item instanceof Object === false) return;
    if (typeof item.eventCallback !== 'function') return;
    setTimeout(item.eventCallback, 1);
    item.eventCallback = function() {};
  };
  dl.push = new Proxy(dl.push, { apply(target, thisArg, args) { doCallback(args[0]); return Reflect.apply(target, thisArg, args); } });
  if (Array.isArray(dl)) for (const item of dl.slice()) doCallback(item);
})();
