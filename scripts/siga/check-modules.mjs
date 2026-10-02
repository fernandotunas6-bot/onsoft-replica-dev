#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(resolve(root, "scripts/siga/modules.json"), "utf8"));

const navInfra = [
  "src/features/auth/navigation-catalog.ts",
  "src/features/auth/portal-engine.ts",
  "src/features/auth/route-inventory.ts",
  "src/features/integrations/launcher-types.ts",
  "tests/auth/navigation-catalog.test.ts",
];

/**
 * Quantos módulos o catálogo tem de declarar para este script valer alguma coisa.
 *
 * Sem isto, um `modules.json` vazio — truncado, mal fundido, ou com a chave `modules`
 * renomeada para algo que devolva `[]` — faz o ciclo não correr, `missing` ficar a zero, e
 * o script imprimir «Inventário completo» e sair com 0. Ou seja, o portão passa a verde
 * por não ter verificado nada, que é a pior maneira de falhar: silenciosa e tranquilizante.
 *
 * O número é o que existe hoje (18) com folga para baixo. Se um módulo for mesmo removido,
 * baixe-se o limiar no mesmo commit — é essa a conversa que se quer ter.
 */
const MINIMO_MODULOS = 14;

let missing = 0;
let ficheirosVerificados = navInfra.length;

const modulos = catalog.modules ?? [];
if (modulos.length < MINIMO_MODULOS) {
  console.error(
    `✗ o catálogo declara ${modulos.length} módulo(s), menos do que o mínimo de ` +
      `${MINIMO_MODULOS}. Não é um inventário completo — é um inventário vazio a fingir ` +
      `que está. Verifique scripts/siga/modules.json.`,
  );
  process.exit(1);
}

for (const file of navInfra) {
  if (!existsSync(resolve(root, file))) {
    missing += 1;
    console.log(`✗ nav infra missing ${file}`);
  }
}

for (const mod of modulos) {
  const files = [...(mod.routes ?? []), ...(mod.feature ?? []), ...(mod.tests ?? [])];
  ficheirosVerificados += files.length + 1; // +1 pelo SKILL.md
  const absent = files.filter((file) => !existsSync(resolve(root, file)));
  const skill = `.cursor/skills/${mod.skill}/SKILL.md`;
  if (!existsSync(resolve(root, skill))) absent.push(skill);
  if (absent.length) {
    missing += absent.length;
    console.log(`✗ ${mod.id}`);
    for (const file of absent) console.log(`    missing ${file}`);
  } else {
    const navHint = mod.navPath
      ? ` → ${mod.navPath}`
      : mod.publicPath
        ? ` (public ${mod.publicPath})`
        : "";
    console.log(`✓ ${mod.id}  (${mod.skill})${navHint}`);
  }
}

console.log(
  missing
    ? `\n${missing} ficheiro(s) em falta. Correr também: npm run siga:check-nav`
    : `\nInventário completo: ${modulos.length} módulos, ${ficheirosVerificados} ficheiro(s) verificados. Correr: npm run siga:check-nav`,
);
process.exit(missing ? 1 : 0);
