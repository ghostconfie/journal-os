// SheetJS 0.18.5 (the last version on npm) turns characters written as "&#128722;" in Excel files into the
// wrong symbol, because it uses String.fromCharCode. Emoji in pool names (🛒, 🏠 …) come out broken.
// This swaps in String.fromCodePoint, which handles them. Runs automatically after `npm install`.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'node_modules', 'xlsx');
const bad = 'String.fromCharCode(parseInt($1,$$.indexOf("x")>-1?16:10))';
const good = 'String.fromCodePoint(parseInt($1,$$.indexOf("x")>-1?16:10))';
const bad2 = 'function entrepl($$/*:string*/,$1/*:string*/)/*:string*/ { return String.fromCharCode(parseInt($1,10)); }';
const good2 = 'function entrepl($$/*:string*/,$1/*:string*/)/*:string*/ { return String.fromCodePoint(parseInt($1,10)); }';
for (const f of ['xlsx.mjs', 'xlsx.js']) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, 'utf8');
  const t = s.split(bad).join(good).split(bad2).join(good2);
  if (t !== s) { fs.writeFileSync(p, t); console.log(`patched ${f}`); }
}
