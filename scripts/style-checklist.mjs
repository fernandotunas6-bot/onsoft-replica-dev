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
 * Uso normal: node scripts/style-checklist.mjs
 * Em PRs, STYLE_CHECK_CHANGED_FROM=<git-ref> limita falhas a ficheiros alterados
 * em relação à base, sem esconder a dívida visual histórica do projeto.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const CHANGED_FROM = process.env.STYLE_CHECK_CHANGED_FROM?.trim();

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

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function changedFilesFrom(ref) {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", `${ref}...HEAD`, "--", "src"],
      { cwd: ROOT, encoding: "utf8" },
    );

    return new Set(
      output
        .split(/\r?\n/)
        .map((path) => normalizePath(path.trim()))
        .filter(Boolean),
    );
  } catch (error) {
    console.error(`Não foi possível calcular ficheiros alterados desde ${ref}.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

const changedFiles = CHANGED_FROM ? changedFilesFrom(CHANGED_FROM) : null;

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

function reportIssue(rel, message) {
  if (!changedFiles || changedFiles.has(normalizePath(rel))) {
    issues.push(`${rel}: ${message}`);
  }
}

for (const file of files) {
  const rel = relative(ROOT, file);
  const code = readFileSync(file, "utf8");
  const isRoute = /src[\\/]routes[\\/]/.test(rel) && !/__root|api[\\/]/.test(rel);
  // Public forms, redirects and downloaded feeds deliberately do not use the admin shell.
  const routeStyleExempt = /style-check: route-exempt/.test(code);
  const hasJsx = /<[A-Za-z]/.test(code);

  // 1. chips de ícone / componentes de estilo
  if (isRoute && hasJsx && !routeStyleExempt) {
    routes += 1;
    if (/IconChip|PageHeader|StatGrid|<Panel/.test(code)) styled += 1;
    else reportIssue(rel, "rota sem IconChip/PageHeader/Panel/StatGrid");
  }

  // 2. imagens sem MediaFrame
  const rawImg = code.match(/<img\s/g);
  if (rawImg && !/MediaFrame|MediaAvatar/.test(code)) {
    reportIssue(rel, "<img> cru — usar MediaFrame/MediaAvatar");
  }

  // 3. cores fora da paleta
  for (const re of BANNED_COLOR) {
    const found = code.match(re);
    if (found) {
      reportIssue(rel, `cor fora da paleta -> ${[...new Set(found)].join(", ")}`);
    }
  }
}

console.log(`Ficheiros analisados: ${files.length}`);
console.log(`Rotas com sistema de estilo: ${styled}/${routes}`);

if (changedFiles) {
  console.log(
    `Modo incremental: ${changedFiles.size} ficheiro(s) em src alterado(s) desde ${CHANGED_FROM}.`,
  );
}

if (issues.length) {
  console.log("\nLacunas encontradas:");
  for (const i of issues) console.log(" - " + i);
  process.exit(1);
}

if (changedFiles) {
  console.log("\nOK — nenhuma nova lacuna de estilo nos ficheiros alterados.");
} else {
  console.log("\nOK — IconChip/MediaFrame aplicados em 100% e paleta intacta.");
}
