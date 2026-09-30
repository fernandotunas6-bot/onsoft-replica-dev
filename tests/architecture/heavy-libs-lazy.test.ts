import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Gráficos (recharts), PDF (jspdf, html2canvas) e Excel (exceljs) só entram no
 * browser quando são usados. Um único import estático de um destes módulos —
 * nem que seja de um esqueleto ou de uma constante — puxa a biblioteca para o
 * pacote da página e anula o `lazy()` / `import()`.
 */

const root = resolve(import.meta.dirname, "../..");
const src = join(root, "src");

const HEAVY_LIBS = ["recharts", "jspdf", "jspdf-autotable", "exceljs", "html2canvas"];

/** Módulos que podem importar as bibliotecas; só se carregam com `import()`. */
const LAZY_MODULES = [
  "src/components/ui/chart.tsx",
  "src/features/dashboard/DashboardCharts.tsx",
  "src/features/academic/PedagogicaNotasCharts.tsx",
  "src/features/academic/RelatoriosAcademicosCharts.tsx",
  "src/features/finance/FinanceiroCashChart.tsx",
  "src/features/finance/RelatoriosFinanceirosCategoryCharts.tsx",
  "src/lib/export-pdf.ts",
  "src/features/import/export-engine.ts",
  "src/features/import/engine/parse.ts",
  "src/features/import/engine/excel-template-builder.ts",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Especificadores dos `import … from "x"` estáticos que trazem valores (não `import type`). */
function staticValueImports(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]!);
  const bare = /^import\s+"([^"]+)"/gm;
  for (const match of source.matchAll(bare)) specifiers.push(match[1]!);
  return specifiers;
}

const files = sourceFiles(src).map((path) => ({
  path: relative(root, path),
  imports: staticValueImports(readFileSync(path, "utf8")),
}));

/** "@/features/x" e "./x" → caminho relativo à raiz, sem extensão. */
function resolveSpecifier(from: string, specifier: string) {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (specifier.startsWith(".")) return relative(root, resolve(root, from, "..", specifier));
  return specifier;
}
const withoutExtension = (path: string) => path.replace(/\.(ts|tsx)$/, "");

describe("bibliotecas pesadas carregadas sob demanda", () => {
  it("só os módulos da lista importam recharts, jspdf, exceljs ou html2canvas", () => {
    const offenders = files
      .filter((file) => !LAZY_MODULES.includes(file.path))
      .filter((file) => file.imports.some((specifier) => HEAVY_LIBS.includes(specifier)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("ninguém importa esses módulos estaticamente", () => {
    const lazy = new Set(LAZY_MODULES.map(withoutExtension));
    const offenders = files.flatMap((file) =>
      file.imports
        .map((specifier) => resolveSpecifier(file.path, specifier))
        .filter((target) => lazy.has(target) && `${target}` !== withoutExtension(file.path))
        .map((target) => `${file.path} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });
});
