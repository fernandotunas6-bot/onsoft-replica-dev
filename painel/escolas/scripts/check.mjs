import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadSchool} from './school.mjs';
const school=loadSchool();
const routes=JSON.parse(fs.readFileSync('docs/routes.json','utf8'));
const reserved=['/signin-with-chatgpt','/signout-with-chatgpt'];
let checked=0;
for(const r of routes){const file=path.join('dist',r.url,'index.html');const html=fs.readFileSync(file,'utf8');assert(html.includes('<html lang="'+school.lang+'">'),file+' language');assert(/<title(?:\s[^>]*)?>/.test(html)&&html.includes('name="description"'),file+' metadata');assert(!/\{\{[A-Z_]{2,32}\}\}/.test(html),file+' marcador por substituir');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,file+' duplicate IDs');const links=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(x=>x[1]);for(const link of links){if(link.startsWith('https:'))continue;if(link.startsWith('#')){if(link.length>1)assert(ids.includes(link.slice(1)),file+' missing fragment '+link);continue}const target=link.split('?')[0].split('#')[0];if(reserved.includes(target))continue;assert(target.startsWith('/'),file+' unexpected relative URL '+link);const local=path.join('dist',target);assert(fs.existsSync(local),file+' missing link '+link);if(target.endsWith('/'))assert(fs.existsSync(path.join(local,'index.html')),file+' no route index '+link);checked++}}
// Nenhum artefacto de texto publicado pode conter um marcador por substituir.
for(const file of fs.readdirSync('dist',{recursive:true})){
  const full=path.join('dist',file);
  if(!fs.statSync(full).isFile()||!/\.(html|js|mjs|json|css|txt|svg)$/.test(file))continue;
  const text=fs.readFileSync(full,'utf8');
  const token=/\{\{[A-Z_]{2,32}\}\}/.exec(text);
  assert(!token,full+' contém um marcador por substituir: '+(token&&token[0]));
}
const source=fs.readFileSync('src/app.js','utf8');assert(!/type=["']password/.test(source),'No institutional password collection');
console.log(`Verified ${routes.length} HTML pages, ${checked} internal links/assets, IDs, metadata.`);

const content=JSON.parse(fs.readFileSync('dist/content-manifest.json','utf8'));
assert.equal(new Set(content.fields.map(f=>f.key)).size,content.fields.length,'Editable field keys must be unique');
for(const route of routes.filter(r=>!r.url.startsWith('/portal/')&&r.url!='/404/')){
 const html=fs.readFileSync(path.join('dist',route.url,'index.html'),'utf8');
 const metadata=html.split('</head>')[0];
 for(const key of [...metadata.matchAll(/(?:content|title):([a-f0-9]{16})/g)].map(m=>m[1]))assert(!html.includes('<!--site:'+key+'-->'),'Metadata must not share a text field: '+route.url);
}
console.log(`Verified ${content.fields.length} editable fields and isolated metadata bindings.`);
