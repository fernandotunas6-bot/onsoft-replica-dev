import { build } from '../../node_modules/esbuild/lib/main.js';
import path from 'node:path';
import { access } from 'node:fs/promises';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'mobile-flutter/build/web');
await access(path.join(out,'index.html')); // Require an actual Flutter Web build first.
await build({entryPoints:[path.join(root,'mobile-flutter/staging/worker.ts')],bundle:true,
 format:'esm',platform:'node',target:'es2022',outfile:path.join(out,'_worker.js'),
 tsconfig:path.join(root,'tsconfig.json'),external:['node:*','cloudflare:workers'],
 alias:{'@tanstack/react-start/server':path.join(root,'mobile-flutter/staging/request-context.ts')}});
