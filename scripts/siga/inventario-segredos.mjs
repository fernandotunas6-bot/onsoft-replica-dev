#!/usr/bin/env node
/**
 * Diz quais dos segredos que o código conhece estão de facto definidos nos
 * Workers, e quais deles não têm cópia nenhuma fora da Cloudflare.
 *
 * Nasceu a 30/10/2026. O ambiente GitHub `production` foi limpo e, com ele,
 * a única cópia de vários segredos: a Cloudflare guarda-os cifrados e **nunca
 * devolve o valor** (`wrangler secret put` põe, `secret list` só lista nomes).
 * Antes disto não havia forma de saber o que se tinha perdido, nem sequer o que
 * estava lá.
 *
 * Só lê. Imprime nomes e estado; **nunca** valores, nem comprimentos.
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/siga/inventario-segredos.mjs
 *
 * O token precisa de «Workers Scripts: Read» na conta do SIGA.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPTIONAL_WORKER_SECRETS, REQUIRED_WORKER_SECRETS } from "../worker-secrets.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const WORKERS = [
  { rotulo: "SIGA", script: "fernandotunas6-bot-onsoft-replica-dev" },
  { rotulo: "PayFlow", script: "siga-plus-payflow" },
];

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error(
    "Falta CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID.\n" +
      "Sem eles não há como perguntar à Cloudflare o que está definido.",
  );
  process.exit(2);
}

/** Nomes dos segredos definidos num Worker. `null` se a Cloudflare não respondeu. */
function nomesDefinidos(script) {
  try {
    const saida = execFileSync(
      "npx",
      ["wrangler", "secret", "list", "--name", script, "--format", "json"],
      { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const inicio = saida.indexOf("[");
    if (inicio === -1) return null;
    const lista = JSON.parse(saida.slice(inicio));
    return new Set(lista.map((item) => item.name).filter(Boolean));
  } catch (erro) {
    console.error(`\n!! Não foi possível listar os segredos de ${script}.`);
    console.error(
      String(erro.stderr || erro.message || erro)
        .split("\n")
        .slice(0, 4)
        .join("\n"),
    );
    return null;
  }
}

/** Nomes com valor no `.env` da raiz — a única cópia local possível. */
function nomesNoEnv() {
  const ficheiro = path.resolve(raiz, ".env");
  if (!fs.existsSync(ficheiro)) return new Set();
  const nomes = new Set();
  for (const linha of fs.readFileSync(ficheiro, "utf8").split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i === -1) continue;
    if (limpa.slice(i + 1).trim()) nomes.add(limpa.slice(0, i).trim());
  }
  return nomes;
}

const conhecidos = [...REQUIRED_WORKER_SECRETS, ...OPTIONAL_WORKER_SECRETS];
const noEnv = nomesNoEnv();
const definidos = new Map();
for (const { rotulo, script } of WORKERS) definidos.set(rotulo, nomesDefinidos(script));

const falhou = [...definidos.values()].some((v) => v === null);

const marca = (conjunto, nome) => (conjunto === null ? " ? " : conjunto.has(nome) ? "sim" : " - ");

console.log(`\nSegredos que o código conhece: ${conhecidos.length}`);
console.log("(«sim» = definido na Cloudflare; valores nunca são lidos)\n");
console.log("  SIGA  PayFlow  .env   segredo");
console.log("  ----  -------  ----   -------");
for (const nome of conhecidos) {
  const siga = marca(definidos.get("SIGA"), nome);
  const pay = marca(definidos.get("PayFlow"), nome);
  const env = noEnv.has(nome) ? "sim " : " -  ";
  const obrigatorio = REQUIRED_WORKER_SECRETS.includes(nome) ? " *" : "";
  console.log(`  ${siga}    ${pay}     ${env}  ${nome}${obrigatorio}`);
}
console.log("\n  * obrigatório: sem ele a publicação não arranca.");

if (falhou) {
  console.log("\nUm dos Workers não respondeu; as colunas com «?» não foram medidas.");
  process.exit(1);
}

const semCopia = conhecidos.filter(
  (nome) => !noEnv.has(nome) && [...definidos.values()].some((conjunto) => conjunto?.has(nome)),
);

console.log(`\nDefinidos na Cloudflare e sem cópia em lado nenhum: ${semCopia.length}`);
for (const nome of semCopia) console.log(`  - ${nome}`);
if (semCopia.length) {
  console.log(
    "\nA Cloudflare não devolve estes valores. Para ter cópia, cada um tem de ser\n" +
      "obtido de novo em quem o emitiu (ou gerado de novo, nos que o projecto gera\n" +
      "a si mesmo) e guardado fora daqui — gestor de senhas, não um ficheiro no repo.",
  );
} else {
  console.log("\nNada definido na Cloudflare está sem cópia.");
}

const orfaos = [...(definidos.get("SIGA") ?? [])]
  .concat([...(definidos.get("PayFlow") ?? [])])
  .filter((nome) => !conhecidos.includes(nome));
if (orfaos.length) {
  console.log(
    `\nDefinidos na Cloudflare e que o código já não conhece: ${[...new Set(orfaos)].join(", ")}`,
  );
}
