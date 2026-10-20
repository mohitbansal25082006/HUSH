/** FNV-1a 32-bit — tiny and fast, used to shard the cosmetic database. Shared by compiler & runtime. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const bucketOf = (str: string, buckets: number): number => fnv1a(str) % buckets;

/** `a.b.example.com` → [`a.b.example.com`, `b.example.com`, `example.com`]. */
export function hostAncestors(hostname: string): string[] {
  const out: string[] = [];
  let h = hostname.replace(/\.$/, '');
  for (;;) {
    out.push(h);
    const dot = h.indexOf('.');
    if (dot === -1 || h.indexOf('.', dot + 1) === -1) break;
    h = h.slice(dot + 1);
  }
  return out;
}
