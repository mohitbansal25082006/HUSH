import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const remoteUrl = String.raw`(?:https?:)?//`;
const executableUrl = String.raw`(?:${remoteUrl}|(?:blob|data|javascript):)`;
const remoteModule = new RegExp(String.raw`\b(?:import\s*(?:\(\s*)?|from\s*|importScripts\(\s*|(?:Shared)?Worker\(\s*)["'\x60]${executableUrl}`, 'i');
const remoteScript = new RegExp(String.raw`(?:\bcreateElement(?:NS)?\s*\([^)]*["']script["']|<script\b)[\s\S]*?(?:\bsrc\s*=\s*|setAttribute\(\s*["']src["']\s*,\s*)["'\x60]${executableUrl}`, 'i');
const remoteHtmlScript = new RegExp(String.raw`<script\b[^>]*\bsrc\s*=\s*["']?${executableUrl}`, 'i');
const executableBlob = /\bnew\s+Blob\s*\([\s\S]*?,\s*\{\s*(?:type|["']type["'])\s*:\s*["'](?:text|application)\/(?:x-)?(?:java|ecma)script\b/i;

/** Catch common remote code loaders in the production files that WXT is about to package. */
export function hasRemoteCodeLoader(file: string, content: string): boolean {
  if (file.endsWith('.html')) return remoteHtmlScript.test(content) || remoteModule.test(content);
  // Generated scriptlet arguments are JSON strings, with HTML and JS quotes escaped.
  const source = content.replace(/\\["']/g, (quote) => quote[1]);
  return remoteModule.test(source) || remoteScript.test(source) || executableBlob.test(source);
}

export async function checkStoreBuild(directory: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || !manifest.declarative_net_request?.rule_resources?.length) {
    throw new Error('Store package requires a Manifest V3 build with compiled filter lists.');
  }

  for (const ruleset of manifest.declarative_net_request.rule_resources) {
    await readFile(join(directory, ruleset.path));
  }

  const files = await readdir(directory, { recursive: true });
  for (const file of files.filter((name) => /\.(?:m?js|html)$/.test(name))) {
    if (hasRemoteCodeLoader(file, await readFile(join(directory, file), 'utf8'))) {
      throw new Error(`Possible remote code loader in ${file}. Review the built file before packaging.`);
    }
  }
}
