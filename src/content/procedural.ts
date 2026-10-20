/**
 * HUSH procedural cosmetic engine — executes uBO-style procedural selectors such as
 *   example.com##div.post:has-text(/Sponsored/):upward(2)
 * that cannot be expressed in plain CSS.
 */

type Task =
  | ['css', string]
  | ['spath', string]
  | ['has-text', RegExp]
  | ['has', Compiled]
  | ['not', Compiled]
  | ['upward', number | string]
  | ['xpath', string]
  | ['matches-css', { pseudo: string | null; prop: string; re: RegExp }]
  | ['min-text-length', number]
  | ['matches-attr', { name: RegExp; value: RegExp | null }]
  | ['matches-path', RegExp]
  | ['matches-media', string];

type Action = ['hide'] | ['remove'] | ['style', string] | ['remove-attr', RegExp] | ['remove-class', RegExp];

export interface Compiled {
  tasks: Task[];
  action: Action;
  raw: string;
}

const OPERATORS = new Set([
  'has-text', 'contains', '-abp-contains', 'has', '-abp-has', 'if', 'not', 'if-not', 'upward', 'nth-ancestor',
  'xpath', 'matches-css', 'matches-css-before', 'matches-css-after', 'min-text-length', 'matches-attr',
  'matches-path', 'remove', 'style', 'remove-attr', 'remove-class', 'watch-attr', 'others', 'matches-media',
  'matches-prop',
]);
const ACTIONS = new Set(['remove', 'style', 'remove-attr', 'remove-class']);
const PROCEDURAL_HINT = /:(?:has-text|contains|-abp-contains|upward|nth-ancestor|xpath|matches-css(?:-before|-after)?|min-text-length|matches-attr|matches-path|remove|style|remove-attr|remove-class|watch-attr|others|if|if-not|matches-media|matches-prop)\(/;

function toRegExp(arg: string, exact = false): RegExp {
  const m = /^\/(.+)\/([imsu]*)$/.exec(arg.trim());
  if (m) return new RegExp(m[1], m[2]);
  let s = arg.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp(exact ? `^${esc}$` : esc);
}

/** Find the matching close paren for `(` at index `open`, honouring quotes, regexes and escapes. */
function closeParen(s: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

export function isProcedural(selector: string): boolean {
  return PROCEDURAL_HINT.test(selector);
}

/** Compile a procedural selector; returns null when it is invalid. */
export function compileProcedural(raw: string): Compiled | null {
  try {
    const tasks: Task[] = [];
    let action: Action = ['hide'];
    let css = '';
    let i = 0;
    const flushCss = () => {
      const t = css.trim();
      if (t) {
        if (tasks.length === 0) tasks.push(['css', t]);
        else tasks.push(['spath', t]);
      }
      css = '';
    };
    while (i < raw.length) {
      const c = raw[i];
      if (c === ':') {
        const m = /^:([a-z-]+)\(/.exec(raw.slice(i));
        if (m && OPERATORS.has(m[1])) {
          const name = m[1];
          const open = i + m[0].length - 1;
          const close = closeParen(raw, open);
          if (close === -1) return null;
          const arg = raw.slice(open + 1, close);
          // :has() / :not() with only plain CSS inside stays native CSS.
          if ((name === 'has' || name === 'not') && !isProcedural(arg)) {
            css += raw.slice(i, close + 1);
            i = close + 1;
            continue;
          }
          flushCss();
          if (tasks.length === 0) tasks.push(['css', '*']);
          switch (name) {
            case 'has-text':
            case 'contains':
            case '-abp-contains':
              tasks.push(['has-text', toRegExp(arg)]);
              break;
            case 'has':
            case '-abp-has':
            case 'if': {
              const sub = compileProcedural(arg.trim().startsWith('>') ? `:scope ${arg}` : arg);
              if (!sub) return null;
              tasks.push(['has', sub]);
              break;
            }
            case 'not':
            case 'if-not': {
              const sub = compileProcedural(arg);
              if (!sub) return null;
              tasks.push(['not', sub]);
              break;
            }
            case 'upward':
            case 'nth-ancestor': {
              const n = Number(arg);
              tasks.push(['upward', Number.isInteger(n) && n > 0 && n < 256 ? n : arg.trim()]);
              break;
            }
            case 'xpath':
              tasks.push(['xpath', arg]);
              break;
            case 'matches-css':
            case 'matches-css-before':
            case 'matches-css-after': {
              const colon = arg.indexOf(':');
              if (colon === -1) return null;
              const pseudo = name.endsWith('before') ? '::before' : name.endsWith('after') ? '::after' : null;
              tasks.push(['matches-css', { pseudo, prop: arg.slice(0, colon).trim(), re: toRegExp(arg.slice(colon + 1).trim(), true) }]);
              break;
            }
            case 'min-text-length':
              tasks.push(['min-text-length', Number(arg) || 0]);
              break;
            case 'matches-attr': {
              const eq = arg.indexOf('=');
              const nameRe = toRegExp(eq === -1 ? arg : arg.slice(0, eq), true);
              tasks.push(['matches-attr', { name: nameRe, value: eq === -1 ? null : toRegExp(arg.slice(eq + 1), true) }]);
              break;
            }
            case 'matches-path':
              tasks.push(['matches-path', toRegExp(arg)]);
              break;
            case 'matches-media':
              tasks.push(['matches-media', arg]);
              break;
            case 'watch-attr':
            case 'others':
            case 'matches-prop':
              break;
            default:
              if (ACTIONS.has(name)) {
                if (name === 'remove') action = ['remove'];
                else if (name === 'style') {
                  if (/url\s*\(|expression/i.test(arg)) return null;
                  action = ['style', arg];
                } else if (name === 'remove-attr') action = ['remove-attr', toRegExp(arg, true)];
                else action = ['remove-class', toRegExp(arg, true)];
              }
          }
          i = close + 1;
          continue;
        }
      }
      css += c;
      i++;
    }
    flushCss();
    if (tasks.length === 0) return null;
    if (tasks[0][0] === 'css') document.querySelector(tasks[0][1] as string); // validate
    return { tasks, action, raw };
  } catch {
    return null;
  }
}

function run(compiled: Compiled, roots: Element[] | null): Element[] {
  let nodes: Element[] = roots ?? [];
  for (const task of compiled.tasks) {
    const next: Element[] = [];
    switch (task[0]) {
      case 'css':
        if (roots) {
          for (const r of roots) {
            try {
              for (const el of r.querySelectorAll(task[1])) next.push(el);
            } catch {
              return [];
            }
          }
        } else {
          for (const el of document.querySelectorAll(task[1])) next.push(el);
        }
        break;
      case 'spath':
        for (const n of nodes) {
          const path = task[1].trim();
          const sib = /^([+~])\s*(.+)$/.exec(path);
          try {
            if (sib) {
              // Sibling combinators are resolved by walking the following siblings of n.
              for (let el = n.nextElementSibling; el; el = el.nextElementSibling) {
                if (el.matches(sib[2])) next.push(el);
                if (sib[1] === '+') break;
              }
            } else {
              for (const el of n.querySelectorAll(`:scope ${path}`)) next.push(el);
            }
          } catch {
            /* invalid selector */
          }
        }
        break;
      case 'has-text':
        for (const n of nodes) if (task[1].test(n.textContent ?? '')) next.push(n);
        break;
      case 'has':
        for (const n of nodes) if (run(task[1], [n]).length) next.push(n);
        break;
      case 'not':
        for (const n of nodes) if (!run(task[1], [n]).length && !matchesSelf(task[1], n)) next.push(n);
        break;
      case 'upward':
        for (const n of nodes) {
          let p: Element | null = n;
          if (typeof task[1] === 'number') {
            for (let k = 0; k < task[1] && p; k++) p = p.parentElement;
          } else {
            p = n.parentElement?.closest(task[1]) ?? null;
          }
          if (p && p !== document.documentElement && p !== document.body) next.push(p);
        }
        break;
      case 'xpath':
        for (const ctx of nodes.length ? nodes : [document.documentElement]) {
          const res = document.evaluate(task[1], ctx, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          for (let k = 0; k < res.snapshotLength; k++) {
            const el = res.snapshotItem(k);
            if (el instanceof Element) next.push(el);
          }
        }
        break;
      case 'matches-css':
        for (const n of nodes) {
          const st = getComputedStyle(n, task[1].pseudo);
          if (task[1].re.test(st.getPropertyValue(task[1].prop))) next.push(n);
        }
        break;
      case 'min-text-length':
        for (const n of nodes) if ((n.textContent ?? '').length >= task[1]) next.push(n);
        break;
      case 'matches-attr':
        for (const n of nodes) {
          for (const a of n.attributes) {
            if (task[1].name.test(a.name) && (!task[1].value || task[1].value.test(a.value))) {
              next.push(n);
              break;
            }
          }
        }
        break;
      case 'matches-path':
        if (task[1].test(location.pathname + location.search)) next.push(...nodes);
        break;
      case 'matches-media':
        if (matchMedia(task[1]).matches) next.push(...nodes);
        break;
    }
    nodes = [...new Set(next)];
    if (nodes.length === 0) return nodes;
  }
  return nodes;
}

function matchesSelf(c: Compiled, n: Element): boolean {
  if (c.tasks.length !== 1 || c.tasks[0][0] !== 'css') return false;
  try {
    return n.matches(c.tasks[0][1] as string);
  } catch {
    return false;
  }
}


const HIDDEN = new WeakSet<Element>();
let styleCounter = 0;

/** Apply all compiled filters once; returns how many new elements were acted on. */
export function applyProcedural(list: Compiled[], injectStyle: (css: string) => void): number {
  let acted = 0;
  for (const c of list) {
    let nodes: Element[];
    try {
      nodes = run(c, null);
    } catch {
      continue;
    }
    for (const el of nodes) {
      if (HIDDEN.has(el)) continue;
      HIDDEN.add(el);
      acted++;
      const a = c.action;
      switch (a[0]) {
        case 'hide':
          (el as HTMLElement).style?.setProperty('display', 'none', 'important');
          break;
        case 'remove':
          el.remove();
          break;
        case 'style': {
          const attr = `hush-s${(styleCounter++).toString(36)}`;
          el.setAttribute(attr, '');
          injectStyle(`[${attr}]{${a[1].replace(/;?\s*$/, '')}}`);
          break;
        }
        case 'remove-attr':
          for (const at of [...el.attributes]) if (a[1].test(at.name)) el.removeAttribute(at.name);
          HIDDEN.delete(el);
          break;
        case 'remove-class':
          for (const cl of [...el.classList]) if (a[1].test(cl)) el.classList.remove(cl);
          HIDDEN.delete(el);
          break;
      }
    }
  }
  return acted;
}
