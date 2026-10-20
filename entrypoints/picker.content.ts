/**
 * HUSH element picker & zapper — injected on demand (context menu, shortcut or popup).
 *   picker: hover → click → refine → "Block forever" saves `host##selector` to My Filters.
 *   zapper: every click removes an element for this visit only. Esc to leave.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    const w = window as unknown as { __hushPickerMode?: string; __hushPickerOpen?: boolean };
    if (w.__hushPickerOpen) return;
    w.__hushPickerOpen = true;
    startPicker(w.__hushPickerMode === 'zapper' ? 'zapper' : 'picker', () => (w.__hushPickerOpen = false));
  },
});

const CSS_TEXT = `
:host{all:initial}
*{box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.layer{position:fixed;inset:0;z-index:2147483647;pointer-events:none}
.box{position:fixed;border-radius:8px;border:2px solid #9b7bff;background:rgba(124,92,255,.16);
  box-shadow:0 0 0 1px rgba(255,255,255,.4) inset,0 0 24px rgba(124,92,255,.55);transition:all .09s cubic-bezier(.2,.8,.2,1)}
.box.zap{border-color:#ff5c8a;background:rgba(255,92,138,.16);box-shadow:0 0 24px rgba(255,92,138,.55)}
.box.sel{border-style:solid;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{50%{box-shadow:0 0 0 6px rgba(124,92,255,.18),0 0 34px rgba(124,92,255,.7)}}
.tag{position:fixed;padding:4px 8px;border-radius:7px;background:#16132b;color:#e9e6ff;font-size:11px;font-weight:600;
  letter-spacing:.01em;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.35);transform:translateY(-100%);margin-top:-6px;
  max-width:60vw;overflow:hidden;text-overflow:ellipsis}
.tag b{color:#b9a6ff;font-weight:700}
.panel{position:fixed;right:20px;bottom:20px;width:380px;pointer-events:auto;color:#ece9ff;
  background:linear-gradient(160deg,rgba(32,26,66,.92),rgba(14,12,30,.94));backdrop-filter:blur(18px) saturate(1.4);
  border:1px solid rgba(160,140,255,.28);border-radius:20px;padding:16px;box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.04) inset;
  animation:rise .38s cubic-bezier(.2,1.2,.3,1)}
@keyframes rise{from{opacity:0;transform:translateY(24px) scale(.96)}}
.head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.logo{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-size:17px;
  background:conic-gradient(from 200deg,#7c5cff,#3ee0ff,#ff5c8a,#7c5cff);box-shadow:0 0 18px rgba(124,92,255,.6)}
.title{font-size:14px;font-weight:700;letter-spacing:.01em}
.sub{font-size:11.5px;color:#a8a2cf;margin-top:1px}
.x{margin-left:auto;width:28px;height:28px;border-radius:9px;border:0;background:rgba(255,255,255,.06);color:#cfc9f5;cursor:pointer;font-size:15px}
.x:hover{background:rgba(255,255,255,.12)}
textarea{width:100%;min-height:62px;resize:vertical;border-radius:12px;border:1px solid rgba(160,140,255,.25);background:rgba(0,0,0,.28);
  color:#f3f0ff;font:12px/1.5 "JetBrains Mono",ui-monospace,monospace;padding:10px;outline:none}
textarea:focus{border-color:#9b7bff;box-shadow:0 0 0 3px rgba(124,92,255,.25)}
.row{display:flex;align-items:center;gap:10px;margin:12px 0 4px;font-size:12px;color:#c9c3ee}
input[type=range]{flex:1;accent-color:#8f6bff}
.count{font-variant-numeric:tabular-nums;color:#3ee0ff;font-weight:700}
.btns{display:flex;gap:8px;margin-top:12px}
button.b{flex:1;height:38px;border-radius:12px;border:0;font-weight:700;font-size:13px;cursor:pointer;transition:transform .15s,filter .15s}
button.b:active{transform:scale(.96)}
.primary{background:linear-gradient(135deg,#7c5cff,#5a8dff);color:white;box-shadow:0 8px 22px rgba(124,92,255,.45)}
.primary:hover{filter:brightness(1.1)}
.ghost{background:rgba(255,255,255,.07);color:#e3dfff}
.ghost:hover{background:rgba(255,255,255,.12)}
.hint{position:fixed;left:50%;top:18px;transform:translateX(-50%);pointer-events:auto;padding:10px 16px;border-radius:14px;
  background:rgba(22,19,43,.92);backdrop-filter:blur(12px);color:#ece9ff;font-size:12.5px;font-weight:600;display:flex;gap:10px;align-items:center;
  border:1px solid rgba(160,140,255,.25);box-shadow:0 16px 40px rgba(0,0,0,.4);animation:drop .4s cubic-bezier(.2,1.2,.3,1)}
@keyframes drop{from{opacity:0;transform:translate(-50%,-16px)}}
.hint kbd{font:600 11px ui-monospace,monospace;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.1)}
.poof{position:fixed;pointer-events:none;border-radius:12px;background:radial-gradient(circle,rgba(255,92,138,.5),transparent 70%);animation:poof .5s ease-out forwards}
@keyframes poof{to{transform:scale(1.4);opacity:0}}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:12px 18px;border-radius:14px;background:linear-gradient(135deg,#7c5cff,#3ee0ff);
  color:white;font-weight:700;font-size:13px;box-shadow:0 18px 40px rgba(124,92,255,.5);animation:drop .4s cubic-bezier(.2,1.2,.3,1)}
`;

function cssIdent(s: string) {
  return CSS.escape(s);
}

const stableToken = (s: string) => /^[a-zA-Z_-][\w-]*$/.test(s) && !/\d{4,}|[a-f0-9]{8,}/i.test(s) && s.length < 40;

function simpleSelector(el: Element): string {
  if (el.id && stableToken(el.id)) return `#${cssIdent(el.id)}`;
  let sel = el.localName;
  const classes = [...el.classList].filter(stableToken).slice(0, 3);
  sel += classes.map((c) => `.${cssIdent(c)}`).join('');
  if (classes.length === 0) {
    for (const attr of ['data-testid', 'data-ad', 'data-ad-slot', 'aria-label', 'role', 'name']) {
      const v = el.getAttribute(attr);
      if (v && v.length < 60) return `${sel}[${attr}="${v.replace(/"/g, '\\"')}"]`;
    }
    const src = el.getAttribute('src');
    if (src && /^(https?:)?\/\//.test(src)) {
      try {
        const u = new URL(src, location.href);
        return `${sel}[src^="${u.origin}${u.pathname.split('/').slice(0, 2).join('/')}"]`;
      } catch {
        /* ignore */
      }
    }
  }
  return sel;
}

function uniqueSelector(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement && parts.length < 6) {
    let part = simpleSelector(cur);
    if (!part.startsWith('#') && cur.parentElement) {
      const same = [...cur.parentElement.children].filter((c) => c.localName === cur!.localName);
      if (same.length > 1 && !part.includes('.') && !part.includes('[')) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    const sel = parts.join(' > ');
    try {
      if (document.querySelectorAll(sel).length === 1) return sel;
    } catch {
      /* continue */
    }
    if (part.startsWith('#')) break;
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function startPicker(mode: 'picker' | 'zapper', onClose: () => void) {
  const host = document.createElement('hush-picker');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${CSS_TEXT}</style><div class="layer"><div class="box ${mode === 'zapper' ? 'zap' : ''}" hidden></div><div class="tag" hidden></div></div>`;
  (document.documentElement || document.body).appendChild(host);
  const layer = root.querySelector('.layer') as HTMLElement;
  const box = root.querySelector('.box') as HTMLElement;
  const tag = root.querySelector('.tag') as HTMLElement;

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.innerHTML = mode === 'zapper'
    ? `⚡ <span>Zapper — click anything to remove it</span> <kbd>Esc</kbd>`
    : `🎯 <span>Click the ad you want HUSH to block</span> <kbd>Esc</kbd>`;
  layer.appendChild(hint);

  let hovered: Element | null = null;
  let selected: Element | null = null;
  let panel: HTMLElement | null = null;
  let zapped = 0;
  const previewStyle = document.createElement('style');

  const draw = (el: Element | null) => {
    if (!el) {
      box.hidden = true;
      tag.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    box.hidden = false;
    tag.innerHTML = `<b>${el.localName}</b>${simpleSelector(el).replace(el.localName, '')} · ${Math.round(r.width)}×${Math.round(r.height)}`;
    Object.assign(tag.style, { left: `${Math.max(4, r.left)}px`, top: `${Math.max(28, r.top)}px` });
    tag.hidden = false;
  };

  const pick = (x: number, y: number): Element | null => {
    const el = document.elementFromPoint(x, y);
    if (!el || el === host || el === document.documentElement || el === document.body) return null;
    return el;
  };

  const onMove = (e: MouseEvent) => {
    if (selected) return;
    hovered = pick(e.clientX, e.clientY);
    draw(hovered);
  };

  const close = () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    previewStyle.remove();
    host.remove();
    onClose();
  };

  const toast = (text: string) => {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    layer.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  };

  const openPanel = (el: Element) => {
    selected = el;
    box.classList.add('sel');
    const chain: Element[] = [];
    for (let c: Element | null = el; c && c !== document.body && chain.length < 8; c = c.parentElement) chain.push(c);
    panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="head"><div class="logo">🤫</div><div><div class="title">Block this element</div><div class="sub">${location.hostname}</div></div><button class="x" title="Close">✕</button></div>
      <textarea spellcheck="false"></textarea>
      <div class="row">Precise <input type="range" min="0" max="${chain.length - 1}" value="0"> Broad</div>
      <div class="row">Matches <span class="count">0</span> element(s) on this page</div>
      <div class="btns"><button class="b ghost" data-a="preview">Preview</button><button class="b ghost" data-a="back">Repick</button><button class="b primary" data-a="block">Block forever</button></div>`;
    layer.appendChild(panel);
    const ta = panel.querySelector('textarea') as HTMLTextAreaElement;
    const range = panel.querySelector('input') as HTMLInputElement;
    const count = panel.querySelector('.count') as HTMLElement;
    const update = () => {
      const target = chain[Number(range.value)] ?? el;
      ta.value = uniqueSelector(target);
      draw(target);
      refresh();
    };
    const refresh = () => {
      try {
        const n = document.querySelectorAll(ta.value).length;
        count.textContent = String(n);
      } catch {
        count.textContent = '—';
      }
    };
    range.addEventListener('input', update);
    ta.addEventListener('input', refresh);
    panel.querySelector('.x')!.addEventListener('click', close);
    panel.addEventListener('click', (ev) => {
      const a = (ev.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'preview') {
        previewStyle.textContent = previewStyle.textContent ? '' : `${ta.value}{display:none!important}`;
        if (!previewStyle.isConnected) document.documentElement.appendChild(previewStyle);
      } else if (a === 'back') {
        panel?.remove();
        panel = null;
        selected = null;
        box.classList.remove('sel');
        previewStyle.textContent = '';
      } else if (a === 'block') {
        const selector = ta.value.trim();
        if (!selector) return;
        chrome.runtime.sendMessage({ type: 'pickerResult', host: location.hostname.replace(/^www\./, ''), selector }).catch(() => {});
        previewStyle.textContent = `${selector}{display:none!important}`;
        document.documentElement.appendChild(previewStyle.cloneNode(true));
        panel?.remove();
        toast('🤫 Hushed. It will stay gone.');
        setTimeout(close, 1200);
      }
    });
    update();
  };

  const onClick = (e: MouseEvent) => {
    if (e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const el = pick(e.clientX, e.clientY);
    if (!el) return;
    if (mode === 'zapper') {
      const r = el.getBoundingClientRect();
      const p = document.createElement('div');
      p.className = 'poof';
      Object.assign(p.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      layer.appendChild(p);
      setTimeout(() => p.remove(), 520);
      el.remove();
      zapped++;
      hint.querySelector('span')!.textContent = `Zapped ${zapped} — keep clicking, Esc when done`;
      chrome.runtime.sendMessage({ type: 'cosmeticHits', count: 1 }).catch(() => {});
      return;
    }
    if (!selected) openPanel(el);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
}
