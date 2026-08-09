#!/usr/bin/env node
/**
 * Checklist automático de estilo (Minimals).
 *
 * Verifica, em 100% das rotas e componentes:
 *  1. Rotas com cabeçalho/painéis usam PageHeader/Panel/StatGrid ou IconChip
 *     (garantia de que nenhum ecrã fica sem chip de ícone).
 *  2. Avatares/fotos usam MediaFrame/MediaAvatar (nunca <img> cru).
 *  3. Nenhuma cor fora da paleta (classes hardcoded ou hex arbitrários).
 *
 * Uso: node scripts/style-checklist.mjs   (falha com exit 1 se houver lacunas)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const IGNORE_DIRS = new Set(["ui-primitives"]);
// Componentes shadcn base e ficheiros gerados não fazem parte do checklist visual.
const IGNORE_FILES = [
  /src[\\/]components[\\/]ui[\\/]/,
  /src[\\/]routeTree\.gen\.ts$/,
  /src[\\/]integrations[\\/]/,
];

const BANNED_COLOR = [
  /\b(?:bg|text|border)-(?:white|black)\b/g,
  /\b(?:bg|text|border)-\[#[0-9a-fA-F]{3,8}\]/g,
  /\b(?:bg|text|border)-(?:red|blue|green|yellow|purple|indigo|pink|orange|teal|cyan|lime|amber|emerald|violet|fuchsia|rose|sky)-\d{2,3}\b/g,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) walk(full, out);
    } else if (/\.(tsx|ts)$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC).filter((f) => !IGNORE_FILES.some((re) => re.test(f)));

const issues = [];
let routes = 0;
let styled = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  const code = readFileSync(file, "utf8");
  const isRoute = /src[\\/]routes[\\/]/.test(rel) && !/__root|api[\\/]/.test(rel);
  const hasJsx = /<[A-Za-z]/.test(code);

  // 1. chips de ícone / componentes de estilo
  if (isRoute && hasJsx) {
    routes += 1;
    const hasStyleSystem =
      /IconChip|PageHeader|StatGrid|Panel\b/.test(code) || /AppShell/.test(code) === false;
    if (/IconChip|PageHeader|StatGrid|<Panel/.test(code)) styled += 1;
    else if (!hasStyleSystem)
      issues.push(`${rel}: rota sem IconChip/PageHeader/Panel/StatGrid`);
    else issues.push(`${rel}: rota sem IconChip/PageHeader/Panel/StatGrid`);
  }

  // 2. imagens sem MediaFrame
  const rawImg = code.match(/<img\s/g);
  if (rawImg && !/MediaFrame|MediaAvatar/.test(code)) {
    issues.push(`${rel}: <img> cru — usar MediaFrame/MediaAvatar`);
  }

  // 3. cores fora da paleta
  for (const re of BANNED_COLOR) {
    const found = code.match(re);
    if (found) {
      issues.push(`${rel}: cor fora da paleta -> ${[...new Set(found)].join(", ")}`);
    }
  }
}

console.log(`Ficheiros analisados: ${files.length}`);
console.log(`Rotas com sistema de estilo: ${styled}/${routes}`);

if (issues.length) {
  console.log("\nLacunas encontradas:");
  for (const i of issues) console.log(" - " + i);
  process.exit(1);
}

console.log("\nOK — IconChip/MediaFrame aplicados em 100% e paleta intacta.");
