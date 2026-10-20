import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const routes=JSON.parse(fs.readFileSync('docs/routes.json','utf8'));
const reserved=['/signin-with-chatgpt','/signout-with-chatgpt'];
let checked=0;
for(const r of routes){const file=path.join('dist',r.url,'index.html');const html=fs.readFileSync(file,'utf8');assert(html.includes('<html lang="pt-AO">'),file+' language');assert(html.includes('<title>')&&html.includes('name="description"'),file+' metadata');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,file+' duplicate IDs');const links=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(x=>x[1]);for(const link of links){if(link.startsWith('https:'))continue;if(link.startsWith('#')){if(link.length>1)assert(ids.includes(link.slice(1)),file+' missing fragment '+link);continue}const target=link.split('?')[0].split('#')[0];if(reserved.includes(target))continue;assert(target.startsWith('/'),file+' unexpected relative URL '+link);const local=path.join('dist',target);assert(fs.existsSync(local),file+' missing link '+link);if(target.endsWith('/'))assert(fs.existsSync(path.join(local,'index.html')),file+' no route index '+link);checked++}}
const source=fs.readFileSync('src/app.js','utf8');assert(!/type=["']password/.test(source),'No institutional password collection');
console.log(`Verified ${routes.length} HTML pages, ${checked} internal links/assets, IDs, metadata.`);
