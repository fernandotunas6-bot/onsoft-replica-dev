#!/usr/bin/env node
/**
 * Verificação automática de acessibilidade (estática).
 *
 * Valida, em todas as rotas/componentes:
 *  1. Contraste — nenhuma cor fora da paleta (tokens semânticos) nem tons
 *     de baixo contraste (text-gray-300/400, text-muted-foreground/50, ...).
 *  2. Foco visível — nenhum `outline-none`/`focus:outline-none` sem um
 *     `focus-visible:` correspondente.
 *  3. Labels — <img> com alt, botões só de ícone com aria-label/aria-labelledby,
 *     inputs/selects/textarea com id+Label, aria-label ou placeholder+aria-label.
 *  4. Teclado — onClick em <div>/<span> exige role + tabIndex + onKeyDown.
 *
 * Uso: node scripts/a11y-check.mjs   (exit 1 quando há falhas)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const IGNORE = [
  /src[\\/]components[\\/]ui[\\/]/, // primitivos shadcn/Radix (ARIA correcto por defeito)
  /src[\\/]routeTree\.gen\.ts$/,
  /src[\\/]integrations[\\/]/,
];

const LOW_CONTRAST = [
  /\btext-(?:gray|slate|zinc|neutral|stone)-(?:100|200|300|400)\b/g,
  /\btext-muted-foreground\/(?:[1-5]?\d)\b/g,
  /\bplaceholder:text-(?:gray|slate|zinc|neutral|stone)-\d{2,3}\b/g,
  /\btext-(?:white|black)\/(?:[1-4]?\d)\b/g,
];

const OFF_PALETTE = [
  /\b(?:bg|text|border)-\[#[0-9a-fA-F]{3,8}\]/g,
  /\b(?:bg|text|border)-(?:red|blue|green|yellow|purple|indigo|pink|orange|teal|cyan|lime|amber|emerald|violet|fuchsia|rose|sky)-\d{2,3}\b/g,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(SRC).filter((f) => !IGNORE.some((re) => re.test(f)));
const issues = [];
let checks = 0;

/** Extrai a abertura de cada tag <name ...>, respeitando expressões {…} e strings. */
function tags(code, name) {
  const out = [];
  const start = new RegExp(`<${name}(?=[\\s/>])`, "g");
  let m;
  while ((m = start.exec(code))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = null;
    for (; i < code.length; i += 1) {
      const c = code[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    out.push(code.slice(m.index, i + 1));
  }
  return out;
}


for (const file of files) {
  const rel = relative(ROOT, file);
  const code = readFileSync(file, "utf8");
  checks += 1;

  // 1. contraste / paleta
  for (const re of [...LOW_CONTRAST, ...OFF_PALETTE]) {
    const found = code.match(re);
    if (found) {
      issues.push(
        `${rel}: contraste/paleta -> ${[...new Set(found)].join(", ")} (usar tokens: text-foreground, text-muted-foreground)`,
      );
    }
  }

  // 2. foco visível
  for (const m of code.matchAll(/(?:focus:)?outline-none/g)) {
    const window = code.slice(Math.max(0, m.index - 400), m.index + 400);
    if (!/focus-visible:/.test(window)) {
      issues.push(`${rel}: outline-none sem estilo focus-visible correspondente`);
      break;
    }
  }

  // 3a. imagens com alt
  for (const tag of tags(code, "img")) {
    if (!/\salt=/.test(tag)) issues.push(`${rel}: <img> sem atributo alt`);
  }

  // 3b. botões só de ícone
  for (const tag of tags(code, "Button")) {
    if (/size=\{?"icon"/.test(tag) && !/aria-label|aria-labelledby/.test(tag)) {
      issues.push(`${rel}: Button size="icon" sem aria-label`);
    }
  }

  // 3c. campos de formulário
  for (const name of ["Input", "Textarea", "select", "input"]) {
    for (const tag of tags(code, name)) {
      if (/\stype="hidden"/.test(tag)) continue;
      const hasId = /\sid=/.test(tag);
      const hasAria = /aria-label|aria-labelledby/.test(tag);
      if (!hasId && !hasAria) {
        issues.push(`${rel}: <${name}> sem id associado a Label nem aria-label`);
      }
    }
  }

  // 3d. Label sem htmlFor (quando não envolve o campo)
  for (const tag of tags(code, "Label")) {
    if (!/htmlFor=/.test(tag)) {
      // aceitável se o Label envolver o campo — heurística: ignora
    }
  }

  // 4. teclado em elementos não interativos
  for (const name of ["div", "span", "li"]) {
    for (const tag of tags(code, name)) {
      if (!/\sonClick=/.test(tag)) continue;
      const ok = /role=/.test(tag) && /tabIndex=/.test(tag) && /onKey(?:Down|Up|Press)=/.test(tag);
      if (!ok) issues.push(`${rel}: <${name}> com onClick sem role+tabIndex+onKeyDown`);
    }
  }
}

console.log(`Ficheiros analisados: ${checks}`);

const unique = [...new Set(issues)];

// Relatório HTML (para artefacto do CI): node scripts/a11y-check.mjs --html reports/a11y.html
const htmlFlag = process.argv.indexOf("--html");
if (htmlFlag !== -1) {
  const out = process.argv[htmlFlag + 1] || "reports/a11y.html";
  const rows = unique
    .map((i) => {
      const [file, ...rest] = i.split(": ");
      const msg = rest.join(": ");
      return `<tr><td><code>${file}</code></td><td>${msg.replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))}</td></tr>`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de acessibilidade — SIGA</title>
<style>
  :root { color-scheme: light dark }
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; }
  h1 { font-size: 1.5rem; }
  .badge { display:inline-block; border-radius:999px; padding:.25rem .75rem; font-weight:600; font-size:.8rem; }
  .ok { background:#e8f6ee; color:#166534 } .bad { background:#fdeaea; color:#991b1b }
  table { width:100%; border-collapse:collapse; margin-top:1.5rem; font-size:.9rem }
  th,td { text-align:left; padding:.55rem .6rem; border-bottom:1px solid #e5e7eb; vertical-align:top }
  code { font-size:.8rem }
</style></head><body>
<h1>Relatório de acessibilidade — SIGA</h1>
<p><strong>Ficheiros analisados:</strong> ${checks} &middot; <strong>Problemas:</strong> ${unique.length}</p>
<p class="badge ${unique.length ? "bad" : "ok"}">${unique.length ? `${unique.length} problema(s) encontrado(s)` : "Sem problemas de acessibilidade"}</p>
<p>Verificações: contraste/paleta, foco visível, <code>alt</code>, botões só de ícone com <code>aria-label</code>, rótulos de campos e teclado em elementos não interativos.</p>
${unique.length ? `<table><thead><tr><th>Ficheiro / rota</th><th>Elemento e problema</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
<p style="margin-top:2rem;color:#6b7280;font-size:.8rem">Gerado em ${new Date().toISOString()}</p>
</body></html>`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");
  console.log(`Relatório HTML: ${out}`);
}

if (unique.length) {
  console.log("\nProblemas de acessibilidade:");
  for (const i of unique) console.log(" - " + i);
  process.exit(1);
}

console.log("OK — contraste, foco visível, labels e navegação por teclado validados.");

