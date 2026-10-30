#!/usr/bin/env node
// Confirma que as leituras do worker (/api/sga) só usam tabelas e colunas que
// existem em produção, segundo supabase/PRODUCTION_SNAPSHOT.json. Não liga à base.
//   node scripts/verificar-colunas-sga.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = JSON.parse(readFileSync(join(root, '../../supabase/PRODUCTION_SNAPSHOT.json'), 'utf8'));
const cols = new Map(snapshot.tabelas.map((t) => [t.tabela, new Set(t.colunas)]));
const relations = new Set(snapshot.relacoes.map((r) => r.chave));

const src = join(root, 'school-worker/src');
const files = [
  ...readdirSync(join(src, 'sga')).filter((f) => f.endsWith('.ts')).map((f) => join(src, 'sga', f)),
  join(src, 'api/sga.ts'),
];

let calls = 0;
const problems = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const call = /\.(select|selectAll|selectIn)(?:<[^>]*>)?\(\s*'([a-z_]+)'\s*,/g;
  for (let m; (m = call.exec(text)); ) {
    calls++;
    const [, kind, table] = m;
    const where = `${file.slice(root.length + 1)}:${text.slice(0, m.index).split('\n').length}`;
    // Argumentos até ao parêntese que fecha a chamada.
    let i = m.index + m[0].length;
    for (let depth = 1; depth && i < text.length; i++) depth += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0;
    const args = text.slice(m.index + m[0].length, i - 1);
    const known = cols.get(table);
    if (!known) {
      problems.push(`${where} tabela ${table} não existe`);
      continue;
    }
    const used = new Set();
    const select = args.match(/select:\s*['`]([^'`]+)['`]/);
    if (select) {
      for (const fk of select[1].matchAll(/![a-z_]+/g)) {
        if (!relations.has(fk[0].slice(1))) problems.push(`${where} relação ${fk[0].slice(1)} não existe`);
      }
      const flat = select[1].replace(/[a-z_]+(?:![a-z_]+)?\([^()]*\)/g, '');
      for (const c of flat.split(',')) {
        const name = c.split(':').pop().trim();
        if (name && name !== '*') used.add(name);
      }
    }
    for (const k of args.matchAll(/^\s*'?([a-z_]+)'?\s*:/gm)) {
      if (!['select', 'order', 'limit', 'offset', 'or', 'and'].includes(k[1])) used.add(k[1]);
    }
    const order = args.match(/order:\s*'([a-z_]+)/);
    if (order) used.add(order[1]);
    if (kind === 'selectIn') {
      const column = args.match(/^\s*'([a-z_]+)'/);
      if (column) used.add(column[1]);
    }
    for (const c of used) if (!known.has(c)) problems.push(`${where} ${table}.${c} não existe`);
  }
}

console.log(`${calls} leituras verificadas (esquema de ${snapshot.capturadoEm}).`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('Tudo existe em produção.');
