import { build } from '../../node_modules/esbuild/lib/main.js';
import path from 'node:path';
import { access, mkdir, writeFile } from 'node:fs/promises';
const root = path.resolve(import.meta.dirname, '../..');
const validationOnly = process.argv.includes('--validate-only');
if (process.argv.slice(2).some(arg => arg !== '--validate-only')) throw new Error('Unsupported build option');
const out = path.join(root, 'mobile-flutter/build', validationOnly ? 'worker-check' : 'web');
if (!validationOnly) {
  await access(path.join(out, 'index.html')); // Must be produced by Flutter, never fabricated.
  await access(path.join(out, 'flutter_bootstrap.js'));
}
await mkdir(out, {recursive:true});
await build({entryPoints:[path.join(root,'mobile-flutter/staging/worker.ts')], bundle:true,
  format:'esm', platform:'node', target:'es2022', outfile:path.join(out,'_worker.js'),
  tsconfig:path.join(root,'tsconfig.json'), external:['node:*','cloudflare:workers'],
  alias:{'@tanstack/react-start/server':path.join(root,'mobile-flutter/staging/request-context.ts')}});
if (validationOnly) {
  await writeFile(path.join(out,'VALIDATION_ONLY.txt'),'Worker compilation only. No Flutter assets. Do not deploy this directory.\n');
}
console.log(validationOnly ? 'Worker compilation validated; no deployment assets.' : 'Flutter Web assets and Worker packaged.');
