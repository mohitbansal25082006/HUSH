/** Renders the HUSH toolbar / store icons from one SVG (npm run icons). */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icon');

// At tiny sizes the details are dropped so the silhouette stays readable.
const svg = (size: number) => {
  const detail = size >= 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a2b78"/><stop offset="1" stop-color="#1b1530"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="46%" r="50%">
      <stop offset="0" stop-color="#ffe9b4" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9b4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="body" x1=".2" y1="0" x2=".8" y2="1">
      <stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#fff0cc"/><stop offset="1" stop-color="#ffd98f"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="30" fill="url(#bg)"/>
  <circle cx="64" cy="62" r="56" fill="url(#glow)"/>
  <path d="M24 70 C24 40 42 20 64 20 C86 20 104 40 104 70 L104 98 Q98 110 90 100 Q82 110 74 100 Q64 112 54 100 Q46 110 38 100 Q30 110 24 98 Z" fill="url(#body)"/>
  ${detail ? '<ellipse cx="42" cy="78" rx="6" ry="3.6" fill="#ff9db5" opacity=".6"/><ellipse cx="86" cy="78" rx="6" ry="3.6" fill="#ff9db5" opacity=".6"/>' : ''}
  <ellipse cx="50" cy="64" rx="${detail ? 6 : 7.5}" ry="${detail ? 7.5 : 8.5}" fill="#2a2050"/>
  <ellipse cx="78" cy="64" rx="${detail ? 6 : 7.5}" ry="${detail ? 7.5 : 8.5}" fill="#2a2050"/>
  ${detail ? '<circle cx="52.5" cy="61" r="2.3" fill="#fff"/><circle cx="80.5" cy="61" r="2.3" fill="#fff"/>' : ''}
  <rect x="${detail ? 60.5 : 59}" y="${detail ? 72 : 74}" width="${detail ? 7 : 10}" height="${detail ? 26 : 22}" rx="${detail ? 3.5 : 5}" fill="#fff6dd" stroke="#e8c27a" stroke-width="${detail ? 1.5 : 0}"/>
</svg>`;
};

mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 96, 128]) {
  await sharp(Buffer.from(svg(size))).png().toFile(join(OUT, `${size}.png`));
}
writeFileSync(join(OUT, 'hush.svg'), svg(128));
console.log('icons written to', OUT);
