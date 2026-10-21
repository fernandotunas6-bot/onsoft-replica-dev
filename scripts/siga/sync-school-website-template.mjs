import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:path.join(root,'painel/escolas'),stdio:'inherit'});
fs.copyFileSync(path.join(root,'painel/escolas/dist/content-manifest.json'),path.join(root,'src/features/school-website/template.json'));
console.log('Modelo público do website sincronizado com o editor SIGA.');
