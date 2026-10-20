(function() {
  'use strict';
  const noopfn = function() {};
  const Tracker = function() {};
  const p = Tracker.prototype;
  p.get = noopfn; p.set = noopfn; p.send = noopfn;
  const w = window;
  const gaName = w.GoogleAnalyticsObject || 'ga';
  const gaQueue = w[gaName];
  const ga = function(...args) {
    if (args.length === 0) return;
    const a = args[args.length - 1];
    if (a instanceof Object && a.hitCallback instanceof Function) {
      try { a.hitCallback(); } catch (ex) {}
    } else if (a instanceof Function) {
      try { a(new Tracker()); } catch (ex) {}
    }
  };
  ga.create = function() { return new Tracker(); };
  ga.getByName = function() { return new Tracker(); };
  ga.getAll = function() { return [new Tracker()]; };
  ga.remove = noopfn;
  ga.loaded = true;
  w[gaName] = ga;
  const dl = w.dataLayer;
  if (dl instanceof Object) {
    if (dl.hide instanceof Object && typeof dl.hide.end === 'function') { dl.hide.end(); dl.hide.end = function() {}; }
    if (typeof dl.push === 'function') {
      const doCallback = function(item) {
        if (item instanceof Object === false) return;
        if (typeof item.eventCallback !== 'function') return;
        setTimeout(item.eventCallback, 1);
        item.eventCallback = function() {};
      };
      dl.push = new Proxy(dl.push, { apply(target, thisArg, args) { doCallback(args[0]); return Reflect.apply(target, thisArg, args); } });
      if (Array.isArray(dl)) for (const item of dl.slice()) doCallback(item);
    }
  }
  if (gaQueue instanceof Function && Array.isArray(gaQueue.q)) {
    for (const entry of gaQueue.q) ga(...entry);
  }
})();
