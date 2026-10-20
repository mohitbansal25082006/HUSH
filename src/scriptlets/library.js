/**
 * HUSH scriptlet library.
 *
 * Every function here is injected into web pages (MAIN world). Each one MUST be fully
 * self-contained: it is serialised with Function.prototype.toString(), so it cannot reference
 * anything outside its own body. Signatures follow uBlock Origin's scriptlet conventions so that
 * existing filter lists work unchanged.
 */

/* eslint-disable no-new-func, prefer-rest-params */

export function setConstant(chain = '', rawValue = '', ...extra) {
  if (!chain) return;
  const toValue = (v) => {
    switch (v) {
      case 'undefined': return undefined;
      case 'false': return false;
      case 'true': return true;
      case 'null': return null;
      case "''": case '': case 'emptyStr': return '';
      case '[]': case 'emptyArr': return [];
      case '{}': case 'emptyObj': return {};
      case 'noopFunc': return function () {};
      case 'trueFunc': return function () { return true; };
      case 'falseFunc': return function () { return false; };
      case 'throwFunc': return function () { throw new TypeError('hush'); };
      case 'noopCallbackFunc': return function () { return function () {}; };
      case 'NaN': return NaN;
      case 'Infinity': return Infinity;
      case '-1': return -1;
      case 'yes': return 'yes';
      case 'no': return 'no';
      default:
        if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
        if (/^'.*'$/.test(v) || /^".*"$/.test(v)) return v.slice(1, -1);
        return HUSH_UNSET;
    }
  };
  const HUSH_UNSET = Symbol('unset');
  const value = toValue(rawValue);
  if (value === HUSH_UNSET) return;
  const asCallback = extra.includes('asCallback');
  const finalValue = asCallback ? function () { return value; } : value;
  const trap = (owner, path) => {
    const dot = path.indexOf('.');
    if (dot === -1) {
      const prop = path;
      try {
        const desc = Object.getOwnPropertyDescriptor(owner, prop);
        if (desc && desc.configurable === false) {
          if ('value' in desc && desc.writable) owner[prop] = finalValue;
          return;
        }
        Object.defineProperty(owner, prop, {
          configurable: true,
          get() { return finalValue; },
          set() {},
        });
      } catch (e) {}
      return;
    }
    const head = path.slice(0, dot);
    const rest = path.slice(dot + 1);
    let current = owner[head];
    if (current instanceof Object || (typeof current === 'object' && current !== null)) {
      trap(current, rest);
      return;
    }
    // Parent does not exist yet: intercept its creation.
    try {
      Object.defineProperty(owner, head, {
        configurable: true,
        get() { return current; },
        set(v) {
          current = v;
          if (v instanceof Object) trap(v, rest);
        },
      });
    } catch (e) {}
  };
  trap(window, chain.replace(/^window\./, ''));
}

export function abortOnPropertyRead(chain = '') {
  if (!chain) return;
  const magic = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653).toString(36);
  const abort = () => { throw new ReferenceError(magic); };
  const onerror = window.onerror;
  window.onerror = function (msg, ...rest) {
    if (typeof msg === 'string' && msg.includes(magic)) return true;
    if (onerror instanceof Function) return onerror.call(this, msg, ...rest);
  };
  const trap = (owner, path) => {
    const dot = path.indexOf('.');
    if (dot === -1) {
      try { Object.defineProperty(owner, path, { get: abort, set() {} }); } catch (e) {}
      return;
    }
    const head = path.slice(0, dot);
    const rest = path.slice(dot + 1);
    let v = owner[head];
    if (v instanceof Object) { trap(v, rest); return; }
    try {
      Object.defineProperty(owner, head, {
        get() { return v; },
        set(a) { v = a; if (a instanceof Object) trap(a, rest); },
      });
    } catch (e) {}
  };
  trap(window, chain.replace(/^window\./, ''));
}

export function abortOnPropertyWrite(prop = '') {
  if (!prop) return;
  const magic = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653).toString(36);
  const onerror = window.onerror;
  window.onerror = function (msg, ...rest) {
    if (typeof msg === 'string' && msg.includes(magic)) return true;
    if (onerror instanceof Function) return onerror.call(this, msg, ...rest);
  };
  let owner = window;
  const parts = prop.replace(/^window\./, '').split('.');
  const last = parts.pop();
  for (const p of parts) { owner = owner[p]; if (!(owner instanceof Object)) return; }
  try {
    delete owner[last];
    Object.defineProperty(owner, last, { set() { throw new ReferenceError(magic); } });
  } catch (e) {}
}

export function abortCurrentScript(target = '', needle = '', context = '') {
  if (!target) return;
  const reText = (s) => {
    if (!s) return /^/;
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  };
  const reNeedle = reText(needle);
  const reContext = reText(context);
  const magic = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653).toString(36);
  const chain = target.replace(/^window\./, '').split('.');
  let owner = window;
  let prop;
  for (;;) {
    prop = chain.shift();
    if (chain.length === 0) break;
    if (!(prop in owner)) break;
    owner = owner[prop];
    if (!(owner instanceof Object)) return;
  }
  let value;
  let desc = Object.getOwnPropertyDescriptor(owner, prop);
  if (desc && desc.get !== undefined) return;
  value = owner[prop];
  const thisScript = document.currentScript;
  const validate = () => {
    const e = document.currentScript;
    if (!(e instanceof HTMLScriptElement)) return;
    if (e === thisScript) return;
    if (context && !reContext.test(e.src)) return;
    const text = e.src ? e.src : e.textContent;
    if (!reNeedle.test(text)) return;
    throw new ReferenceError(magic);
  };
  try {
    Object.defineProperty(owner, prop, {
      get() { validate(); return value; },
      set(a) { validate(); value = a; },
    });
  } catch (e) {}
  const onerror = window.onerror;
  window.onerror = function (msg, ...rest) {
    if (typeof msg === 'string' && msg.includes(magic)) return true;
    if (onerror instanceof Function) return onerror.call(this, msg, ...rest);
  };
}

export function abortOnStackTrace(chain = '', needle = '') {
  if (!chain || !needle) return;
  const m = /^\/(.+)\/([gimsu]*)$/.exec(needle);
  const re = m ? new RegExp(m[1], m[2]) : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const magic = 'hush' + Math.random().toString(36).slice(2);
  const check = () => {
    const stack = new Error().stack || '';
    if (re.test(stack)) throw new ReferenceError(magic);
  };
  const parts = chain.replace(/^window\./, '').split('.');
  let owner = window;
  while (parts.length > 1) { owner = owner[parts.shift()]; if (!(owner instanceof Object)) return; }
  const prop = parts[0];
  let v = owner[prop];
  try {
    Object.defineProperty(owner, prop, {
      get() { check(); return v; },
      set(a) { check(); v = a; },
    });
  } catch (e) {}
  const onerror = window.onerror;
  window.onerror = function (msg, ...rest) {
    if (typeof msg === 'string' && msg.includes(magic)) return true;
    if (onerror instanceof Function) return onerror.call(this, msg, ...rest);
  };
}

export function jsonPrune(rawPrune = '', rawNeeded = '', ...extra) {
  const prunePaths = rawPrune.split(/ +/).filter(Boolean);
  const neededPaths = rawNeeded.split(/ +/).filter(Boolean);
  if (prunePaths.length === 0) return;
  const has = (obj, path) => {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length; i++) {
      const k = parts[i];
      if (o === null || typeof o !== 'object') return false;
      if (k === '[]' || k === '*') {
        const tail = parts.slice(i + 1).join('.');
        for (const key of Object.keys(o)) if (!tail || has(o[key], tail)) return true;
        return false;
      }
      if (!(k in o)) return false;
      o = o[k];
    }
    return true;
  };
  const prune = (obj, path) => {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length; i++) {
      const k = parts[i];
      if (o === null || typeof o !== 'object') return false;
      const last = i === parts.length - 1;
      if (k === '[]' || k === '*') {
        const tail = parts.slice(i + 1).join('.');
        let done = false;
        for (const key of Object.keys(o)) {
          if (!tail) { delete o[key]; done = true; } else if (prune(o[key], tail)) done = true;
        }
        return done;
      }
      if (!(k in o)) return false;
      if (last) { delete o[k]; return true; }
      o = o[k];
    }
    return false;
  };
  const process = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (neededPaths.length && !neededPaths.every((p) => has(obj, p))) return obj;
    for (const p of prunePaths) {
      // `foo.bar` also prunes at any depth when prefixed with `[].` style wildcards.
      prune(obj, p);
    }
    return obj;
  };
  const nativeParse = JSON.parse;
  JSON.parse = new Proxy(nativeParse, {
    apply(target, thisArg, args) {
      return process(Reflect.apply(target, thisArg, args));
    },
  });
  const nativeJson = Response.prototype.json;
  Response.prototype.json = new Proxy(nativeJson, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args).then((o) => process(o));
    },
  });
}

export function jsonPruneFetchResponse(rawPrune = '', rawNeeded = '', ...extra) {
  const params = {};
  for (let i = 0; i < extra.length; i += 2) params[extra[i]] = extra[i + 1];
  const propsToMatch = params.propsToMatch || '';
  const prunePaths = rawPrune.split(/ +/).filter(Boolean);
  const neededPaths = rawNeeded.split(/ +/).filter(Boolean);
  const urlMatch = (url) => {
    if (!propsToMatch) return true;
    for (const tok of propsToMatch.split(/\s+/)) {
      const v = tok.replace(/^url:/, '');
      const m = /^\/(.+)\/([gimsu]*)$/.exec(v);
      if (m ? new RegExp(m[1], m[2]).test(url) : url.includes(v)) return true;
    }
    return false;
  };
  const del = (o, parts) => {
    if (o === null || typeof o !== 'object') return;
    const [k, ...rest] = parts;
    if (k === '[]' || k === '*') { for (const key of Object.keys(o)) rest.length ? del(o[key], rest) : delete o[key]; return; }
    if (!(k in o)) return;
    if (rest.length === 0) delete o[k]; else del(o[k], rest);
  };
  const has = (o, parts) => {
    for (const k of parts) { if (o === null || typeof o !== 'object' || !(k in o)) return false; o = o[k]; }
    return true;
  };
  const nativeFetch = window.fetch;
  window.fetch = new Proxy(nativeFetch, {
    apply(target, thisArg, args) {
      const p = Reflect.apply(target, thisArg, args);
      let url = '';
      try { url = args[0] instanceof Request ? args[0].url : String(args[0]); } catch (e) {}
      if (!urlMatch(url)) return p;
      return p.then((resp) => resp.clone().json().then((obj) => {
        if (neededPaths.length && !neededPaths.every((n) => has(obj, n.split('.')))) return resp;
        for (const pp of prunePaths) del(obj, pp.split('.'));
        const out = new Response(JSON.stringify(obj), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
        Object.defineProperty(out, 'url', { value: resp.url });
        Object.defineProperty(out, 'type', { value: resp.type });
        return out;
      }).catch(() => resp));
    },
  });
}

export function jsonPruneXhrResponse(rawPrune = '', rawNeeded = '', ...extra) {
  const params = {};
  for (let i = 0; i < extra.length; i += 2) params[extra[i]] = extra[i + 1];
  const propsToMatch = (params.propsToMatch || '').replace(/^url:/, '');
  const prunePaths = rawPrune.split(/ +/).filter(Boolean);
  const re = (() => { const m = /^\/(.+)\/([gimsu]*)$/.exec(propsToMatch); return m ? new RegExp(m[1], m[2]) : null; })();
  const match = (u) => !propsToMatch || (re ? re.test(u) : u.includes(propsToMatch));
  const del = (o, parts) => {
    if (o === null || typeof o !== 'object') return;
    const [k, ...rest] = parts;
    if (k === '[]' || k === '*') { for (const key of Object.keys(o)) rest.length ? del(o[key], rest) : delete o[key]; return; }
    if (!(k in o)) return;
    if (rest.length === 0) delete o[k]; else del(o[k], rest);
  };
  const urls = new WeakMap();
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    urls.set(this, String(url));
    return open.call(this, method, url, ...rest);
  };
  const getter = (name) => {
    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, name);
    if (!desc || !desc.get) return;
    Object.defineProperty(XMLHttpRequest.prototype, name, {
      configurable: true,
      get() {
        const v = desc.get.call(this);
        if (this.readyState !== 4 || !match(urls.get(this) || '')) return v;
        try {
          const obj = typeof v === 'string' ? JSON.parse(v) : v;
          if (obj === null || typeof obj !== 'object') return v;
          for (const pp of prunePaths) del(obj, pp.split('.'));
          return typeof v === 'string' ? JSON.stringify(obj) : obj;
        } catch (e) { return v; }
      },
    });
  };
  getter('response');
  getter('responseText');
}

export function preventFetch(pattern = '', responseBody = '', responseType = '') {
  const toRe = (s) => {
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  };
  const conditions = [];
  for (const tok of pattern.split(/\s+/).filter(Boolean)) {
    const i = tok.indexOf(':');
    if (i > 0 && /^[a-z]+$/.test(tok.slice(0, i))) conditions.push([tok.slice(0, i), toRe(tok.slice(i + 1))]);
    else conditions.push(['url', toRe(tok)]);
  }
  const body = responseBody === 'emptyObj' ? '{}' : responseBody === 'emptyArr' ? '[]' : responseBody === 'emptyStr' ? '' : responseBody;
  const nativeFetch = window.fetch;
  window.fetch = new Proxy(nativeFetch, {
    apply(target, thisArg, args) {
      let details = {};
      try {
        const r = args[0];
        details.url = r instanceof Request ? r.url : String(r);
        const init = args[1] || (r instanceof Request ? r : {});
        details.method = (init.method || 'GET').toString();
        details.body = init.body ? String(init.body) : '';
      } catch (e) { return Reflect.apply(target, thisArg, args); }
      const hit = conditions.length === 0 || conditions.every(([k, re]) => re.test(details[k] || ''));
      if (!hit) return Reflect.apply(target, thisArg, args);
      const resp = new Response(body, { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/plain' } });
      Object.defineProperty(resp, 'url', { value: details.url });
      if (responseType === 'opaque') Object.defineProperty(resp, 'type', { value: 'opaque' });
      return Promise.resolve(resp);
    },
  });
}

export function preventXhr(pattern = '', responseBody = '') {
  const toRe = (s) => {
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  };
  const conditions = pattern.split(/\s+/).filter(Boolean).map((tok) => {
    const i = tok.indexOf(':');
    return i > 0 && /^[a-z]+$/.test(tok.slice(0, i)) ? [tok.slice(0, i), toRe(tok.slice(i + 1))] : ['url', toRe(tok)];
  });
  const body = responseBody === 'emptyObj' ? '{}' : responseBody === 'emptyArr' ? '[]' : responseBody;
  const blocked = new WeakSet();
  const proto = XMLHttpRequest.prototype;
  const open = proto.open;
  const send = proto.send;
  proto.open = function (method, url, ...rest) {
    const d = { method: String(method), url: String(url) };
    if (conditions.length === 0 || conditions.every(([k, re]) => re.test(d[k] || ''))) blocked.add(this);
    return open.call(this, method, url, ...rest);
  };
  proto.send = function (...args) {
    if (!blocked.has(this)) return send.apply(this, args);
    const xhr = this;
    Object.defineProperties(xhr, {
      readyState: { value: 4 },
      status: { value: 200 },
      statusText: { value: 'OK' },
      response: { value: body },
      responseText: { value: body },
    });
    setTimeout(() => {
      xhr.dispatchEvent(new Event('readystatechange'));
      xhr.dispatchEvent(new Event('load'));
      xhr.dispatchEvent(new Event('loadend'));
    }, 1);
  };
}

export function noSetTimeoutIf(needle = '', delay = '') {
  const not = needle.startsWith('!');
  if (not) needle = needle.slice(1);
  const dnot = delay.startsWith('!');
  if (dnot) delay = delay.slice(1);
  const m = /^\/(.+)\/([gimsu]*)$/.exec(needle);
  const re = needle ? (m ? new RegExp(m[1], m[2]) : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
  const d = delay ? parseInt(delay, 10) : NaN;
  window.setTimeout = new Proxy(window.setTimeout, {
    apply(target, thisArg, args) {
      const [fn, ms] = args;
      const text = String(fn);
      let defuse = true;
      if (re) defuse = re.test(text) !== not;
      if (defuse && !isNaN(d)) defuse = (Number(ms) === d) !== dnot;
      if (defuse) args[0] = function () {};
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function noSetIntervalIf(needle = '', delay = '') {
  const not = needle.startsWith('!');
  if (not) needle = needle.slice(1);
  const dnot = delay.startsWith('!');
  if (dnot) delay = delay.slice(1);
  const m = /^\/(.+)\/([gimsu]*)$/.exec(needle);
  const re = needle ? (m ? new RegExp(m[1], m[2]) : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
  const d = delay ? parseInt(delay, 10) : NaN;
  window.setInterval = new Proxy(window.setInterval, {
    apply(target, thisArg, args) {
      const [fn, ms] = args;
      let defuse = true;
      if (re) defuse = re.test(String(fn)) !== not;
      if (defuse && !isNaN(d)) defuse = (Number(ms) === d) !== dnot;
      if (defuse) args[0] = function () {};
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function adjustSetTimeout(needle = '', delay = '1000', boost = '0.05') {
  const m = /^\/(.+)\/([gimsu]*)$/.exec(needle);
  const re = needle && needle !== '*' ? (m ? new RegExp(m[1], m[2]) : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
  const d = parseInt(delay, 10) || 1000;
  let b = parseFloat(boost);
  if (!(b >= 0.001 && b <= 50)) b = 0.05;
  window.setTimeout = new Proxy(window.setTimeout, {
    apply(target, thisArg, args) {
      if ((!re || re.test(String(args[0]))) && Number(args[1]) === d) args[1] = d * b;
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function adjustSetInterval(needle = '', delay = '1000', boost = '0.05') {
  const m = /^\/(.+)\/([gimsu]*)$/.exec(needle);
  const re = needle && needle !== '*' ? (m ? new RegExp(m[1], m[2]) : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
  const d = parseInt(delay, 10) || 1000;
  let b = parseFloat(boost);
  if (!(b >= 0.001 && b <= 50)) b = 0.05;
  window.setInterval = new Proxy(window.setInterval, {
    apply(target, thisArg, args) {
      if ((!re || re.test(String(args[0]))) && Number(args[1]) === d) args[1] = d * b;
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function addEventListenerDefuser(type = '', needle = '') {
  const toRe = (s) => {
    if (!s) return null;
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  };
  const reType = toRe(type);
  const reNeedle = toRe(needle);
  let unloadBlocked = false;
  try { unloadBlocked = document.featurePolicy ? !document.featurePolicy.allowsFeature('unload') : false; } catch (e) {}
  const proto = EventTarget.prototype;
  proto.addEventListener = new Proxy(proto.addEventListener, {
    apply(target, thisArg, args) {
      let t = '';
      let h = '';
      try { t = String(args[0]); h = String(args[1]); } catch (e) {}
      const hitType = !reType || reType.test(t);
      const hitNeedle = !reNeedle || reNeedle.test(h);
      if (hitType && hitNeedle) return;
      // Pages that forbid `unload` would log a policy violation against this proxy; the listener
      // would never fire there anyway.
      if (t === 'unload' && unloadBlocked) return;
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function noWindowOpenIf(pattern = '', delay = '', decoy = '') {
  const not = pattern.startsWith('!');
  if (not) pattern = pattern.slice(1);
  const m = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
  const re = pattern ? (m ? new RegExp(m[1], m[2]) : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
  window.open = new Proxy(window.open, {
    apply(target, thisArg, args) {
      const url = String(args[0] || '');
      const hit = !re || re.test(url) !== not;
      if (!hit) return Reflect.apply(target, thisArg, args);
      try { document.dispatchEvent(new CustomEvent('hush:popup', { detail: url })); } catch (e) {}
      if (decoy === 'obj' || decoy === 'blank') {
        return new Proxy({}, { get: (t, p) => (p === 'closed' ? false : typeof p === 'string' && /^(close|focus|blur|postMessage)$/.test(p) ? function () {} : null), set: () => true });
      }
      return null;
    },
  });
}

export function removeAttr(attrs = '', selector = '', behavior = '') {
  if (!attrs) return;
  const names = attrs.split(/\s*\|\s*/);
  const sel = selector || names.map((a) => `[${a}]`).join(',');
  const run = () => {
    try {
      for (const el of document.querySelectorAll(sel)) for (const a of names) el.removeAttribute(a);
    } catch (e) {}
  };
  const start = () => {
    run();
    let t = 0;
    new MutationObserver(() => { if (!t) t = setTimeout(() => { t = 0; run(); }, 50); })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: names });
  };
  if (document.readyState === 'loading' && behavior.includes('complete')) addEventListener('load', start, { once: true });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export function removeClass(classes = '', selector = '', behavior = '') {
  if (!classes) return;
  const names = classes.split(/\s*\|\s*/);
  const sel = selector || names.map((c) => `.${CSS.escape(c)}`).join(',');
  const run = () => {
    try { for (const el of document.querySelectorAll(sel)) el.classList.remove(...names); } catch (e) {}
  };
  const start = () => {
    run();
    let t = 0;
    new MutationObserver(() => { if (!t) t = setTimeout(() => { t = 0; run(); }, 50); })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export function setAttr(selector = '', attr = '', value = '') {
  if (!selector || !attr) return;
  if (!/^(|true|false|on|off|\d+|''|"")$/.test(value) && !value.startsWith('[')) return;
  const run = () => {
    try { for (const el of document.querySelectorAll(selector)) el.setAttribute(attr, value.replace(/^''|""$/, '')); } catch (e) {}
  };
  const start = () => {
    run();
    let t = 0;
    new MutationObserver(() => { if (!t) t = setTimeout(() => { t = 0; run(); }, 50); })
      .observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export function noEvalIf(needle = '') {
  const m = /^\/(.+)\/([gimsu]*)$/.exec(needle);
  const re = needle ? (m ? new RegExp(m[1], m[2]) : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
  window.eval = new Proxy(window.eval, {
    apply(target, thisArg, args) {
      if (!re || re.test(String(args[0]))) return;
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function preventRefresh(delay = '') {
  const run = () => {
    for (const meta of document.querySelectorAll('meta[http-equiv="refresh" i]')) meta.remove();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

export function disableNewtabLinks() {
  document.addEventListener('click', (ev) => {
    let el = ev.target;
    while (el && el.localName !== 'a') el = el.parentElement;
    if (el && el.getAttribute('target') === '_blank') el.removeAttribute('target');
  }, true);
}

export function setLocalStorageItem(key = '', value = '') {
  if (!key) return;
  const allowed = { undefined: undefined, false: 'false', true: 'true', null: 'null', '': '', emptyObj: '{}', emptyArr: '[]', '$remove$': null, yes: 'yes', no: 'no', on: 'on', off: 'off' };
  let v;
  if (value in allowed) v = allowed[value];
  else if (/^\d+$/.test(value)) v = value;
  else return;
  try {
    if (value === '$remove$' || v === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch (e) {}
}

export function setSessionStorageItem(key = '', value = '') {
  if (!key) return;
  const allowed = { false: 'false', true: 'true', null: 'null', '': '', emptyObj: '{}', emptyArr: '[]', yes: 'yes', no: 'no' };
  if (!(value in allowed) && !/^\d+$/.test(value)) return;
  try { sessionStorage.setItem(key, value in allowed ? allowed[value] : value); } catch (e) {}
}

export function setCookie(name = '', value = '', path = '/') {
  if (!name) return;
  const ok = /^(true|false|yes|no|y|n|ok|accept|reject|allow|deny|on|off|necessary|required|\d+|)$/i.test(value);
  if (!ok) return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path === 'none' ? '/' : path}; max-age=31536000; SameSite=Lax`;
}

export function trustedSetCookie(name = '', value = '', offset = '', path = '/') {
  if (!name) return;
  let v = value;
  if (v === '$now$') v = String(Date.now());
  else if (v === '$currentDate$') v = new Date().toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(v)}; path=${path || '/'}; max-age=31536000; SameSite=Lax`;
}

export function trustedSetLocalStorageItem(key = '', value = '') {
  if (!key) return;
  let v = value;
  if (v === '$now$') v = String(Date.now());
  else if (v === '$currentDate$') v = new Date().toISOString();
  else if (v === '$currentISODate$') v = new Date().toISOString();
  try { localStorage.setItem(key, v); } catch (e) {}
}

export function trustedSetConstant(chain = '', rawValue = '') {
  if (!chain) return;
  let value;
  try { value = JSON.parse(rawValue); } catch (e) { value = rawValue; }
  const parts = chain.replace(/^window\./, '').split('.');
  const trap = (owner, i) => {
    const prop = parts[i];
    if (i === parts.length - 1) {
      try { Object.defineProperty(owner, prop, { configurable: true, get: () => value, set() {} }); } catch (e) {}
      return;
    }
    let cur = owner[prop];
    if (cur instanceof Object) { trap(cur, i + 1); return; }
    try {
      Object.defineProperty(owner, prop, {
        configurable: true,
        get: () => cur,
        set(v) { cur = v; if (v instanceof Object) trap(v, i + 1); },
      });
    } catch (e) {}
  };
  trap(window, 0);
}

export function trustedReplaceFetchResponse(pattern = '', replacement = '', propsToMatch = '') {
  if (!pattern) return;
  const m = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
  const re = pattern === '*' ? /[\s\S]*/ : m ? new RegExp(m[1], m[2]) : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const pm = propsToMatch.replace(/^url:/, '');
  const pmm = /^\/(.+)\/([gimsu]*)$/.exec(pm);
  const urlRe = pm ? (pmm ? new RegExp(pmm[1], pmm[2]) : null) : null;
  const match = (u) => !pm || (urlRe ? urlRe.test(u) : u.includes(pm));
  const nativeFetch = window.fetch;
  window.fetch = new Proxy(nativeFetch, {
    apply(target, thisArg, args) {
      const p = Reflect.apply(target, thisArg, args);
      let url = '';
      try { url = args[0] instanceof Request ? args[0].url : String(args[0]); } catch (e) {}
      if (!match(url)) return p;
      return p.then((resp) => resp.clone().text().then((text) => {
        const out = new Response(text.replace(re, replacement), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
        Object.defineProperty(out, 'url', { value: resp.url });
        Object.defineProperty(out, 'type', { value: resp.type });
        return out;
      }).catch(() => resp));
    },
  });
}

export function trustedReplaceXhrResponse(pattern = '', replacement = '', propsToMatch = '') {
  if (!pattern) return;
  const m = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
  const re = pattern === '*' ? /[\s\S]*/ : m ? new RegExp(m[1], m[2]) : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const pm = propsToMatch.replace(/^url:/, '');
  const pmm = /^\/(.+)\/([gimsu]*)$/.exec(pm);
  const urlRe = pm && pmm ? new RegExp(pmm[1], pmm[2]) : null;
  const match = (u) => !pm || (urlRe ? urlRe.test(u) : u.includes(pm));
  const urls = new WeakMap();
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    urls.set(this, String(url));
    return open.call(this, method, url, ...rest);
  };
  for (const name of ['response', 'responseText']) {
    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, name);
    if (!desc || !desc.get) continue;
    Object.defineProperty(XMLHttpRequest.prototype, name, {
      configurable: true,
      get() {
        const v = desc.get.call(this);
        if (this.readyState !== 4 || typeof v !== 'string' || !match(urls.get(this) || '')) return v;
        return v.replace(re, replacement);
      },
    });
  }
}

export function trustedClickElement(selectors = '', extraMatch = '', delay = '') {
  if (!selectors) return;
  const list = selectors.split(/\s*,\s*(?![^[]*\])/).filter(Boolean);
  let i = 0;
  const wait = parseInt(delay, 10) || 0;
  const deadline = Date.now() + 10000;
  const step = () => {
    if (i >= list.length || Date.now() > deadline) return;
    const sel = list[i];
    let el = null;
    try {
      if (sel.includes(' >>> ')) {
        let root = document;
        for (const part of sel.split(' >>> ')) { el = root.querySelector(part); if (!el) break; root = el.shadowRoot || el; }
      } else el = document.querySelector(sel);
    } catch (e) { i = list.length; return; }
    if (el) { el.click(); i++; setTimeout(step, 50); return; }
    setTimeout(step, 200);
  };
  const go = () => setTimeout(step, wait);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
  else go();
}

export function spoofCss(selector = '', ...pairs) {
  if (!selector) return;
  const props = {};
  for (let i = 0; i < pairs.length; i += 2) props[pairs[i]] = pairs[i + 1];
  const native = window.getComputedStyle;
  window.getComputedStyle = new Proxy(native, {
    apply(target, thisArg, args) {
      const style = Reflect.apply(target, thisArg, args);
      const el = args[0];
      try { if (!(el instanceof Element) || !el.matches(selector)) return style; } catch (e) { return style; }
      return new Proxy(style, {
        get(t, p) {
          if (typeof p === 'string') {
            const k = p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
            if (k in props) return props[k];
          }
          const v = Reflect.get(t, p, t);
          return typeof v === 'function' ? v.bind(t) : v;
        },
      });
    },
  });
}

export function hrefSanitizer(selector = '', source = '') {
  if (!selector) return;
  const run = () => {
    for (const a of document.querySelectorAll(selector)) {
      let href = '';
      if (!source || source === 'text') href = a.textContent.trim();
      else if (source.startsWith('?')) { try { href = new URL(a.href).searchParams.get(source.slice(1)) || ''; } catch (e) {} }
      else if (source.startsWith('[')) href = a.getAttribute(source.slice(1, -1)) || '';
      if (/^https?:\/\//.test(href)) a.setAttribute('href', href);
    }
  };
  const start = () => { run(); new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export function preventAddEventListener(type = '', needle = '') {
  const toRe = (s) => {
    if (!s) return null;
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  };
  const rt = toRe(type);
  const rn = toRe(needle);
  const proto = EventTarget.prototype;
  proto.addEventListener = new Proxy(proto.addEventListener, {
    apply(target, thisArg, args) {
      if ((!rt || rt.test(String(args[0]))) && (!rn || rn.test(String(args[1])))) return;
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function preventRequestAnimationFrame(needle = '') {
  const not = needle.startsWith('!');
  if (not) needle = needle.slice(1);
  const m = /^\/(.+)\/([gimsu]*)$/.exec(needle);
  const re = needle ? (m ? new RegExp(m[1], m[2]) : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
  window.requestAnimationFrame = new Proxy(window.requestAnimationFrame, {
    apply(target, thisArg, args) {
      if (!re || re.test(String(args[0])) !== not) args[0] = function () {};
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function noWebrtc() {
  const rtc = window.RTCPeerConnection ? 'RTCPeerConnection' : window.webkitRTCPeerConnection ? 'webkitRTCPeerConnection' : '';
  if (!rtc) return;
  const Fake = function () {};
  Fake.prototype = { close() {}, createDataChannel() {}, createOffer() {}, setRemoteDescription() {}, toString() { return '[object RTCPeerConnection]'; } };
  window[rtc] = Fake;
}

export function removeNodeText(nodeName = '', includes = '', ...extra) {
  if (!nodeName) return;
  // uBO semantics: clear the whole text of matching nodes; stop at DOMContentLoaded unless `stay`.
  const toRe = (s, flags) => {
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  };
  const reNode = new RegExp('^' + nodeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i');
  const reText = includes ? toRe(includes, '') : null;
  const params = {};
  for (let i = 0; i < extra.length; i += 2) params[extra[i]] = extra[i + 1];
  // Script nodes on Trusted Types pages (YouTube, Google) only accept TrustedScript. Going
  // through a policy first avoids the violation Chrome logs for a plain (even caught) write.
  let policy = null;
  const setText = (node, text) => {
    const tt = window.trustedTypes;
    if (tt && node.nodeName === 'SCRIPT') {
      try {
        policy = policy || tt.createPolicy('hush-' + Math.random().toString(36).slice(2), { createScript: (s) => s });
        node.textContent = policy.createScript(text);
      } catch (e) {}
      return;
    }
    try { node.textContent = text; } catch (e) {}
  };
  const handle = (node) => {
    if (!reNode.test(node.nodeName)) return;
    const text = node.textContent || '';
    if (!text || (reText && !reText.test(text))) return;
    setText(node, '');
  };
  const obs = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      handle(n);
      if (n.querySelectorAll) for (const c of n.querySelectorAll('*')) handle(c);
    }
  });
  obs.observe(document, { childList: true, subtree: true });
  for (const n of document.querySelectorAll('*')) handle(n);
  if (params.stay === '1') return;
  const quit = () => obs.disconnect();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', quit, { once: true });
  else quit();
}

export function closeWindow(pathname = '') {
  const m = /^\/(.+)\/([gimsu]*)$/.exec(pathname);
  if (pathname && !(m ? new RegExp(m[1], m[2]) : new RegExp(pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).test(location.pathname)) return;
  try { window.close(); } catch (e) {}
}

export function replaceNodeText(nodeName = '', pattern = '', replacement = '', ...extra) {
  if (!nodeName || !pattern) return;
  // uBO semantics: extra args `condition`/`includes`, `excludes`, `sedCount` (stop after N
  // rewrites) and `stay` (keep watching after DOMContentLoaded).
  const toRe = (s, flags) => {
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  };
  const reNode = new RegExp('^' + nodeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i');
  const re = toRe(pattern, 'g');
  const params = {};
  for (let i = 0; i < extra.length; i += 2) params[extra[i]] = extra[i + 1];
  const cond = params.condition || params.includes ? toRe(params.condition || params.includes, '') : null;
  const excl = params.excludes ? toRe(params.excludes, '') : null;
  let left = Number(params.sedCount) || 0;
  let policy = null;
  const setText = (node, text) => {
    const tt = window.trustedTypes;
    if (tt && node.nodeName === 'SCRIPT') {
      try {
        policy = policy || tt.createPolicy('hush-' + Math.random().toString(36).slice(2), { createScript: (s) => s });
        node.textContent = policy.createScript(text);
      } catch (e) {}
      return;
    }
    try { node.textContent = text; } catch (e) {}
  };
  // Each node is rewritten once: our own write re-triggers the observer, and a replacement that
  // still matches the pattern would otherwise loop forever.
  const done = new WeakSet();
  let obs = null;
  const handle = (node) => {
    if (done.has(node) || !reNode.test(node.nodeName)) return;
    const text = node.textContent || '';
    if (!text || (cond && !cond.test(text)) || (excl && excl.test(text))) return;
    re.lastIndex = 0;
    if (!re.test(text)) return;
    re.lastIndex = 0;
    const next = text.replace(re, replacement);
    done.add(node);
    if (next === text) return;
    setText(node, next);
    if (left > 0 && --left === 0 && obs) obs.disconnect();
  };
  const visit = (n) => {
    if (n.nodeType === 3) {
      if (reNode.test('#text')) handle(n);
      else if (n.parentNode) handle(n.parentNode);
      return;
    }
    handle(n);
  };
  obs = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) visit(n);
  });
  obs.observe(document, { childList: true, subtree: true });
  if (document.readyState !== 'loading') for (const n of document.querySelectorAll('*')) handle(n);
  if (params.stay === '1') return;
  const quit = () => obs.disconnect();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', quit, { once: true });
  else quit();
}

export function removeCookie(needle = '') {
  const m = /^\/(.+)\/([gimsu]*)$/.exec(needle);
  const re = needle ? (m ? new RegExp(m[1], m[2]) : new RegExp('^' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')) : /^/;
  const run = () => {
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0].trim();
      if (!name || !re.test(name)) continue;
      const parts = location.hostname.split('.');
      for (let i = 0; i < parts.length - 1; i++) {
        const domain = parts.slice(i).join('.');
        document.cookie = `${name}=; Max-Age=-1000; path=/; domain=${domain}`;
        document.cookie = `${name}=; Max-Age=-1000; path=/; domain=.${domain}`;
      }
      document.cookie = `${name}=; Max-Age=-1000; path=/`;
      document.cookie = `${name}=; Max-Age=-1000`;
    }
  };
  run();
  window.addEventListener('beforeunload', run);
  document.addEventListener('visibilitychange', run);
}

export function noEval() {
  window.eval = new Proxy(window.eval, { apply() {} });
}

export function setCookieReload(name = '', value = '', path = '/') {
  if (!name) return;
  const ok = /^(true|false|yes|no|y|n|ok|accept|reject|allow|deny|on|off|necessary|required|\d+|)$/i.test(value);
  if (!ok) return;
  const current = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(encodeURIComponent(name) + '='));
  if (current && current.split('=')[1] === encodeURIComponent(value)) return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path === 'none' ? '/' : path}; max-age=31536000; SameSite=Lax`;
  const after = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(encodeURIComponent(name) + '='));
  if (after && after.split('=')[1] === encodeURIComponent(value)) location.reload();
}

export function trustedReplaceArgument(chain = '', argpos = '', argraw = '', ...extra) {
  if (!chain) return;
  const params = {};
  for (let i = 0; i < extra.length; i += 2) params[extra[i]] = extra[i + 1];
  const pos = parseInt(argpos || '0', 10);
  let value;
  if (argraw === 'undefined') value = undefined;
  else if (argraw === 'true') value = true;
  else if (argraw === 'false') value = false;
  else if (argraw === 'null') value = null;
  else if (argraw === 'noopFunc') value = function () {};
  else if (/^-?\d+$/.test(argraw)) value = Number(argraw);
  else if (argraw.startsWith('json:')) { try { value = JSON.parse(argraw.slice(5)); } catch (e) { return; } }
  else value = argraw;
  const cond = params.condition ? (() => { const c = /^\/(.+)\/([gimsu]*)$/.exec(params.condition); return c ? new RegExp(c[1], c[2]) : new RegExp(params.condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); })() : null;
  const parts = chain.replace(/^window\./, '').split('.');
  const prop = parts.pop();
  let owner = window;
  for (const p of parts) { owner = owner[p]; if (!(owner instanceof Object)) return; }
  const original = owner[prop];
  if (typeof original !== 'function') return;
  owner[prop] = new Proxy(original, {
    apply(target, thisArg, args) {
      const i = pos >= 0 ? pos : args.length + pos;
      if (i >= 0 && i < args.length && (!cond || cond.test(String(args[i])))) args[i] = value;
      return Reflect.apply(target, thisArg, args);
    },
  });
}

/** uBO names (and aliases) → HUSH implementation names. */
export const SCRIPTLET_ALIASES = {
  'set-constant': 'setConstant',
  'set': 'setConstant',
  'abort-on-property-read': 'abortOnPropertyRead',
  'aopr': 'abortOnPropertyRead',
  'abort-on-property-write': 'abortOnPropertyWrite',
  'aopw': 'abortOnPropertyWrite',
  'abort-current-script': 'abortCurrentScript',
  'acs': 'abortCurrentScript',
  'abort-current-inline-script': 'abortCurrentScript',
  'acis': 'abortCurrentScript',
  'abort-on-stack-trace': 'abortOnStackTrace',
  'aost': 'abortOnStackTrace',
  'json-prune': 'jsonPrune',
  'json-prune-fetch-response': 'jsonPruneFetchResponse',
  'json-prune-xhr-response': 'jsonPruneXhrResponse',
  'prevent-fetch': 'preventFetch',
  'no-fetch-if': 'preventFetch',
  'prevent-xhr': 'preventXhr',
  'no-xhr-if': 'preventXhr',
  'no-setTimeout-if': 'noSetTimeoutIf',
  'nostif': 'noSetTimeoutIf',
  'prevent-setTimeout': 'noSetTimeoutIf',
  'setTimeout-defuser': 'noSetTimeoutIf',
  'no-setInterval-if': 'noSetIntervalIf',
  'nosiif': 'noSetIntervalIf',
  'prevent-setInterval': 'noSetIntervalIf',
  'setInterval-defuser': 'noSetIntervalIf',
  'adjust-setTimeout': 'adjustSetTimeout',
  'nano-setTimeout-booster': 'adjustSetTimeout',
  'nano-stb': 'adjustSetTimeout',
  'adjust-setInterval': 'adjustSetInterval',
  'nano-setInterval-booster': 'adjustSetInterval',
  'nano-sib': 'adjustSetInterval',
  'addEventListener-defuser': 'addEventListenerDefuser',
  'aeld': 'addEventListenerDefuser',
  'prevent-addEventListener': 'preventAddEventListener',
  'no-window-open-if': 'noWindowOpenIf',
  'nowoif': 'noWindowOpenIf',
  'prevent-window-open': 'noWindowOpenIf',
  'window.open-defuser': 'noWindowOpenIf',
  'remove-attr': 'removeAttr',
  'ra': 'removeAttr',
  'remove-class': 'removeClass',
  'rc': 'removeClass',
  'set-attr': 'setAttr',
  'noeval-if': 'noEvalIf',
  'prevent-eval-if': 'noEvalIf',
  'prevent-refresh': 'preventRefresh',
  'refresh-defuser': 'preventRefresh',
  'disable-newtab-links': 'disableNewtabLinks',
  'set-local-storage-item': 'setLocalStorageItem',
  'set-session-storage-item': 'setSessionStorageItem',
  'set-cookie': 'setCookie',
  'trusted-set-cookie': 'trustedSetCookie',
  'trusted-set-local-storage-item': 'trustedSetLocalStorageItem',
  'trusted-set-constant': 'trustedSetConstant',
  'trusted-replace-fetch-response': 'trustedReplaceFetchResponse',
  'trusted-rpfr': 'trustedReplaceFetchResponse',
  'trusted-replace-xhr-response': 'trustedReplaceXhrResponse',
  'trusted-click-element': 'trustedClickElement',
  'spoof-css': 'spoofCss',
  'href-sanitizer': 'hrefSanitizer',
  'no-requestAnimationFrame-if': 'preventRequestAnimationFrame',
  'norafif': 'preventRequestAnimationFrame',
  'nowebrtc': 'noWebrtc',
  'remove-node-text': 'removeNodeText',
  'rmnt': 'removeNodeText',
  'replace-node-text': 'replaceNodeText',
  'rpnt': 'replaceNodeText',
  'trusted-replace-node-text': 'replaceNodeText',
  'trusted-rpnt': 'replaceNodeText',
  'remove-cookie': 'removeCookie',
  'cookie-remover': 'removeCookie',
  'noeval': 'noEval',
  'silent-noeval': 'noEval',
  'set-cookie-reload': 'setCookieReload',
  'trusted-replace-argument': 'trustedReplaceArgument',
  'close-window': 'closeWindow',
  'window-close-if': 'closeWindow',
};
