(function() {
  'use strict';
  const init = new WeakSet();
  const push = function(...args) {
    for (const ins of document.querySelectorAll('ins.adsbygoogle')) {
      if (init.has(ins)) continue;
      init.add(ins);
      ins.setAttribute('data-adsbygoogle-status', 'done');
      ins.setAttribute('data-ad-status', 'unfilled');
      ins.style.setProperty('display', 'none', 'important');
    }
    return args.length;
  };
  const existing = window.adsbygoogle;
  window.adsbygoogle = { loaded: true, push };
  if (Array.isArray(existing)) for (const item of existing) push(item);
})();
