import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  const items = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      items.map(async (e) => (e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name])),
    )
  ).flat();
}
const files = (await walk("dist")).filter((f) => !f.endsWith("sw.js"));
const hash = createHash("sha256");
for (const f of files) hash.update(await readFile(f));
const version = hash.digest("hex").slice(0, 16);
const assets = files.map((f) => "./" + f.slice(5));
await writeFile(
  "dist/sw.js",
  `const CACHE='siga-mobile-v4-${version}';
const ASSETS=${JSON.stringify(assets)};
const urls=new Set(ASSETS.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('siga-mobile-v4-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
// Only immutable shell files; never cache sessions, API responses or school records.
if(urls.has(u.href)){e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||fetch(e.request)));return;}
if(e.request.mode==='navigate'&&(u.pathname===new URL(self.registration.scope).pathname||u.href===new URL('index.html',self.registration.scope).href)){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(new URL('index.html',self.registration.scope).href))));}
});\n`,
);
console.log("PWA shell generated: " + assets.length + " files. API data excluded.");
