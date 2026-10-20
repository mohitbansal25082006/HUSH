/**
 * HUSH popup guard (MAIN world, registered at runtime so it honours the allowlist).
 *
 * Stops the in-page tricks behind popups and popunders:
 *  - window.open() without a real user gesture
 *  - window.open() to another site triggered by a click on something unrelated (a page-wide
 *    click handler that hijacks your first click)
 *  - synthetic clicks on detached / hidden `<a target=_blank>` elements
 *  - Notification permission prompts that appear without user interaction
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installGuard();
  },
});

function installGuard() {
  const w = window as Window & { __hushGuard?: boolean; __hushGuardLenient?: boolean; __hushGuardAllowNotifications?: boolean };
  if (w.__hushGuard) return;
  Object.defineProperty(w, '__hushGuard', { value: true, enumerable: false });
  // Option flags are set by tiny files registered in front of this script (see background/scriptlets.ts).
  const lenient = !!w.__hushGuardLenient;
  const allowNotifications = !!w.__hushGuardAllowNotifications;
  delete w.__hushGuardLenient;
  delete w.__hushGuardAllowNotifications;

  const report = (url: string) => {
    try {
      document.dispatchEvent(new CustomEvent('hush:popup', { detail: String(url) }));
    } catch {
      /* ignore */
    }
  };

  const sameSite = (url: string): boolean => {
    try {
      const u = new URL(url, location.href);
      if (u.protocol === 'javascript:' || u.protocol === 'about:') return true;
      const base = (h: string) => h.split('.').slice(-2).join('.');
      return base(u.hostname) === base(location.hostname);
    } catch {
      return true;
    }
  };

  /** Was this window.open triggered by the user interacting with something that opens links? */
  const legitimateGesture = (url: string): boolean => {
    const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (ua && !ua.isActive) return false;
    if (lenient) return true;
    const ev = (window as unknown as { event?: Event }).event;
    if (!ev || !(ev.target instanceof Element)) return true; // async after gesture (e.g. OAuth) — allow
    const target = ev.target as Element;
    const interactive = target.closest('a[href], button, [role="button"], input[type="button"], input[type="submit"], [onclick], label, summary, [data-href], [data-url]');
    if (!interactive) return sameSite(url);
    if (interactive instanceof HTMLAnchorElement) {
      // Clicking a link that goes somewhere else than what is being opened → hijack.
      try {
        const a = new URL(interactive.href, location.href);
        const o = new URL(url, location.href);
        return a.hostname === o.hostname || sameSite(url);
      } catch {
        return true;
      }
    }
    return true;
  };

  const nativeOpen = window.open;
  const fakeWindow = () =>
    new Proxy(
      {},
      {
        get: (_t, p) => {
          if (p === 'closed') return false;
          if (p === 'document') return document.implementation.createHTMLDocument('');
          if (p === 'location') return { href: 'about:blank', replace() {}, assign() {} };
          return typeof p === 'string' ? () => undefined : undefined;
        },
        set: () => true,
      },
    ) as Window;

  window.open = new Proxy(nativeOpen, {
    apply(target, thisArg, args: [string?, string?, string?]) {
      const url = String(args[0] ?? '');
      if (url && !sameSite(url) && !legitimateGesture(url)) {
        report(url);
        return fakeWindow();
      }
      return Reflect.apply(target, thisArg, args);
    },
  });

  // Programmatic clicks on hidden / detached _blank anchors (a classic popunder trick).
  const nativeClick = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function (this: HTMLElement) {
    if (this instanceof HTMLAnchorElement && this.target === '_blank' && !sameSite(this.href)) {
      const detached = !this.isConnected || !this.offsetParent;
      const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (detached && (!ua || !ua.isActive || !document.contains(this))) {
        report(this.href);
        return;
      }
    }
    return nativeClick.call(this);
  };

  const nativeDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (this: EventTarget, event: Event) {
    if (
      this instanceof HTMLAnchorElement &&
      event.type === 'click' &&
      !event.isTrusted &&
      this.target === '_blank' &&
      !sameSite(this.href) &&
      (!this.isConnected || !this.offsetParent)
    ) {
      report(this.href);
      return false;
    }
    return nativeDispatch.call(this, event);
  };

  // Notification permission prompts without a gesture.
  const N = window.Notification as (typeof Notification) | undefined;
  if (N && typeof N.requestPermission === 'function' && !allowNotifications) {
    const nativeRequest = N.requestPermission.bind(N);
    N.requestPermission = function (cb?: NotificationPermissionCallback) {
      const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (ua && !ua.isActive && N.permission === 'default') {
        const result: NotificationPermission = 'default';
        cb?.(result);
        return Promise.resolve(result);
      }
      return nativeRequest(cb);
    } as typeof N.requestPermission;
  }
}
