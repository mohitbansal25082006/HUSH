/**
 * Overlay killer — defeats invisible click-hijacking layers that piracy / streaming sites stretch
 * over the page so the first click opens a popunder.
 *
 * On pointerdown we inspect the element under the cursor. If it is a large, (nearly) invisible,
 * high z-index layer that would navigate somewhere else, it is removed and the click swallowed.
 */

const isInteractiveContent = (el: Element) => !!el.querySelector('video, img, canvas, iframe, svg, input, button, textarea, select');

function suspicious(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el === document.body || el === document.documentElement) return false;
  const st = getComputedStyle(el);
  if (st.position !== 'fixed' && st.position !== 'absolute') return false;
  const z = parseInt(st.zIndex, 10);
  if (!(z >= 100)) return false;
  const r = el.getBoundingClientRect();
  const coverage = (Math.min(r.width, innerWidth) * Math.min(r.height, innerHeight)) / (innerWidth * innerHeight);
  if (coverage < 0.4) return false;
  const opacity = parseFloat(st.opacity);
  const transparentBg = st.backgroundColor === 'rgba(0, 0, 0, 0)' || st.backgroundColor === 'transparent' || /,\s*0(\.0+)?\)$/.test(st.backgroundColor);
  const noImage = st.backgroundImage === 'none';
  const invisible = opacity < 0.15 || (transparentBg && noImage && !el.textContent?.trim() && !isInteractiveContent(el));
  if (!invisible) return false;
  // It must lead somewhere: a link to another site, or a click handler.
  const link = el.closest('a[href]') as HTMLAnchorElement | null;
  if (link) {
    try {
      return new URL(link.href).hostname !== location.hostname;
    } catch {
      return false;
    }
  }
  return el.hasAttribute('onclick') || el.localName === 'a' || st.cursor === 'pointer';
}

export function startOverlayKiller(onKill: () => void): void {
  const handler = (ev: Event) => {
    const e = ev as PointerEvent;
    if (!e.isTrusted) return;
    const stack = document.elementsFromPoint(e.clientX, e.clientY).slice(0, 3);
    for (const el of stack) {
      if (suspicious(el)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        (el.closest('a[href]') ?? el).remove();
        onKill();
        return;
      }
    }
  };
  addEventListener('pointerdown', handler, true);
  addEventListener('click', (ev) => {
    const e = ev as MouseEvent;
    if (!e.isTrusted) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && suspicious(el)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      (el.closest('a[href]') ?? el).remove();
      onKill();
    }
  }, true);
}
