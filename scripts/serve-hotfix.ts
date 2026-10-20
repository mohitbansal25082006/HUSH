/**
 * Serves hotfix/hotfix.json on http://localhost:8787 for local testing (npm run hotfix:serve).
 * Set Dashboard → Filter lists → Hotfix address to http://localhost:8787/hotfix.json.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'hotfix', 'hotfix.json');
const PORT = 8787;

createServer((req, res) => {
  if (!req.url?.startsWith('/hotfix.json')) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = readFileSync(FILE);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(body);
    console.log(`${new Date().toLocaleTimeString()}  served hotfix.json (${body.length} bytes)`);
  } catch {
    res.writeHead(404).end('hotfix.json missing — run npm run hotfix:sign first');
  }
}).listen(PORT, () => console.log(`Hotfix server: http://localhost:${PORT}/hotfix.json  (Ctrl+C to stop)`));
