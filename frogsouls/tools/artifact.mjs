// Turn dist/ into the claude.ai artifact page: node tools/artifact.mjs
// The artifact host supplies <!doctype>, <html>, <head>, <body> and the charset
// and viewport metas, so the page is the title, styles, script and markup only.
// Prints the bundle name, which the publish call maps into `files`.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const bundle = html.match(/src="\.\/assets\/(index-[^"]+\.js)"/)?.[1];
if (!bundle) throw new Error('no bundle script in dist/index.html');

let page = html
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?html[^>]*>/gi, '')
  .replace(/<\/?head>/gi, '')
  .replace(/<\/?body>/gi, '')
  .replace(/<meta [^>]*>\n?/gi, '')
  .replace(/<link rel="preconnect"[^>]*>\n?/gi, '');
// the title must sit in the first 8 KB
const title = page.match(/<title>[^<]*<\/title>\n?/)[0];
page = title + page.replace(title, '').trim() + '\n';

rmSync('artifact', { recursive: true, force: true });
mkdirSync('artifact/assets', { recursive: true });
writeFileSync('artifact/frogsouls.html', page);
copyFileSync(`dist/assets/${bundle}`, `artifact/assets/${bundle}`);
for (const f of readdirSync('dist/assets')) if (f !== bundle) console.warn('extra asset not copied:', f);
console.log(bundle);
